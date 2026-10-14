import type { ButtonHTMLAttributes } from 'react';
import { playUiClick } from '@/game/audio';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  small?: boolean;
}

/** Sprite-based action button (assets/png/default/ui/menu). */
export function Button({ variant = 'primary', small, className = '', onClick, ...rest }: Props) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${small ? 'btn-small' : ''} ${className}`}
      onClick={(e) => {
        playUiClick();
        onClick?.(e);
      }}
      {...rest}
    />
  );
}
