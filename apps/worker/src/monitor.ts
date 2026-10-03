import type { Page } from 'playwright';
import { BrowserManager } from './browser.js';
import { MockRecognitionProvider, type RecognitionProvider, validateRecognition } from './recognition.js';
import { saveRecognition, setFailureStatus, type ClaimedParking } from './assignment.js';
import { errorMessage, log } from '../../../packages/shared/src/log.js';

export type WorkerMode = 'mock' | 'playwright';

export class ParkingMonitor {
  private running = true;
  private page: Page | null = null;
  private readonly provider: RecognitionProvider;

  constructor(
    private readonly parking: ClaimedParking,
    private readonly workerId: string,
    private readonly mode: WorkerMode,
    private readonly browser: BrowserManager,
    private readonly captureIntervalMs: number,
    provider?: RecognitionProvider,
  ) {
    // Replace this provider with an adapter to the existing recognition implementation.
    this.provider = provider ?? new MockRecognitionProvider(parking.totalSpaces, parking.id);
  }

  stop(): void {
    this.running = false;
    void this.resetPage();
  }

  private async resetPage(): Promise<void> {
    const page = this.page;
    this.page = null;
    if (page && !page.isClosed()) await page.close().catch(() => undefined);
  }

  private async screenshot(): Promise<Buffer> {
    if (!this.parking.streamUrl) throw new Error('streamUrl is required in playwright mode');
    if (!this.page || this.page.isClosed()) {
      this.page = await this.browser.newPage();
      this.page.on('crash', () => { void this.resetPage(); });
      await this.page.goto(this.parking.streamUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    return this.page.screenshot({ type: 'jpeg', quality: 70, timeout: 15000 });
  }

  async run(): Promise<void> {
    let failures = 0;
    while (this.running) {
      const started = Date.now();
      let image: Buffer;
      try {
        image = this.mode === 'mock' ? Buffer.alloc(0) : await this.screenshot();
      } catch (error) {
        failures += 1;
        await this.resetPage();
        log('worker', 'capture_error', { workerId: this.workerId, parkingId: this.parking.id, error: errorMessage(error) });
        await this.recordFailure('STREAM_ERROR');
        await pause(Math.min(30000, this.captureIntervalMs * 2 ** Math.min(failures, 5)));
        continue;
      }
      try {
        const result = validateRecognition(await this.provider.analyze(image), this.parking.totalSpaces);
        if (result.clamped) log('worker', 'recognition_anomaly', { workerId: this.workerId, parkingId: this.parking.id, error: 'occupiedSpaces exceeded capacity' });
        const saved = await saveRecognition(this.parking.id, this.workerId, result.occupiedSpaces, result.confidence, result.metadata);
        if (!saved) { this.stop(); break; }
        failures = 0;
        log('worker', 'recognition_complete', { workerId: this.workerId, parkingId: this.parking.id, occupiedSpaces: result.occupiedSpaces, durationMs: Date.now() - started });
      } catch (error) {
        failures += 1;
        log('worker', 'recognition_error', { workerId: this.workerId, parkingId: this.parking.id, error: errorMessage(error) });
        await this.recordFailure('RECOGNITION_ERROR');
      }
      await pause(failures ? Math.min(30000, this.captureIntervalMs * 2 ** Math.min(failures, 5)) : this.captureIntervalMs);
    }
    await this.resetPage();
  }

  private async recordFailure(status: 'STREAM_ERROR' | 'RECOGNITION_ERROR'): Promise<void> {
    try {
      if (!await setFailureStatus(this.parking.id, this.workerId, status)) this.stop();
    } catch (error) {
      log('worker', 'database_error', { workerId: this.workerId, parkingId: this.parking.id, error: errorMessage(error) });
    }
  }
}

function pause(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
