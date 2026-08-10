import { AppHeader } from '@/components/layout/AppHeader';
import { PlacesView } from '@/features/places/PlacesView';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

export function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <div className="bg-canvas min-h-screen">
          <AppHeader />
          <main className="mx-auto max-w-screen-2xl px-4 py-6">
            <PlacesView />
          </main>
        </div>
      </I18nProvider>
    </ThemeProvider>
  );
}
