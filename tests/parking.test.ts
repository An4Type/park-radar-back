import { describe, expect, it } from 'vitest';
import { freeSpaces, parkingDto, parseBbox } from '../packages/shared/src/parking.js';
import { sampleParking } from './fixtures.js';

describe('parking data', () => {
  it('derives free spaces and never returns a negative value', () => {
    expect(freeSpaces(120, 83)).toBe(37);
    expect(freeSpaces(120, 130)).toBe(0);
  });

  it('maps public and detailed DTOs without worker coordination fields', () => {
    const withLease = { ...sampleParking, workerId: 'worker-1', workerLeaseUntil: new Date() };
    expect(parkingDto(withLease)).toEqual({
      id: sampleParking.id, name: 'Test parking', address: 'Test 1', latitude: 52.4, longitude: 16.9,
      totalSpaces: 120, occupiedSpaces: 83, freeSpaces: 37, status: 'ACTIVE',
      confidence: 0.94, lastUpdatedAt: '2026-10-03T12:00:00.000Z',
    });
    expect(parkingDto(withLease, true)).toHaveProperty('recognitionData', { model: 'mock-v1' });
  });
});

describe('BBOX validation', () => {
  it('accepts a valid geographic box and an omitted box', () => {
    expect(parseBbox({})).toBeUndefined();
    expect(parseBbox({ minLon: '16', minLat: '52', maxLon: '18', maxLat: '53' })).toEqual({ minLon: 16, minLat: 52, maxLon: 18, maxLat: 53 });
  });

  it.each([
    { minLon: '16' },
    { minLon: '16', minLat: '52', maxLon: '18', maxLat: '52' },
    { minLon: '-181', minLat: '52', maxLon: '18', maxLat: '53' },
    { minLon: '16', minLat: '52', maxLon: 'NaN', maxLat: '53' },
    { minLon: ['16', '17'], minLat: '52', maxLon: '18', maxLat: '53' },
    { minLon: ' ', minLat: '52', maxLon: '18', maxLat: '53' },
  ])('rejects malformed BBOX values', (input) => {
    expect(() => parseBbox(input)).toThrow();
  });
});
