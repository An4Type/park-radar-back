// Placeholder for the camera database. The worker only calls getCamera(), so replacing this file
// with a real query (id -> camera definition) needs no other change. For now the definition comes from
// the camera configuration file, which holds the AGH camera and its hand-marked parking areas.
import { resolve } from 'node:path';
import { loadCameras } from './config.js';

export async function getCamera(id, file = resolve(process.env.CAMERAS_FILE ?? 'config/cameras.json')) {
  const camera = (await loadCameras(file)).find((candidate) => candidate.id === id);
  if (!camera) throw new Error(`Camera ${id} was not found or is not enabled`);
  if (!camera.parkingAreas.length) throw new Error(`Camera ${id} has no parkingAreas to analyze`);
  return camera;
}
