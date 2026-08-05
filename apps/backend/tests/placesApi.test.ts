import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { API_BASE_PATH, ENDPOINTS, HEALTH_PATH } from '@msd/contracts';
import { createApp } from '@/app.js';
import { buildContainer } from '@/config/container.js';

const placesUrl = `${API_BASE_PATH}${ENDPOINTS.listPlaces.path}`;
const importsUrl = `${API_BASE_PATH}${ENDPOINTS.createPlaceImport.path}`;

let app: Express;

beforeAll(async () => {
  app = createApp(await buildContainer());
});

describe('API de lugares', () => {
  it('expone el health check sin pasar por la whitelist', async () => {
    const response = await request(app).get(HEALTH_PATH).set('X-Forwarded-For', '8.8.8.8');

    expect(response.status).toBe(200);
    expect(response.body.code).toBe('service_healthy');
  });

  it('responde 403 con ip_not_allowed a una IP fuera de la whitelist', async () => {
    const response = await request(app).get(placesUrl).set('X-Forwarded-For', '8.8.8.8');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'ip_not_allowed',
      message: 'Request origin is not allowed',
    });
  });

  it('devuelve la lista paginada con el formato del contrato', async () => {
    const response = await request(app).get(`${placesUrl}?specialty=oncology&page=1&pageSize=2`);

    expect(response.status).toBe(200);
    expect(response.body.code).toBe('place_list');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.meta.pagination).toEqual({
      page: 1,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
    });
  });

  it('responde 400 con validation_error cuando pageSize esta fuera de rango', async () => {
    const response = await request(app).get(`${placesUrl}?pageSize=500`);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.errors.details[0].field).toBe('pageSize');
  });

  it('responde 422 con specialty_not_supported ante una especialidad desconocida', async () => {
    const response = await request(app).get(`${placesUrl}?specialty=astrology`);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('specialty_not_supported');
  });

  it('crea una importacion y devuelve 201 con el resumen', async () => {
    const response = await request(app)
      .post(importsUrl)
      .send({ keyword: 'dermatologia zona 15 Guatemala', specialty: 'dermatology', zone: '15' });

    expect(response.status).toBe(201);
    expect(response.body.code).toBe('place_import_created');
    expect(response.body.data.itemsUpserted).toBeGreaterThan(0);
  });

  it('responde 404 con el formato del contrato en una ruta inexistente', async () => {
    const response = await request(app).get('/api/v1/unknown');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('resource_not_found');
  });
});
