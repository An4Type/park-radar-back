import { chromium } from 'playwright';
import { setTimeout } from 'node:timers/promises';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { intervalMs } from './config.js';
import { getCamera } from './store.js';
import { log } from './capture.js';
import { analyzeFrame, askModel, DEFAULT_MODEL } from './analyze.js';
import { runCycle } from './cycle.js';

// Worker life cycle for one camera:
//   1. pull the camera definition (store.js; a placeholder for the database)
//   2. capture a screenshot            3. apply the configured parking areas
//   4. ask the vision model to count   5. log the analysis
//   6. wait for the interval and repeat from 2
async function main() {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const [cameraId = process.env.CAMERA_ID, ...rest] = args.filter((arg) => arg !== '--once');
  if (!cameraId || rest.length) throw new Error('Usage: node src/worker.js <camera-id> [--once] (or set CAMERA_ID)');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const outputDir = resolve(process.env.OUTPUT_DIR ?? 'screenshots');
  const interval = intervalMs(process.env.CAPTURE_INTERVAL_SECONDS);

  const camera = await getCamera(cameraId); // step 1
  const controller = new AbortController();
  const stop = (signal) => {
    log('shutdown_requested', { signal });
    controller.abort();
  };
  const onInterrupt = () => stop('SIGINT');
  const onTerminate = () => stop('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  log('worker_started', { camera: camera.id, areas: camera.parkingAreas.map((area) => area.id), model, outputDir, intervalSeconds: interval / 1000, once });
  const ask = (request) => askModel({ apiKey, signal: controller.signal, ...request });
  const analyze = ({ png, camera, media }) => analyzeFrame({ browser, png, camera, media, model, ask });
  try {
    do {
      const { ok } = await runCycle({ browser, camera, outputDir, analyze }); // steps 2-5
      // Frames are only input for the analysis: discard them (and the crops) whether or not it succeeded.
      await rm(join(outputDir, camera.id), { recursive: true, force: true });
      log('cycle_finished', { camera: camera.id, ok });
      if (once) {
        if (!ok) process.exitCode = 1;
        break;
      }
      if (!controller.signal.aborted) {
        await setTimeout(interval, undefined, { signal: controller.signal }).catch((error) => {
          if (error.name !== 'AbortError') throw error;
        });
      }
    } while (!controller.signal.aborted);
  } finally {
    await browser.close();
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    log('worker_stopped', { camera: camera.id });
  }
}

main().catch((error) => {
  log('fatal_error', { message: error.message });
  process.exitCode = 1;
});
