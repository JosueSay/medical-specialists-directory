import type { NextFunction, Request, Response } from 'express';
import { SUCCESS_CODES } from '@msd/contracts';
import type { ListPlacesUseCase } from '@/application/listPlacesUseCase.js';
import { sendPaginated } from '@/shared/httpResponse.js';
import { listPlacesQuerySchema, validate } from '@/interfaces/http/validators/placeSchemas.js';

/**
 * Controlador del directorio. Solo traduce HTTP a una llamada del caso de uso:
 * no contiene reglas de negocio ni conoce Firestore.
 */
export function createPlacesController(listPlaces: ListPlacesUseCase) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const query = validate(listPlacesQuerySchema, req.query);

        const result = await listPlaces.execute({
          ...(query.specialty ? { specialty: query.specialty } : {}),
          ...(query.zone ? { zone: query.zone } : {}),
          ...(query.q ? { q: query.q } : {}),
          page: query.page,
          pageSize: query.pageSize,
        });

        sendPaginated(
          res,
          SUCCESS_CODES.PLACE_LIST,
          'Resources list retrieved successfully',
          result.items,
          result.page,
          result.pageSize,
          result.totalItems,
        );
      } catch (error) {
        next(error);
      }
    },
  };
}
