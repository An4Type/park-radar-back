import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, sendReport } from '../src/report.js';
import { intervalMs } from '../src/config.js';

const camera = { id: 'c1', parkingId: '00000000-0000-4000-8000-000000000006' };
const analysis = { model: 'm', state: 'ok', reasons: [], totalFree: 5, areas: [{ vehicles: 2, confidence: 0.9 }, { vehicles: 1, confidence: 0.7 }] };

test('default interval is 60 seconds and configurable', () => {
  assert.equal(intervalMs(), 60000);
  assert.equal(intervalMs('15'), 15000);
});

test('ok analysis becomes an ACTIVE report with summed vehicles and lowest confidence', () => {
  const report = buildReport(camera, { ok: true, analysis, capturedAt: '2026-10-04T10:00:00.000Z' });
  assert.equal(report.status, 'ACTIVE');
  assert.equal(report.occupiedSpaces, 3);
  assert.equal(report.confidence, 0.7);
});

test('failures map to error statuses and cameras without parkingId report nothing', () => {
  assert.equal(buildReport(camera, { ok: false, reason: 'capture' }).status, 'STREAM_ERROR');
  assert.equal(buildReport(camera, { ok: false, reason: 'analysis' }).status, 'RECOGNITION_ERROR');
  assert.equal(buildReport(camera, { ok: true, analysis: { ...analysis, state: 'unknown' } }).status, 'RECOGNITION_ERROR');
  assert.equal(buildReport({ id: 'x' }, { ok: true, analysis }), null);
});

test('sendReport posts with the bearer token and never throws', async () => {
  let call;
  const ok = await sendReport({ report: { status: 'ACTIVE' }, parkingId: camera.parkingId, env: { INGEST_URL: 'http://api:3000', INGEST_TOKEN: 't' }, fetchImpl: async (u, init) => { call = { u: String(u), init }; return { ok: true }; } });
  assert.ok(ok);
  assert.equal(call.u, `http://api:3000/api/parking/${camera.parkingId}/occupancy`);
  assert.equal(call.init.headers.authorization, 'Bearer t');
  const failed = await sendReport({ report: {}, parkingId: camera.parkingId, env: { INGEST_URL: 'http://api:3000' }, fetchImpl: async () => { throw new Error('down'); } });
  assert.equal(failed, false);
});
