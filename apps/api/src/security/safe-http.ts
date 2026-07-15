import axios, {
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';
import { AppError } from '../utils/errors.js';
import { validatePublicHttpUrl } from './ssrf.js';

const redirectStatuses = new Set([
  301,
  302,
  303,
  307,
  308,
]);

function disposeResponseBody(body: unknown): void {
  if (
    typeof body === 'object' &&
    body !== null &&
    'destroy' in body &&
    typeof (body as { destroy?: unknown }).destroy ===
      'function'
  ) {
    (body as { destroy: () => void }).destroy();
  }
}

export async function axiosGetWithValidatedRedirects<T>(
  input: string | URL,
  config: Omit<
    AxiosRequestConfig,
    | 'url'
    | 'method'
    | 'maxRedirects'
    | 'validateStatus'
  > = {},
  maxRedirects = 4,
): Promise<{
  response: AxiosResponse<T>;
  finalUrl: URL;
}> {
  let current =
    input instanceof URL
      ? new URL(input)
      : new URL(input);

  for (
    let redirectCount = 0;
    redirectCount <= maxRedirects;
    redirectCount += 1
  ) {
    /*
     * Valida protocolo, hostname e todos os IPs
     * resolvidos antes de cada conexão.
     */
    const validated =
      await validatePublicHttpUrl(current);

    const response = await axios.get<T>(
      validated.url.toString(),
      {
        ...config,
        maxRedirects: 0,
        validateStatus: (status) =>
          (status >= 200 && status < 300) ||
          redirectStatuses.has(status),
      },
    );

    if (!redirectStatuses.has(response.status)) {
      return {
        response,
        finalUrl: validated.url,
      };
    }

    disposeResponseBody(response.data);

    const location = response.headers.location;

    if (!location) {
      throw new AppError(
        502,
        'INVALID_UPSTREAM_REDIRECT',
        'O servidor de mídia enviou um redirecionamento inválido.',
      );
    }

    if (redirectCount >= maxRedirects) {
      throw new AppError(
        502,
        'TOO_MANY_UPSTREAM_REDIRECTS',
        'O servidor de mídia realizou redirecionamentos demais.',
      );
    }

    const next = new URL(
      location,
      validated.url,
    );

    /*
     * Impede que uma origem HTTPS redirecione silenciosamente
     * para uma conexão HTTP sem criptografia.
     */
    if (
      validated.url.protocol === 'https:' &&
      next.protocol === 'http:'
    ) {
      throw new AppError(
        502,
        'UNSAFE_UPSTREAM_REDIRECT',
        'O servidor de mídia enviou um redirecionamento inseguro.',
      );
    }

    current = next;
  }

  throw new AppError(
    502,
    'UPSTREAM_REDIRECT_FAILED',
    'Não foi possível acessar o servidor de mídia.',
  );
}