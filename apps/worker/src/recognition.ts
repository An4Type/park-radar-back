export interface RecognitionResult {
  occupiedSpaces: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface RecognitionProvider {
  analyze(image: Buffer): Promise<RecognitionResult>;
}

export class MockRecognitionProvider implements RecognitionProvider {
  private sequence = 0;
  constructor(private readonly capacity: number, private readonly parkingId: string) {}

  async analyze(_image: Buffer): Promise<RecognitionResult> {
    this.sequence += 1;
    const hash = [...this.parkingId].reduce((value, char) => value + char.charCodeAt(0), 0);
    const occupancy = Math.round(this.capacity * (0.25 + ((hash + this.sequence * 17) % 60) / 100));
    return {
      occupiedSpaces: occupancy,
      confidence: 0.92,
      metadata: { carsDetected: occupancy, model: 'mock-v1', sequence: this.sequence },
    };
  }
}

export function validateRecognition(value: unknown, capacity: number): RecognitionResult & { clamped: boolean } {
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Invalid parking capacity');
  if (typeof value !== 'object' || value === null) throw new Error('Recognition result must be an object');
  const result = value as Partial<RecognitionResult>;
  if (!Number.isSafeInteger(result.occupiedSpaces) || (result.occupiedSpaces ?? -1) < 0) {
    throw new Error('occupiedSpaces must be a non-negative integer');
  }
  if (result.confidence !== undefined && (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1)) {
    throw new Error('confidence must be between 0 and 1');
  }
  if (result.metadata !== undefined && (typeof result.metadata !== 'object' || result.metadata === null || Array.isArray(result.metadata))) {
    throw new Error('metadata must be an object');
  }
  return {
    occupiedSpaces: Math.min(result.occupiedSpaces!, capacity),
    confidence: result.confidence,
    metadata: result.metadata,
    clamped: result.occupiedSpaces! > capacity,
  };
}
