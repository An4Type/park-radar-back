import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { BrowserManager } from './browser.js';
import { ParkingMonitor, type WorkerMode } from './monitor.js';
import { claimParking, releaseParking, renewLease } from './assignment.js';
import { prisma } from '../../../packages/database/src/client.js';
import { errorMessage, log } from '../../../packages/shared/src/log.js';

function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

const workerId = process.env.WORKER_ID || `${hostname()}-${randomUUID()}`;
const mode = (process.env.WORKER_MODE ?? 'mock') as WorkerMode;
if (mode !== 'mock' && mode !== 'playwright') throw new Error('WORKER_MODE must be mock or playwright');
if ((process.env.RECOGNITION_PROVIDER ?? 'mock') !== 'mock') throw new Error('Only RECOGNITION_PROVIDER=mock is bundled; connect the existing recognition adapter before choosing another provider');
const maxParkings = positiveInt('MAX_PARKINGS_PER_WORKER', 3);
const leaseSeconds = positiveInt('WORKER_LEASE_SECONDS', 30);
const heartbeatSeconds = positiveInt('WORKER_HEARTBEAT_SECONDS', 10);
const captureIntervalMs = positiveInt('CAPTURE_INTERVAL_SECONDS', 5) * 1000;
if (heartbeatSeconds >= leaseSeconds) throw new Error('WORKER_HEARTBEAT_SECONDS must be less than WORKER_LEASE_SECONDS');

const browser = new BrowserManager();
const monitors = new Map<string, ParkingMonitor>();
let stopping = false;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  log('worker', 'started', { workerId, mode, maxParkings });
  const heartbeat = setInterval(() => {
    void (async () => {
      for (const [parkingId, monitor] of monitors) {
        try {
          if (!await renewLease(parkingId, workerId, leaseSeconds)) {
            monitor.stop();
            monitors.delete(parkingId);
            log('worker', 'lease_lost', { workerId, parkingId });
          }
        } catch (error) {
          log('worker', 'heartbeat_error', { workerId, parkingId, error: errorMessage(error) });
        }
      }
    })();
  }, heartbeatSeconds * 1000);

  while (!stopping) {
    try {
      if (monitors.size < maxParkings) {
        const parking = await claimParking(workerId, leaseSeconds);
        if (parking) {
          const monitor = new ParkingMonitor(parking, workerId, mode, browser, captureIntervalMs);
          monitors.set(parking.id, monitor);
          log('worker', 'parking_claimed', { workerId, parkingId: parking.id });
          void monitor.run()
            .catch((error) => log('worker', 'monitor_error', { workerId, parkingId: parking.id, error: errorMessage(error) }))
            .finally(() => {
              if (monitors.get(parking.id) === monitor) {
                monitors.delete(parking.id);
                void releaseParking(parking.id, workerId).catch((error) => log('worker', 'release_error', { workerId, parkingId: parking.id, error: errorMessage(error) }));
              }
            });
        }
      }
    } catch (error) {
      log('worker', 'claim_error', { workerId, error: errorMessage(error) });
    }
    await sleep(2000);
  }
  clearInterval(heartbeat);
  for (const monitor of monitors.values()) monitor.stop();
  for (const parkingId of monitors.keys()) {
    try { await releaseParking(parkingId, workerId); }
    catch (error) { log('worker', 'release_error', { workerId, parkingId, error: errorMessage(error) }); }
  }
  await browser.close();
  await prisma.$disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; });
void main().catch((error) => { log('worker', 'fatal_error', { workerId, error: errorMessage(error) }); process.exitCode = 1; });
