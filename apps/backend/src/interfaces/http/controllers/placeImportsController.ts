import type { NextFunction, Request, Response } from 'express';
import { SUCCESS_CODES } from '@msd/contracts';
import type { ImportPlacesUseCase } from '@/application/importPlacesUseCase.js';
import { sendSuccess } from '@/shared/httpResponse.js';
import { createPlaceImportSchema, validate } from '@/interfaces/http/validators/placeSchemas.js';

/**
 * Controlador de importaciones. Dispara el unico flujo que llama a Google.
 * No se expone a la UI: solo lo consume el operador desde una IP autorizada.
 */
export function createPlaceImportsController(importPlaces: ImportPlacesUseCase) {
  return {
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = validate(createPlaceImportSchema, req.body);
        const summary = await importPlaces.execute(body);

        sendSuccess(
          res,
          201,
          SUCCESS_CODES.PLACE_IMPORT_CREATED,
          'Place import completed successfully',
          summary,
        );
      } catch (error) {
        next(error);
      }
    },
  };
}
