import { readFile } from 'node:fs/promises';

function integer(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function url(value, name) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be an HTTP(S) URL`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${name} must be an HTTP(S) URL without credentials`);
  }
  return value;
}

// Parking areas are hand-marked polygons in normalized image coordinates (0–1, origin top-left).
// Their ids become file name parts, so they are restricted like camera ids.
function parkingAreas(value, cameraId) {
  if (!Array.isArray(value)) throw new Error(`${cameraId}.parkingAreas must be an array`);
  const ids = new Set();
  return value.map((area) => {
    if (!area || typeof area !== 'object' || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(area.id)) {
      throw new Error(`${cameraId}: parking area id must contain 1–32 lowercase letters, numbers or hyphens`);
    }
    if (ids.has(area.id)) throw new Error(`${cameraId}: duplicate parking area id ${area.id}`);
    ids.add(area.id);
    const { points } = area;
    const valid = Array.isArray(points) && points.length >= 3 && points.every((point) => (
      Array.isArray(point) && point.length === 2 && point.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
    ));
    if (!valid) throw new Error(`${cameraId}.${area.id}: points must be at least 3 [x, y] pairs between 0 and 1`);
    // Shoelace formula: reject polygons with no area (collinear or repeated points).
    const twiceArea = Math.abs(points.reduce((sum, [x, y], i) => {
      const [nextX, nextY] = points[(i + 1) % points.length];
      return sum + x * nextY - nextX * y;
    }, 0));
    if (twiceArea < 1e-6) throw new Error(`${cameraId}.${area.id}: polygon has no area`);
    if (area.mask !== undefined && typeof area.mask !== 'boolean') throw new Error(`${cameraId}.${area.id}: mask must be a boolean`);
    // capacity is the number of cars the area holds when full, recorded by hand.
    if (area.capacity !== undefined) integer(area.capacity, `${cameraId}.${area.id}.capacity`, 1, 500);
    return { id: area.id, points, mask: area.mask ?? false, ...(area.capacity !== undefined ? { capacity: area.capacity } : {}) };
  });
}

export function validateCameras(input) {
  if (!Array.isArray(input) || input.length === 0) throw new Error('Configure at least one camera');
  const ids = new Set();
  const cameras = input.map((camera) => {
    if (!camera || typeof camera !== 'object' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(camera.id)) {
      throw new Error('Camera id must contain 1–64 lowercase letters, numbers or hyphens');
    }
    if (ids.has(camera.id)) throw new Error(`Duplicate camera id: ${camera.id}`);
    ids.add(camera.id);
    const result = {
      enabled: true,
      viewport: { width: 1280, height: 720 },
      mediaType: 'image',
      timeoutMs: 30000,
      settleMs: 1000,
      attempts: 2,
      maxCaptures: 288,
      maxMediaAgeSeconds: 900,
      fullPage: false,
      clickSelectors: [],
      startPlayback: true,
      parkingAreas: [],
      ...camera,
    };
    result.parkingAreas = parkingAreas(result.parkingAreas, camera.id);
    url(result.url, `${camera.id}.url`);
    if (result.sourceUrl !== undefined) url(result.sourceUrl, `${camera.id}.sourceUrl`);
    if (!['image', 'video', 'page'].includes(result.mediaType)) throw new Error('mediaType must be image, video or page');
    for (const key of ['selector', 'readySelector', 'frameSelector']) {
      if (result[key] !== undefined && (typeof result[key] !== 'string' || !result[key].trim())) {
        throw new Error(`${camera.id}.${key} must be a nonempty selector`);
      }
    }
    if (result.mediaType !== 'page' && !result.readySelector) {
      throw new Error(`${camera.id}: image/video cameras require readySelector`);
    }
    if (typeof result.enabled !== 'boolean' || typeof result.fullPage !== 'boolean') throw new Error('enabled and fullPage must be booleans');
    if (typeof result.startPlayback !== 'boolean') throw new Error('startPlayback must be a boolean');
    if (!Array.isArray(result.clickSelectors) || result.clickSelectors.some((s) => typeof s !== 'string' || !s.trim())) {
      throw new Error('clickSelectors must be an array of nonempty selectors');
    }
    integer(result.viewport?.width, 'viewport.width', 1, 7680);
    integer(result.viewport?.height, 'viewport.height', 1, 4320);
    integer(result.timeoutMs, 'timeoutMs', 100, 120000);
    integer(result.settleMs, 'settleMs', 0, 60000);
    integer(result.attempts, 'attempts', 1, 5);
    integer(result.maxCaptures, 'maxCaptures', 1, 100000);
    integer(result.maxMediaAgeSeconds, 'maxMediaAgeSeconds', 1, 86400);
    return result;
  });
  const enabled = cameras.filter((camera) => camera.enabled);
  if (!enabled.length) throw new Error('Configure at least one enabled camera');
  return enabled;
}

export async function loadCameras(file) {
  return validateCameras(JSON.parse(await readFile(file, 'utf8')));
}

export function intervalMs(value = '300') {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('CAPTURE_INTERVAL_SECONDS must be an integer');
  return integer(Number(value), 'CAPTURE_INTERVAL_SECONDS', 1, 86400) * 1000;
}
