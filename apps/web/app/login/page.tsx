'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LockKeyhole, Server } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { loginRequestSchema, type LoginRequest } from '@nexstream/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/services/api';

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { serverUrl: '', username: '', password: '', remember: false },
  });

  const submit = handleSubmit(async (data) => {
    setError(null);
    try {
      await api.post('/auth/login', data);
      router.replace('/dashboard');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.');
    }
  });

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,35,60,.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(71,85,255,.16),transparent_35%)]" />
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-3xl border bg-card/85 p-7 shadow-glow backdrop-blur-xl sm:p-9"
      >
        <div className="mb-8">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-primary">NexStream</p>
          <h1 className="text-3xl font-bold tracking-tight">Entre no seu servidor</h1>
          <p className="mt-2 text-sm text-foreground/60">
            As credenciais são processadas pelo backend e nunca ficam salvas no navegador.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Servidor</span>
            <div className="relative">
              <Server className="absolute left-3 top-3.5 size-5 text-foreground/40" />
              <Input className="pl-11" placeholder="https://servidor.exemplo" {...register('serverUrl')} />
            </div>
            {errors.serverUrl && <small className="text-primary">Informe uma URL válida.</small>}
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Usuário</span>
            <Input autoComplete="username" {...register('username')} />
            {errors.username && <small className="text-primary">Informe o usuário.</small>}
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Senha</span>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-3.5 size-5 text-foreground/40" />
              <Input
                className="px-11"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                {...register('password')}
              />
              <button
                type="button"
                className="absolute right-3 top-3.5 text-foreground/50"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
            {errors.password && <small className="text-primary">Informe a senha.</small>}
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-muted/60 p-3 text-sm">
            <input type="checkbox" className="mt-1 accent-primary" {...register('remember')} />
            <span>
              <strong className="block">Lembrar acesso</strong>
              <span className="text-foreground/55">Criptografa as credenciais somente no backend.</span>
            </span>
          </label>

          {error && <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">{error}</p>}
          <Button className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Validando…' : 'Entrar'}
          </Button>
        </form>
      </motion.section>
    </main>
  );
}
