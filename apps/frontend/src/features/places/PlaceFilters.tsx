import { useState, type FormEvent } from 'react';
import { Search, X } from 'lucide-react';
import {
  PAGINATION_DEFAULTS,
  SUPPORTED_SPECIALTIES,
  type ListPlacesQuery,
  type Specialty,
} from '@msd/contracts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { SelectField, TextField } from '@/components/ui/Field';
import { clientEnv } from '@/config/env';
import { useI18n } from '@/i18n/useI18n';

export interface PlaceFiltersProps {
  disabled: boolean;
  onSearch: (filters: Omit<ListPlacesQuery, 'page'>) => void;
}

const PAGE_SIZE_OPTIONS = [5, 10, 20, PAGINATION_DEFAULTS.maxPageSize];

/**
 * Formulario de busqueda. Los filtros se traducen a query params del endpoint
 * de consulta; el selector de especialidad se arma desde el catalogo del
 * contrato, asi que no puede ofrecer un valor que el backend rechace.
 */
export function PlaceFilters({ disabled, onSearch }: PlaceFiltersProps) {
  const { t } = useI18n();
  const [specialty, setSpecialty] = useState<string>('');
  const [zone, setZone] = useState<string>('');
  const [q, setQ] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(clientEnv.defaultPageSize);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSearch({
      ...(specialty ? { specialty: specialty as Specialty } : {}),
      ...(zone.trim() ? { zone: zone.trim() } : {}),
      ...(q.trim() ? { q: q.trim() } : {}),
      pageSize,
    });
  };

  const handleReset = (): void => {
    setSpecialty('');
    setZone('');
    setQ('');
    setPageSize(clientEnv.defaultPageSize);
    onSearch({ pageSize: clientEnv.defaultPageSize });
  };

  return (
    <Card>
      <CardHeader title={t('filters_title')} />
      <CardBody>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            label={t('filters_specialty')}
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value)}
            options={[
              { value: '', label: t('filters_all') },
              ...SUPPORTED_SPECIALTIES.map((item) => ({
                value: item,
                label: t(`specialty_${item}`),
              })),
            ]}
          />

          <TextField
            label={t('filters_zone')}
            inputMode="numeric"
            value={zone}
            onChange={(event) => setZone(event.target.value.replace(/\D/g, '').slice(0, 3))}
            placeholder="4"
          />

          <TextField
            label={t('filters_query')}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={t('filters_query_placeholder')}
          />

          <SelectField
            label={t('filters_page_size')}
            value={String(pageSize)}
            onChange={(event) => setPageSize(Number(event.target.value))}
            options={PAGE_SIZE_OPTIONS.map((size) => ({
              value: String(size),
              label: String(size),
            }))}
          />

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={disabled}>
              <Search size={16} aria-hidden="true" />
              {t('filters_submit')}
            </Button>
            <Button type="button" variant="ghost" onClick={handleReset} disabled={disabled}>
              <X size={16} aria-hidden="true" />
              {t('filters_reset')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
