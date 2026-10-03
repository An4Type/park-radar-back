import test from 'node:test';
import assert from 'node:assert/strict';
import { getCamera } from '../src/store.js';

const env = { INGEST_URL: 'http://api:3000', INGEST_TOKEN: 't' };
const definition = {
  id: 'cam-1', name: 'Cam', enabled: true, url: 'https://example.com/c', mediaType: 'image', readySelector: 'img',
  viewport: { width: 1280, height: 720 }, parkingId: '00000000-0000-4000-8000-000000000006',
  parkingAreas: [{ id: 'a', points: [[0, 0], [1, 0], [1, 1]], capacity: 2 }],
};
const reply = (status, body) => async () => ({ status, ok: status < 400, json: async () => body });

test('loads and validates the camera from the API', async () => {
  let call;
  const camera = await getCamera('cam-1', { env, fetchImpl: async (u, init) => { call = { u: String(u), init }; return reply(200, { camera: definition })(); } });
  assert.equal(call.u, 'http://api:3000/api/cameras/cam-1');
  assert.equal(call.init.headers.authorization, 'Bearer t');
  assert.equal(camera.parkingAreas[0].capacity, 2);
});

test('fails for unknown, disabled or area-less cameras', async () => {
  await assert.rejects(getCamera('x', { env, fetchImpl: reply(404, {}) }), /not found/);
  await assert.rejects(getCamera('cam-1', { env, fetchImpl: reply(200, { camera: { ...definition, enabled: false } }) }), /enabled camera/);
  await assert.rejects(getCamera('cam-1', { env, fetchImpl: reply(200, { camera: { ...definition, parkingAreas: [] } }) }), /no parkingAreas/);
  await assert.rejects(getCamera('cam-1', { env: {}, fetchImpl: reply(200, {}) }), /INGEST_URL/);
});
