import type { HTMLAttributes } from 'react';

export function Panel({ className = '', children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={`panel ${className}`} {...rest}>
      <div className="panel-inner">{children}</div>
    </section>
  );
}
