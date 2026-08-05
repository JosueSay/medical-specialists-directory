import { Card } from '@/components/ui/Card';
import { Alert, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { clientEnv } from '@/config/env';
import { PlaceFilters } from '@/features/places/PlaceFilters';
import { PlacesTable } from '@/features/places/PlacesTable';
import { usePlaces } from '@/features/places/usePlaces';
import { useI18n } from '@/i18n/useI18n';

/**
 * Vista principal del directorio: filtros, resultados y paginacion.
 * Distingue visualmente los estados de carga, error y lista vacia.
 */
export function PlacesView() {
  const { t } = useI18n();
  const { state, search, goToPage } = usePlaces({
    page: 1,
    pageSize: clientEnv.defaultPageSize,
  });

  return (
    <div className="flex flex-col gap-6">
      <PlaceFilters disabled={state.status === 'loading'} onSearch={search} />

      <Card>
        {state.status === 'loading' ? <LoadingState label={t('state_loading')} /> : null}

        {state.status === 'error' && state.errorCode ? (
          <div className="p-5">
            {/* El backend devuelve un `code`; el texto sale del diccionario del idioma activo */}
            <Alert tone="danger" title={t('state_error_title')}>
              {t(state.errorCode)}
            </Alert>
          </div>
        ) : null}

        {state.status === 'success' && state.places.length === 0 ? (
          <EmptyState title={t('state_empty_title')} description={t('state_empty_description')} />
        ) : null}

        {state.status === 'success' && state.places.length > 0 ? (
          <>
            <PlacesTable places={state.places} />
            {state.pagination ? (
              <Pagination pagination={state.pagination} onPageChange={goToPage} />
            ) : null}
          </>
        ) : null}
      </Card>

      <p className="text-content-muted text-xs">{t('coverage_notice')}</p>
    </div>
  );
}
