import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { captureCamera, log } from './capture.js';

// One pass of the worker loop: capture, apply the configured areas and ask the model, then log the
// analysis. `analyze({ png, camera, media })` is injected so tests need no model or network.
// A failed capture or analysis is logged and never reported as free spaces.
export async function runCycle({ browser, camera, outputDir, analyze }) {
  const capture = await captureCamera(browser, camera, outputDir);
  if (!capture.ok) {
    log('analysis_skipped', { camera: camera.id, reason: 'capture failed', error: capture.error });
    return { ok: false, reason: 'capture' };
  }
  try {
    const png = await readFile(join(outputDir, camera.id, capture.filename));
    const analysis = await analyze({ png, camera, media: capture.media });
    log('analysis', {
      camera: camera.id,
      capturedAt: capture.capturedAt,
      frame: capture.filename,
      frameFreshness: capture.media?.freshness ?? 'unknown',
      frameAgeSeconds: capture.media?.ageSeconds ?? null,
      ...analysis,
    });
    return { ok: true, analysis, capturedAt: capture.capturedAt };
  } catch (error) {
    log('analysis_failed', { camera: camera.id, frame: capture.filename, message: error.message });
    return { ok: false, reason: 'analysis' };
  }
}
