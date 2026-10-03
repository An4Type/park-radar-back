import express, { type ErrorRequestHandler } from 'express';
import { InputError, parkingDto, parseBbox } from '../../../packages/shared/src/parking.js';
import { errorMessage, log } from '../../../packages/shared/src/log.js';
import type { ParkingRepository } from './repository.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createApp(repository: ParkingRepository) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', async (_request, response) => {
    await repository.ping();
    response.json({ status: 'ok', database: 'connected' });
  });

  app.get('/api/parking', async (request, response) => {
    const bbox = parseBbox(request.query);
    const parking = await repository.list(bbox);
    response.json({ parking: parking.map((record) => parkingDto(record)) });
  });

  app.get('/api/parking/:id', async (request, response) => {
    const id = request.params.id;
    if (!id || !uuidPattern.test(id)) throw new InputError('INVALID_ID', 'Parking ID must be a UUID.');
    const parking = await repository.get(id);
    if (!parking) return response.status(404).json({ error: 'NOT_FOUND', message: 'Parking lot not found.' });
    return response.json({ parking: parkingDto(parking, true) });
  });

  const handleError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof InputError) {
      response.status(400).json({ error: error.code, message: error.message });
      return;
    }
    log('api', 'request_error', { error: errorMessage(error) });
    response.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.' });
  };
  app.use(handleError);
  return app;
}
