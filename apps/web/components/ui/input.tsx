import * as React from 'react';
import { cn } from '@/services/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-12 w-full rounded-lg border bg-black/20 px-4 text-sm text-foreground placeholder:text-foreground/45 focus:border-primary',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
