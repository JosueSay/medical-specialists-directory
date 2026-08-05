import { Stethoscope } from 'lucide-react';
import { LocaleToggle } from '@/components/layout/LocaleToggle';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { clientEnv } from '@/config/env';
import { useI18n } from '@/i18n/useI18n';

export function AppHeader() {
  const { t } = useI18n();

  return (
    <header className="border-border bg-surface sticky top-0 z-10 border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="bg-brand-soft text-brand grid size-9 place-items-center rounded-md">
            <Stethoscope size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-content text-sm font-semibold sm:text-base">{t('app_title')}</h1>
            <p className="text-content-muted hidden text-xs sm:block">{t('app_subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* El entorno se muestra solo fuera de produccion, para no confundir al usuario final */}
          {clientEnv.appEnv !== 'production' ? (
            <span className="bg-surface-muted text-content-muted hidden rounded-full px-2.5 py-1 text-xs font-medium sm:inline">
              {clientEnv.appEnv}
            </span>
          ) : null}
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
