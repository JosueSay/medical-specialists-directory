import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n/useI18n';

export function LocaleToggle() {
  const { locale, setLocale, t } = useI18n();

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}
      aria-label={t('locale_toggle')}
      title={t('locale_toggle')}
    >
      <Languages size={16} aria-hidden="true" />
      <span className="uppercase">{locale === 'es' ? 'en' : 'es'}</span>
    </Button>
  );
}
