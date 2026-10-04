import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrompt, frameBoxes, replyFormat, REPLY_FORMAT } from '../src/analyze.js';

const crop = { rect: { x: 100, y: 200, width: 200, height: 100 } };
const size = { width: 1000, height: 1000 };

test('maps crop-relative boxes to fractions of the full frame', () => {
  const boxes = frameBoxes([{ box: [0, 0, 0.5, 1], motion: 'moving' }], crop, size);
  assert.deepEqual(boxes, [{ motion: 'moving', box: [0.1, 0.2, 0.2, 0.3] }]);
});

test('clamps boxes and drops invalid ones', () => {
  const boxes = frameBoxes([
    { box: [-1, 0, 2, 1], motion: 'parked' },
    { box: [0.5, 0.5, 0.4, 0.9], motion: 'parked' },
    { box: [0, 0, 1], motion: 'parked' },
    { box: [0, 0, NaN, 1], motion: 'parked' },
  ], crop, size);
  assert.deepEqual(boxes, [{ motion: 'parked', box: [0.1, 0.2, 0.3, 0.3] }]);
  assert.deepEqual(frameBoxes(undefined, crop, size), []);
});

test('boxes are opt-in for the schema and the prompt', () => {
  const areas = [{ id: 'a', points: [[0, 0], [1, 0], [1, 1]], capacity: 1 }];
  const item = (format) => format.schema.properties.areas.items;
  assert.equal(item(REPLY_FORMAT).properties.detections, undefined);
  assert.ok(item(replyFormat({ boxes: true })).required.includes('detections'));
  assert.ok(!buildPrompt(areas).includes('detections'));
  assert.ok(buildPrompt(areas, { boxes: true }).includes('detections'));
});
