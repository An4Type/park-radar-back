// Camera definitions live in the database; the worker reads its camera through the API
// (GET /api/cameras/:id), so it needs only INGEST_URL, INGEST_TOKEN and a camera id.
import { validateCameras } from './config.js';

export async function getCamera(id, { env = process.env, fetchImpl = fetch, signal } = {}) {
  const base = env.INGEST_URL;
  if (!base) throw new Error('INGEST_URL is not set');
  const response = await fetchImpl(new URL(`/api/cameras/${encodeURIComponent(id)}`, base), {
    headers: { authorization: `Bearer ${env.INGEST_TOKEN ?? ''}` },
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10000)]),
  });
  if (response.status === 404) throw new Error(`Camera ${id} was not found`);
  if (!response.ok) throw new Error(`Camera ${id}: API answered ${response.status}`);
  const { camera: definition } = await response.json();
  const [camera] = validateCameras([definition]); // throws when disabled or invalid
  if (!camera.parkingAreas.length) throw new Error(`Camera ${id} has no parkingAreas to analyze`);
  return camera;
}
