import { describe, expect, it } from 'vitest';
import { MockRecognitionProvider, validateRecognition } from '../apps/worker/src/recognition.js';

describe('recognition results', () => {
  it('validates values and clamps over-capacity results', () => {
    expect(validateRecognition({ occupiedSpaces: 83, confidence: 0.94 }, 120)).toMatchObject({ occupiedSpaces: 83, clamped: false });
    expect(validateRecognition({ occupiedSpaces: 130 }, 120)).toMatchObject({ occupiedSpaces: 120, clamped: true });
  });

  it.each([-1, 1.5, NaN, Infinity, '5', null])('rejects invalid occupiedSpaces: %s', (occupiedSpaces) => {
    expect(() => validateRecognition({ occupiedSpaces }, 100)).toThrow();
  });

  it('rejects invalid confidence and metadata', () => {
    expect(() => validateRecognition({ occupiedSpaces: 2, confidence: 1.2 }, 10)).toThrow();
    expect(() => validateRecognition({ occupiedSpaces: 2, metadata: [] }, 10)).toThrow();
  });

  it('produces changing bounded mock occupancies', async () => {
    const provider = new MockRecognitionProvider(100, 'parking-1');
    const a = await provider.analyze(Buffer.alloc(0));
    const b = await provider.analyze(Buffer.alloc(0));
    expect(a.occupiedSpaces).not.toBe(b.occupiedSpaces);
    expect(a.occupiedSpaces).toBeGreaterThanOrEqual(0);
    expect(a.occupiedSpaces).toBeLessThanOrEqual(100);
  });
});
