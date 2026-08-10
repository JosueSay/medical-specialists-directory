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

/**
 * Nombre y direccion se alinean a la izquierda porque son texto largo y de
 * longitud variable: centrarlos dejaria los margenes irregulares y costaria mas
 * recorrerlos con la vista. El resto son valores cortos y de ancho parecido, y
 * centrados se leen como columna.
 */
const CENTERED = 'px-5 py-3 text-center';

/** Anchos de las barras del esqueleto, uno por columna. */
const SKELETON_WIDTHS = ['w-40', 'w-56', 'w-20', 'w-6', 'w-16', 'w-10', 'w-24'];

/**
 * Filas de relleno mientras llega la respuesta.
 *
 * Van dentro de la misma tabla y no en lugar de ella: la cabecera se queda
 * quieta y solo cambia el cuerpo. Sustituir la tabla entera hacia desaparecer
 * las columnas en cada busqueda y devolvia la sensacion de que la pagina se
 * recarga.
 */
function SkeletonRows({ rows }: { rows: number }) {
  return (
    <tbody className="divide-border divide-y">
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row}>
          {SKELETON_WIDTHS.map((width, cell) => (
            <td key={cell} className={cell < 2 ? 'px-5 py-4' : CENTERED}>
              <span
                className={`bg-content-muted/15 block h-4 animate-pulse rounded ${width} ${
                  cell < 2 ? '' : 'mx-auto'
                }`}
                style={{ animationDelay: `${row * 60}ms` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export interface PlacesTableProps {
  places: PlaceDto[];
  /** Numero de filas de esqueleto; cero significa que ya hay datos. */
  loadingRows?: number;
}

export function PlacesTable({ places, loadingRows = 0 }: PlacesTableProps) {
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
            <th scope="col" className={`${CENTERED} font-medium`}>
              {t('table_specialty')}
            </th>
            <th scope="col" className={`${CENTERED} font-medium`}>
              {t('table_zone')}
            </th>
            <th scope="col" className={`${CENTERED} font-medium`}>
              {t('table_phone')}
            </th>
            <th scope="col" className={`${CENTERED} font-medium whitespace-nowrap`}>
              {t('table_website')}
            </th>
            <th scope="col" className={`${CENTERED} font-medium`}>
              {t('table_collected_at')}
            </th>
          </tr>
        </thead>

        {loadingRows > 0 ? <SkeletonRows rows={loadingRows} /> : null}

        <tbody className={loadingRows > 0 ? 'hidden' : 'divide-border divide-y'}>
          {places.map((place) => (
            <tr key={place.placeId} className="hover:bg-surface-muted/60 transition">
              <td className="text-content px-5 py-3 font-medium">{place.name}</td>
              <td className="text-content-muted px-5 py-3">{place.formattedAddress}</td>

              {/* `whitespace-nowrap` evita que «Medicina general» parta la
                  etiqueta en dos lineas y la deforme */}
              <td className={CENTERED}>
                <span className="bg-brand-soft text-brand inline-block rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap">
                  {t(`specialty_${place.specialty}`)}
                </span>
              </td>

              <td className={`text-content-muted ${CENTERED}`}>{place.zone}</td>

              <td className={`text-content-muted ${CENTERED} whitespace-nowrap`}>
                {place.phoneNumber === '' ? <EmptyValue /> : place.phoneNumber}
              </td>

              <td className={`text-content-muted ${CENTERED}`}>
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
              <td className={`text-content-muted ${CENTERED}`}>
                <span className="flex flex-col items-center gap-1 whitespace-nowrap">
                  {formatDate(place.collectedAt, locale)}
                  {place.stale ? (
                    <span className="bg-warning-soft text-warning inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
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
