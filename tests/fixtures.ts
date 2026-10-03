import type { ParkingRecord } from '../packages/shared/src/parking.js';

export const sampleParking: ParkingRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Test parking', address: 'Test 1', latitude: 52.4, longitude: 16.9,
  totalSpaces: 120, occupiedSpaces: 83, status: 'ACTIVE',
  recognitionConfidence: 0.94, recognitionData: { model: 'mock-v1' },
  lastRecognizedAt: new Date('2026-10-03T12:00:00.000Z'),
};
