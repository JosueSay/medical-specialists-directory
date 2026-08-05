import { AlertTriangle, ExternalLink } from 'lucide-react';
import type { PlaceDto } from '@msd/contracts';
import { useI18n } from '@/i18n/useI18n';

/** Formatea una fecha ISO al idioma activo; ante un valor invalido devuelve un guion. */
function formatDate(isoDate: string, locale: string): string {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

/**
 * Un campo que Places API no entrega se muestra como ausente, nunca como error
 * ni relleno con otra fuente. La distincion importa: el Ministerio debe poder
 * ver que el dato no existe, no suponer que el sistema fallo.
 */
function EmptyValue() {
  const { t } = useI18n();
  return <span className="text-content-muted/60 italic">{t('field_not_available')}</span>;
}

export function PlacesTable({ places }: { places: PlaceDto[] }) {
  const { t, locale } = useI18n();

  return (
    // El scroll horizontal vive en el contenedor de la tabla: la pagina nunca
    // se desborda en pantallas angostas
    <div className="overflow-x-auto">
      <table className="w-full min-w-3xl border-collapse text-left text-sm">
        <thead className="text-content-muted bg-surface-muted text-xs uppercase">
          <tr>
            <th scope="col" className="px-5 py-3 font-medium">
              {t('table_name')}
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              {t('table_address')}
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              {t('table_specialty')}
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              {t('table_zone')}
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              {t('table_phone')}
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              {t('table_website')}
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              {t('table_collected_at')}
            </th>
          </tr>
        </thead>

        <tbody className="divide-border divide-y">
          {places.map((place) => (
            <tr key={place.placeId} className="hover:bg-surface-muted/60 transition">
              <td className="text-content px-5 py-3 font-medium">{place.name}</td>
              <td className="text-content-muted px-5 py-3">{place.formattedAddress}</td>
              <td className="px-5 py-3">
                <span className="bg-brand-soft text-brand rounded-full px-2.5 py-1 text-xs font-medium">
                  {t(`specialty_${place.specialty}`)}
                </span>
              </td>
              <td className="text-content-muted px-5 py-3">{place.zone}</td>
              <td className="text-content-muted px-5 py-3">
                {place.phoneNumber === '' ? <EmptyValue /> : place.phoneNumber}
              </td>
              <td className="text-content-muted px-5 py-3">
                {place.website === '' ? (
                  <EmptyValue />
                ) : (
                  <a
                    href={place.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand inline-flex items-center gap-1 hover:underline"
                  >
                    {t('table_website_open')}
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </td>
              {/* collectedAt visible a proposito: quien consulta debe saber que tan reciente es el dato */}
              <td className="text-content-muted px-5 py-3">
                <span className="flex flex-col gap-1">
                  {formatDate(place.collectedAt, locale)}
                  {place.stale ? (
                    <span className="bg-warning-soft text-warning inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                      <AlertTriangle size={12} aria-hidden="true" />
                      {t('freshness_stale')}
                    </span>
                  ) : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
