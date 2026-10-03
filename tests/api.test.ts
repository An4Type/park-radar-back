import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../apps/api/src/app.js';
import type { ParkingRepository } from '../apps/api/src/repository.js';
import { sampleParking } from './fixtures.js';

const repository: ParkingRepository = {
  list: vi.fn(async (bbox) => bbox && bbox.maxLon < 16.9 ? [] : [sampleParking]),
  get: vi.fn(async (id) => id === sampleParking.id ? sampleParking : null),
  ping: vi.fn(async () => undefined),
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
    expect(found.body.parking.freeSpaces).toBe(37);
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
