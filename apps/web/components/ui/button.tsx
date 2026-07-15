import * as React from 'react';
import { cn } from '@/services/utils';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function Button({ className, variant = 'primary', ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' && 'bg-primary text-white hover:brightness-110',
        variant === 'secondary' && 'bg-white/15 text-white backdrop-blur hover:bg-white/25',
        variant === 'ghost' && 'text-foreground hover:bg-muted',
        className,
      )}
      {...props}
    />
  );
}
