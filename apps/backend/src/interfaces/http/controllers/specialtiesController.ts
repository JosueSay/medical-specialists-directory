import type { Request, Response } from 'express';
import {
  SPECIALTY_KEYWORD_VARIANTS,
  SUCCESS_CODES,
  SUPPORTED_SPECIALTIES,
  type SpecialtyDto,
} from '@msd/contracts';
import { sendSuccess } from '@/shared/httpResponse.js';

/**
 * Catalogo de especialidades soportadas. La UI arma su selector desde aqui,
 * de modo que no puede ofrecer una especialidad que el backend rechazaria.
 * Es un catalogo pequeño y estatico: no se pagina.
 */
export function createSpecialtiesController() {
  const catalog: SpecialtyDto[] = SUPPORTED_SPECIALTIES.map((specialty) => ({
    specialty,
    keywords: SPECIALTY_KEYWORD_VARIANTS[specialty],
  }));

  return {
    list(_req: Request, res: Response): void {
      sendSuccess(
        res,
        200,
        SUCCESS_CODES.SPECIALTY_LIST,
        'Resources list retrieved successfully',
        catalog,
      );
    },
  };
}
