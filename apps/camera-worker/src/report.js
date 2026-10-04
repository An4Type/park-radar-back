import { log } from './capture.js';

const KIND_FIELDS = { regular: 'occupiedSpaces', disabled: 'occupiedDisabledSpaces', ev: 'occupiedEvChargerSpaces' };

function countsByKind(areas) {
  const counts = {};
  for (const area of areas) {
    const field = KIND_FIELDS[area.kind ?? 'regular'];
    counts[field] = (counts[field] ?? 0) + area.vehicles;
  }
  return counts;
}

// Turns one cycle result into the payload of POST /api/parking/:id/occupancy.
// A failed capture is a stream problem; an unusable or failed analysis keeps the last known count.
export function buildReport(camera, result) {
  if (!camera.parkingId) return null;
  const recognizedAt = new Date().toISOString();
  if (result.reason === 'capture') return { status: 'STREAM_ERROR', recognizedAt };
  if (!result.ok) return { status: 'RECOGNITION_ERROR', recognizedAt };
  const { analysis } = result;
  if (analysis.state !== 'ok') return { status: 'RECOGNITION_ERROR', recognizedAt, data: { model: analysis.model, reasons: analysis.reasons } };
  const confidences = analysis.areas.map((area) => area.confidence).filter((c) => c !== null);
  return {
    status: 'ACTIVE',
    recognizedAt: result.capturedAt ?? recognizedAt,
    // One count per pool; a pool the camera has no area for is left out so its last known value is kept.
    ...countsByKind(analysis.areas),
    // The least certain area bounds how far the total can be trusted.
    confidence: confidences.length ? Math.min(...confidences) : null,
    data: { model: analysis.model, cameraId: camera.id, areas: analysis.areas, totalFree: analysis.totalFree },
  };
}

// Reporting is best effort: an unreachable API must never stop the capture loop.
export async function sendReport({ report, parkingId, signal, env = process.env, fetchImpl = fetch }) {
  const base = env.INGEST_URL;
  if (!base) return false;
  try {
    const response = await fetchImpl(new URL(`/api/parking/${parkingId}/occupancy`, base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.INGEST_TOKEN ?? ''}` },
      body: JSON.stringify(report),
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10000)]),
    });
    if (!response.ok) throw new Error(`API answered ${response.status}`);
    log('report_sent', { parkingId, status: report.status });
    return true;
  } catch (error) {
    log('report_failed', { parkingId, message: error.message });
    return false;
  }
}
