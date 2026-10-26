import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/utils';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
  ref?: Ref<HTMLButtonElement>;
};

export function Button({ className, variant = 'primary', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn('button', `button-${variant}`, className)} {...props} />;
}
