import type { ReactNode } from 'react';
import { AlertTriangle, Info, SearchX } from 'lucide-react';
import { cn } from '@/utils/cn';

type AlertTone = 'danger' | 'warning' | 'info';

const TONE_CLASSES: Record<AlertTone, string> = {
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-brand-soft text-brand',
};

export interface AlertProps {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
}

/**
 * Mensaje de estado. Los tres estados que la UI debe distinguir (error de
 * permisos, error de validacion y lista vacia) usan tono e icono distintos, no
 * solo color, para no depender de la percepcion cromatica.
 */
export function Alert({ tone = 'info', title, children }: AlertProps) {
  const Icon = tone === 'danger' ? AlertTriangle : Info;

  return (
    <div className={cn('flex gap-3 rounded-md px-4 py-3 text-sm', TONE_CLASSES[tone])} role="alert">
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-medium">{title}</p>
        {children ? <div className="mt-1 opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-content-muted flex flex-col items-center gap-2 py-12 text-center">
      <SearchX size={28} aria-hidden="true" />
      <p className="text-content text-sm font-medium">{title}</p>
      <p className="max-w-sm text-sm">{description}</p>
    </div>
  );
}
