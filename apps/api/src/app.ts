import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { InputError, cameraDto, parkingDto, parseBbox, parseOccupancyReport, parseZone, zoneDto } from '../../../packages/shared/src/parking.js';
import { errorMessage, log } from '../../../packages/shared/src/log.js';
import { docsHtml, openApiSpec } from './openapi.js';
import type { ParkingRepository } from './repository.js';

const defaultZoneTtlSeconds = 30 * 60;
const defaultZoneMergeMeters = 6;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tokenMatches(header: string | undefined, token: string): boolean {
  const given = Buffer.from(header?.startsWith('Bearer ') ? header.slice(7) : '');
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function createApp(repository: ParkingRepository, options: { ingestToken?: string; zoneTtlSeconds?: number; zoneMergeMeters?: number } = {}) {
  const app = express();
  app.disable('x-powered-by');

  // Internal endpoints used by camera workers share one bearer token.
  const requireWorkerToken: RequestHandler<{ id: string }> = (request, response, next) => {
    if (!options.ingestToken) return void response.status(503).json({ error: 'INGEST_DISABLED', message: 'Worker endpoints are not configured.' });
    if (!tokenMatches(request.header('authorization'), options.ingestToken)) return void response.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid ingest token.' });
    next();
  };

  app.get('/openapi.json', (_request, response) => { response.json(openApiSpec); });
  app.get('/docs', (_request, response) => { response.type('html').send(docsHtml); });

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

  // Camera workers push their latest recognition result here.
  app.post('/api/parking/:id/occupancy', requireWorkerToken, express.json({ limit: '256kb' }), async (request, response) => {
    const id = request.params.id;
    if (!id || !uuidPattern.test(id)) throw new InputError('INVALID_ID', 'Parking ID must be a UUID.');
    const parking = await repository.recordOccupancy(id, parseOccupancyReport(request.body));
    if (!parking) return response.status(404).json({ error: 'NOT_FOUND', message: 'Parking lot not found.' });
    return response.json({ parking: parkingDto(parking) });
  });

  // Public, unauthenticated: user-reported zones are separate from camera-counted parking and expire on their own.
  app.get('/api/zones', async (request, response) => {
    const zones = await repository.listZones(parseBbox(request.query));
    response.json({ zones: zones.map(zoneDto) });
  });

  app.post('/api/zones', express.json({ limit: '1kb' }), async (request, response) => {
    const { zone, created } = await repository.createZone(parseZone(request.body), {
      ttlSeconds: options.zoneTtlSeconds ?? defaultZoneTtlSeconds,
      mergeMeters: options.zoneMergeMeters ?? defaultZoneMergeMeters,
    });
    // A nearby report updates the existing zone, so the response says which happened.
    response.status(created ? 201 : 200).json({ zone: zoneDto(zone) });
  });

  // Camera configuration for a worker, which is started with only a camera id.
  app.get('/api/cameras/:id', requireWorkerToken, async (request, response) => {
    const id = request.params.id;
    if (!id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new InputError('INVALID_ID', 'Camera ID must contain 1–64 lowercase letters, numbers or hyphens.');
    const camera = await repository.getCamera(id);
    if (!camera) return response.status(404).json({ error: 'NOT_FOUND', message: 'Camera not found.' });
    return response.json({ camera: cameraDto(camera) });
  });

  const handleError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof InputError) {
      response.status(400).json({ error: error.code, message: error.message });
      return;
    }
    if ((error as { type?: string }).type === 'entity.parse.failed') {
      response.status(400).json({ error: 'INVALID_REPORT', message: 'Body must be valid JSON.' });
      return;
    }
    log('api', 'request_error', { error: errorMessage(error) });
    response.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.' });
  };
  app.use(handleError);
  return app;
}
