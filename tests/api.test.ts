import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../apps/api/src/app.js';
import type { ParkingRepository } from '../apps/api/src/repository.js';
import { sampleParking } from './fixtures.js';

const sampleCamera = {
  id: 'cam-1', parkingId: sampleParking.id, name: 'Cam', description: null, enabled: true, url: 'https://example.com/cam',
  sourceUrl: null, mediaType: 'image' as const, selector: null, readySelector: 'img', frameSelector: null, clickSelectors: [],
  startPlayback: true, fullPage: false, viewportWidth: 1280, viewportHeight: 720, timeoutMs: 30000, settleMs: 1000, attempts: 2,
  maxCaptures: 288, maxMediaAgeSeconds: 900, captureIntervalSeconds: null, parkingAreas: [],
};

const sampleZone = { id: '00000000-0000-4000-8000-0000000000aa', latitude: 50.06, longitude: 19.92, level: 'FEW' as const, createdAt: new Date('2026-10-04T10:00:00.000Z'), expiresAt: new Date('2026-10-04T10:30:00.000Z') };

const repository: ParkingRepository = {
  list: vi.fn(async (bbox) => bbox && bbox.maxLon < 16.9 ? [] : [sampleParking]),
  get: vi.fn(async (id) => id === sampleParking.id ? sampleParking : null),
  ping: vi.fn(async () => undefined),
  listZones: vi.fn(async () => [sampleZone]),
  createZone: vi.fn(async (input, { ttlSeconds }) => ({ created: input.latitude !== sampleZone.latitude, zone: { ...sampleZone, ...input, expiresAt: new Date(sampleZone.createdAt.getTime() + ttlSeconds * 1000) } })),
  getCamera: vi.fn(async (id) => id === 'cam-1' ? sampleCamera : null),
  recordOccupancy: vi.fn(async (id, report) => id === sampleParking.id ? { ...sampleParking, occupiedSpaces: report.occupiedSpaces ?? sampleParking.occupiedSpaces } : null),
};
const app = createApp(repository);

describe('parking API', () => {
  it('reports database health', async () => {
    const result = await request(app).get('/health');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: 'ok', database: 'connected' });
  });

  it('returns a parking by ID and 404 for missing parking', async () => {
    const found = await request(app).get(`/api/parking/${sampleParking.id}`);
    expect(found.status).toBe(200);
    expect(found.body.parking.freeRegularSpaces).toBe(37);
    expect(found.body.parking.recognitionData).toEqual({ model: 'mock-v1' });
    const missing = await request(app).get('/api/parking/00000000-0000-4000-8000-000000000099');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('NOT_FOUND');
  });

  it('passes BBOX to repository and returns filtered results', async () => {
    const result = await request(app).get('/api/parking?minLon=16&minLat=52&maxLon=16.8&maxLat=53');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ parking: [] });
    expect(repository.list).toHaveBeenCalledWith({ minLon: 16, minLat: 52, maxLon: 16.8, maxLat: 53 });
  });

  it('returns a useful 400 response for partial BBOX', async () => {
    const result = await request(app).get('/api/parking?minLon=16');
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('INVALID_BBOX');
  });
});

describe('occupancy ingestion', () => {
  const ingestApp = createApp(repository, { ingestToken: 'secret-token' });
  const url = `/api/parking/${sampleParking.id}/occupancy`;
  const body = { status: 'ACTIVE', occupiedSpaces: 5, confidence: 0.8 };

  it('is disabled without a configured token', async () => {
    expect((await request(app).post(url).send(body)).status).toBe(503);
  });

  it('rejects a missing or wrong token', async () => {
    expect((await request(ingestApp).post(url).send(body)).status).toBe(401);
    expect((await request(ingestApp).post(url).set('Authorization', 'Bearer nope').send(body)).status).toBe(401);
  });

  it('stores a valid report', async () => {
    const result = await request(ingestApp).post(url).set('Authorization', 'Bearer secret-token').send(body);
    expect(result.status).toBe(200);
    expect(result.body.parking.freeRegularSpaces).toBe(115);
    expect(repository.recordOccupancy).toHaveBeenCalledWith(sampleParking.id, expect.objectContaining({ status: 'ACTIVE', occupiedSpaces: 5 }));
  });

  it('accepts a report with only some of the three counts', async () => {
    const result = await request(ingestApp).post(url).set('Authorization', 'Bearer secret-token').send({ status: 'ACTIVE', occupiedDisabledSpaces: 2 });
    expect(result.status).toBe(200);
    expect(repository.recordOccupancy).toHaveBeenLastCalledWith(sampleParking.id, expect.objectContaining({ occupiedSpaces: null, occupiedDisabledSpaces: 2, occupiedEvChargerSpaces: null }));
  });

  it('validates the report and the parking', async () => {
    const auth = { Authorization: 'Bearer secret-token' };
    expect((await request(ingestApp).post(url).set(auth).send({ status: 'ACTIVE' })).status).toBe(400);
    expect((await request(ingestApp).post(url).set(auth).send({ status: 'ACTIVE', occupiedSpaces: -1 })).status).toBe(400);
    expect((await request(ingestApp).post(url).set(auth).send({ status: 'ACTIVE', occupiedDisabledSpaces: 1.5 })).status).toBe(400);
    expect((await request(ingestApp).post(url).set(auth).set('Content-Type', 'application/json').send('{bad')).status).toBe(400);
    expect((await request(ingestApp).post('/api/parking/00000000-0000-4000-8000-000000000099/occupancy').set(auth).send(body)).status).toBe(404);
  });
});

describe('reported zones', () => {
  const body = { latitude: 50.06, longitude: 19.92, level: 'many' };

  it('lists active zones, optionally within a bbox', async () => {
    const result = await request(app).get('/api/zones?minLon=19.8&minLat=49.95&maxLon=20.1&maxLat=50.15');
    expect(result.status).toBe(200);
    expect(result.body.zones).toEqual([{ ...sampleZone, createdAt: '2026-10-04T10:00:00.000Z', expiresAt: '2026-10-04T10:30:00.000Z' }]);
    expect(repository.listZones).toHaveBeenCalledWith({ minLon: 19.8, minLat: 49.95, maxLon: 20.1, maxLat: 50.15 });
    expect((await request(app).get('/api/zones?minLon=19.8')).status).toBe(400);
  });

  it('lists a permanent zone with a null expiry', async () => {
    vi.mocked(repository.listZones).mockResolvedValueOnce([{ ...sampleZone, expiresAt: null }]);
    expect((await request(app).get('/api/zones')).body.zones[0].expiresAt).toBeNull();
  });

  it('creates a zone without authentication using the default lifespan', async () => {
    const result = await request(app).post('/api/zones').send({ ...body, latitude: 50.07 });
    expect(result.status).toBe(201);
    expect(repository.createZone).toHaveBeenCalledWith({ ...body, latitude: 50.07, level: 'MANY' }, { ttlSeconds: 30 * 60, mergeMeters: 6 });
    expect(result.body.zone.level).toBe('MANY');
  });

  it('uses the configured lifespan', async () => {
    await request(createApp(repository, { zoneTtlSeconds: 90, zoneMergeMeters: 10 })).post('/api/zones').send(body);
    expect(repository.createZone).toHaveBeenLastCalledWith(expect.anything(), { ttlSeconds: 90, mergeMeters: 10 });
  });

  it('answers 200 when a nearby zone was updated instead of created', async () => {
    const result = await request(app).post('/api/zones').send(body);
    expect(result.status).toBe(200);
    expect(result.body.zone.id).toBe(sampleZone.id);
  });

  it('validates the report', async () => {
    for (const bad of [{}, { ...body, level: 'lots' }, { ...body, latitude: 91 }, { ...body, longitude: '19.9' }, { latitude: 50, level: 'few' }]) {
      const result = await request(app).post('/api/zones').send(bad);
      expect(result.status).toBe(400);
      expect(result.body.error).toBe('INVALID_ZONE');
    }
  });

  it('does not let the old feedback endpoint change parking', async () => {
    expect((await request(app).post(`/api/parking/${sampleParking.id}/feedback`).send({ answer: 'less' })).status).toBe(404);
  });
});

describe('API docs', () => {
  it('serves the OpenAPI spec and Swagger UI', async () => {
    expect((await request(app).get('/openapi.json')).body.paths['/api/parking']).toBeDefined();
    expect((await request(app).get('/docs')).text).toContain('SwaggerUIBundle');
  });
});

describe('camera config endpoint', () => {
  const ingestApp = createApp(repository, { ingestToken: 'secret-token' });
  const auth = { Authorization: 'Bearer secret-token' };

  it('requires the worker token', async () => {
    expect((await request(ingestApp).get('/api/cameras/cam-1')).status).toBe(401);
  });

  it('returns the camera in worker format and 404 for unknown ids', async () => {
    const found = await request(ingestApp).get('/api/cameras/cam-1').set(auth);
    expect(found.status).toBe(200);
    expect(found.body.camera.viewport).toEqual({ width: 1280, height: 720 });
    expect(found.body.camera).not.toHaveProperty('selector');
    expect((await request(ingestApp).get('/api/cameras/nope').set(auth)).status).toBe(404);
    expect((await request(ingestApp).get('/api/cameras/BAD_ID').set(auth)).status).toBe(400);
  });
});
