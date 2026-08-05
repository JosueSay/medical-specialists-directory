import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n/useI18n';
import { useTheme } from '@/theme/useTheme';

export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={toggleTheme}
      aria-label={t('theme_toggle')}
      title={t('theme_toggle')}
    >
      {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
      <span className="hidden sm:inline">{isDark ? t('theme_light') : t('theme_dark')}</span>
    </Button>
  );
}
