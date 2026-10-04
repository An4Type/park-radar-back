import { describe, expect, it } from 'vitest';

// Run against a migrated and seeded Compose database with RUN_DB_TESTS=1.
describe.skipIf(process.env.RUN_DB_TESTS !== '1')('PostGIS database and API integration', () => {
  it('filters seeded parkings through the real API repository', async () => {
    const [{ createApp }, { parkingRepository }, { default: request }] = await Promise.all([
      import('../apps/api/src/app.js'),
      import('../apps/api/src/repository.js'),
      import('supertest'),
    ]);
    const app = createApp(parkingRepository);
    const inside = await request(app).get('/api/parking?minLon=19.8&minLat=49.95&maxLon=20.1&maxLat=50.15');
    expect(inside.status).toBe(200);
    expect(inside.body.parking.length).toBeGreaterThanOrEqual(6);
    const outside = await request(app).get('/api/parking?minLon=16.9&minLat=52.39&maxLon=17&maxLat=52.42');
    expect(outside.status).toBe(200);
    expect(outside.body.parking).toHaveLength(0);
    const byId = await request(app).get('/api/parking/00000000-0000-4000-8000-000000000001');
    expect(byId.status).toBe(200);
    expect(byId.body.parking.freeRegularSpaces).toBeGreaterThanOrEqual(0);
  });
});
