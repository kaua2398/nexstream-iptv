# NexStream IPTV

NexStream é um player pessoal para contas Xtream Codes autorizadas. O projeto usa Next.js 15, React 19, Express, PostgreSQL, HLS.js e Docker, com uma arquitetura em que o navegador nunca recebe as credenciais do provedor nem a URL real dos streams.

> Use apenas com serviços e conteúdos que você tenha autorização para acessar. O projeto não contorna DRM, geobloqueio ou controles do provedor.

## Estado atual

Este repositório contém o primeiro marco funcional da aplicação:

- login Xtream validado pelo backend;
- credenciais efêmeras em memória ou persistentes com AES-256-GCM;
- access token JWT em cookie HttpOnly;
- refresh token opaco com rotação e detecção de reutilização;
- proteção CSRF e validação de Origin;
- bloqueio de SSRF contra loopback, redes privadas, link-local e metadata;
- catálogo inicial de TV, filmes e séries;
- IDs internos criptografados e vinculados ao usuário;
- proxy autenticado de imagens;
- tokens temporários de reprodução;
- proxy de HLS, reescrita de manifestos e proxy de segmentos;
- suporte a VOD/Range requests;
- player HLS.js com fullscreen, PiP, mini player e atalhos;
- favoritos e histórico isolados por usuário;
- PWA básica e cache somente de imagens internas;
- Docker, Nginx, PostgreSQL e testes iniciais de segurança.

Ainda serão expandidos: EPG completo, detalhes de filmes, temporadas/episódios, busca global paginada, infinite scroll, virtualização, qualidade manual, legendas, internacionalização e suíte de testes end-to-end.

## Arquitetura

```text
Browser
  │ cookies HttpOnly + CSRF
  ▼
Nginx ─────────► Next.js
  │
  └────────────► Express API
                    │
                    ├── PostgreSQL
                    ├── Credential Vault (AES-256-GCM)
                    ├── SSRF Guard
                    ├── Xtream Adapter
                    ├── Image Proxy
                    └── Stream/HLS Proxy ─► Xtream provider
```

O frontend usa apenas IDs opacos. O backend descriptografa as credenciais somente quando precisa montar uma chamada ao provedor.

## Estrutura

```text
apps/web       Next.js 15, React 19, TanStack Query, Zustand, HLS.js
apps/api       Express, autenticação, segurança, integração e proxy
packages/shared DTOs e schemas compartilhados
prisma         schema PostgreSQL
nginx          reverse proxy
```

## Requisitos

- Node.js 22
- pnpm 10
- Docker e Docker Compose
- OpenSSL para gerar chaves

## Configuração local

```bash
cp .env.example .env
mkdir -p secrets
printf 'nexstream\n' > secrets/postgres_password.txt
```

Gere cada chave separadamente:

```bash
openssl rand -hex 32
openssl rand -base64 32
```

Use uma saída hexadecimal longa para `ACCESS_TOKEN_SECRET` e `REFRESH_TOKEN_PEPPER`. Gere quatro saídas Base64 independentes para:

- `CREDENTIAL_ENCRYPTION_KEY_BASE64`
- `OPAQUE_ID_ENCRYPTION_KEY_BASE64`
- `RESOURCE_TOKEN_ENCRYPTION_KEY_BASE64`
- `IMAGE_TOKEN_ENCRYPTION_KEY_BASE64`

Nunca reutilize a mesma chave entre essas funções.

Para desenvolvimento local, mantenha:

```dotenv
NODE_ENV=development
WEB_ORIGIN=http://localhost:3000
COOKIE_SECURE=false
DATABASE_URL=postgresql://nexstream:nexstream@postgres:5432/nexstream?schema=public
```

## Desenvolvimento com Docker

```bash
docker compose -f docker-compose.dev.yml up
```

Em outro terminal, execute a migration inicial:

```bash
docker compose -f docker-compose.dev.yml exec api pnpm db:migrate
```

Acesse `http://localhost:3000`.

## Desenvolvimento sem Docker

Suba um PostgreSQL e ajuste `DATABASE_URL`. Depois:

```bash
corepack enable
pnpm install
# O primeiro install gera pnpm-lock.yaml; versione o arquivo antes do primeiro merge.
pnpm db:generate
pnpm db:migrate
pnpm dev
```

## Testes

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Build

```bash
pnpm build
```

## Produção

A configuração de produção deve ficar atrás de HTTPS. Defina:

```dotenv
NODE_ENV=production
WEB_ORIGIN=https://iptv.seudominio.com
COOKIE_SECURE=true
```

Depois:

```bash
docker compose up -d --build
```

O Compose expõe o Nginx localmente na porta `3000`. Em produção, coloque-o atrás de um proxy TLS ou altere o mapeamento conforme sua infraestrutura. Não habilite `COOKIE_SECURE=false` em um domínio público.

## Rotas principais

```text
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
GET    /api/v1/auth/me
POST   /api/v1/auth/logout
GET    /api/v1/catalog/home
POST   /api/v1/playback/token
GET    /api/v1/playback/stream/:token
GET    /api/v1/playback/segment
GET    /api/v1/images/:token
GET    /api/v1/library/favorites
PUT    /api/v1/library/favorites
DELETE /api/v1/library/favorites/:mediaId
GET    /api/v1/library/history
PUT    /api/v1/library/history
DELETE /api/v1/library/history
```

## Modelo de segurança

### Credenciais

- credenciais Xtream nunca são retornadas ao frontend;
- sem “lembrar acesso”, permanecem apenas no cache em memória da API;
- com “lembrar acesso”, são criptografadas com AES-256-GCM;
- a chave de criptografia fica fora do banco e do repositório;
- logs removem cabeçalhos e campos sensíveis.

### Sessões

- access token JWT curto;
- cookies HttpOnly;
- refresh token opaco, armazenado apenas como HMAC no banco;
- rotação obrigatória;
- reutilização de token revoga a sessão;
- logout revoga refresh tokens e tokens de reprodução;
- CSRF double-submit e validação de Origin.

### SSRF

A API aceita somente HTTP/HTTPS e bloqueia:

- localhost e loopback;
- redes privadas IPv4;
- link-local;
- IPv6 local/privado;
- endereços de metadata conhecidos;
- credenciais embutidas na URL;
- redirecionamentos automáticos.

### Streaming

- o navegador recebe somente uma rota interna;
- tokens de reprodução expiram rapidamente;
- HLS é reescrito para rotas internas;
- segmentos usam payloads AES-GCM vinculados ao usuário e sessão;
- streams não são armazenados permanentemente;
- respostas usam cache privado ou `no-store`;
- há limite de reproduções simultâneas por sessão.

## Limitações do marco inicial

- cache e credenciais efêmeras estão em memória de uma única instância;
- escalar horizontalmente exigirá Redis ou outro armazenamento compartilhado;
- a estratégia atual rejeita redirecionamentos do provedor; provedores que dependam deles precisarão de validação segura de cada salto;
- listas muito grandes ainda precisam de paginação/virtualização no backend e frontend;
- séries ainda precisam da tela de detalhes, temporadas e episódios;
- EPG ainda precisa das rotas e telas dedicadas;
- o proxy de mídia deve passar por testes de carga antes de uso intenso;
- chaves criptográficas ainda não possuem rotação automatizada.

## Checklist antes de publicar

- [ ] Gerar todas as chaves com valores independentes
- [ ] Não versionar `.env` nem a pasta `secrets`
- [ ] Usar HTTPS e `COOKIE_SECURE=true`
- [ ] Configurar backups criptografados do PostgreSQL
- [ ] Executar lint, typecheck e testes
- [ ] Executar scanner de secrets
- [ ] Executar scan das imagens Docker
- [ ] Configurar retenção de logs
- [ ] Revisar limites de streams e banda
- [ ] Validar os termos do provedor

## Publicar no GitHub

Para enviar esta árvore a um repositório já criado:

```bash
git init -b main
git add .
git commit -m "feat: bootstrap secure NexStream IPTV"
git remote add origin https://github.com/kaua2398/nexstream-iptv.git
git push -u origin main
```
