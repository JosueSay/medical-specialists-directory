import { Router } from 'express';
import { ENDPOINTS } from '@msd/contracts';
import type { AppContainer } from '@/config/container.js';
import { createPlaceImportsController } from '@/interfaces/http/controllers/placeImportsController.js';
import { createPlacesController } from '@/interfaces/http/controllers/placesController.js';
import { createSpecialtiesController } from '@/interfaces/http/controllers/specialtiesController.js';

/**
 * Rutas de la API. Los paths salen del contrato compartido (`@msd/contracts`),
 * no se escriben a mano: el frontend consume exactamente las mismas constantes.
 */
export function createApiRouter(container: AppContainer): Router {
  const router = Router();

  const places = createPlacesController(container.listPlacesUseCase);
  const placeImports = createPlaceImportsController(container.importPlacesUseCase);
  const specialties = createSpecialtiesController();

  router.get(ENDPOINTS.listPlaces.path, places.list);
  router.post(ENDPOINTS.createPlaceImport.path, placeImports.create);
  router.get(ENDPOINTS.listSpecialties.path, specialties.list);

  return router;
}
