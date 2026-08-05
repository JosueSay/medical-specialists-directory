import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn('border-border bg-surface rounded-lg border shadow-sm', className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="border-border border-b px-5 py-4">
      <h2 className="text-content text-base font-semibold">{title}</h2>
      {description ? <p className="text-content-muted mt-1 text-sm">{description}</p> : null}
    </header>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}
