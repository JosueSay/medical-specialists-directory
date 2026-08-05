import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationMeta } from '@msd/contracts';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n/useI18n';

export interface PaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
}

/** Controles construidos a partir de `meta.pagination` que devuelve la API. */
export function Pagination({ pagination, onPageChange }: PaginationProps) {
  const { t } = useI18n();
  const { page, totalPages, totalItems } = pagination;

  return (
    <nav
      className="border-border flex items-center justify-between gap-4 border-t px-5 py-3"
      aria-label={t('pagination_summary', { page, totalPages, totalItems })}
    >
      <p className="text-content-muted text-sm">
        {t('pagination_summary', { page, totalPages: Math.max(totalPages, 1), totalItems })}
      </p>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {t('pagination_previous')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          {t('pagination_next')}
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
