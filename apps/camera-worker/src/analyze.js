// Apply a camera's parking areas to a captured frame and ask a vision model to count vehicles per area.
import { pngSize, zoomAreas } from './zoom.js';

export const DEFAULT_MODEL = 'gpt-6-sol';

const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;

// The model sees the full frame with everything outside the areas blacked out and each area outlined
// and labelled, plus one zoomed, masked crop per area. Crops give small areas more pixels.
export async function prepareInputs(browser, png, areas) {
  const { width, height } = pngSize(png);
  const page = await browser.newPage();
  try {
    const encoded = await page.evaluate(async ({ source, areas, width, height }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const shade = document.createElement('canvas');
      shade.width = width; shade.height = height;
      const sctx = shade.getContext('2d');
      sctx.fillStyle = '#000';
      sctx.fillRect(0, 0, width, height);
      sctx.globalCompositeOperation = 'destination-out';
      for (const { points } of areas) {
        sctx.beginPath();
        points.forEach(([x, y], i) => sctx[i ? 'lineTo' : 'moveTo'](x * width, y * height));
        sctx.closePath();
        sctx.fill();
      }
      ctx.drawImage(shade, 0, 0);
      ctx.font = `bold ${Math.round(width / 45)}px sans-serif`;
      for (const { id, points } of areas) {
        ctx.beginPath();
        points.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x * width, y * height));
        ctx.closePath();
        ctx.lineWidth = Math.max(2, width / 400);
        ctx.strokeStyle = '#38bdf8';
        ctx.stroke();
        const [x, y] = points.reduce((best, p) => (p[1] < best[1] ? p : best));
        ctx.lineWidth = Math.max(3, width / 250);
        ctx.strokeStyle = '#000';
        ctx.strokeText(id, x * width + 6, y * height - 6);
        ctx.fillStyle = '#fff';
        ctx.fillText(id, x * width + 6, y * height - 6);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }, { source: dataUrl(png), areas, width, height });
    const crops = await zoomAreas(browser, png, areas.map((area) => ({ ...area, mask: true })));
    return { frame: Buffer.from(encoded, 'base64'), crops };
  } finally {
    await page.close();
  }
}

// Strict structured output: the model can only answer with these fields, so no free text can come back.
export const REPLY_FORMAT = {
  type: 'json_schema',
  name: 'parking_counts',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['areas', 'frame_usable'],
    properties: {
      areas: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'vehicles', 'parked', 'moving', 'confidence'],
          properties: {
            id: { type: 'string' },
            vehicles: { type: 'integer' },
            parked: { type: 'integer' },
            moving: { type: 'integer' },
            confidence: { type: 'number' },
          },
        },
      },
      frame_usable: { type: 'boolean' },
    },
  },
};

export function buildPrompt(areas) {
  return `You will see one frame from a fixed parking camera, then one zoomed crop per parking area. In the full frame everything outside the labelled areas is blacked out; each crop is the same area enlarged, with its surroundings blacked out.
Areas (id, capacity = how many cars fit when full):
${areas.map((a) => `- ${a.id}${a.kind && a.kind !== 'regular' ? ` [${a.kind === 'ev' ? 'EV charger' : 'disabled'} spaces]` : ''}${a.capacity ? ` (capacity ${a.capacity})` : ''}`).join('\n')}
For each area count the separate vehicles inside it, whether parked or moving, and say how many look parked and how many look moving. Use the crop to count precisely and the full frame for context. Cars parked in a row appear as several vehicles close together: count each one, including partly visible ones at the ends of the row. Do not assume an area is full or empty because of its capacity. Return JSON only, with numbers and no commentary or notes:
{"areas": [{"id": string, "vehicles": number, "parked": number, "moving": number, "confidence": number between 0 and 1}],
 "frame_usable": boolean}
Count only vehicles you can clearly see. Use frame_usable=false if the areas are obscured. Do not identify people or read licence plates.`;
}

// Sends the prompt, the annotated frame and the crops to the OpenAI Responses API.
export async function askModel({ apiKey, model, prompt, frame, crops, signal }) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const started = Date.now();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal,
    body: JSON.stringify({
      model,
      text: { format: REPLY_FORMAT },
      max_output_tokens: 4000, // reasoning models spend part of this before answering
      input: [{ role: 'user', content: [
        { type: 'input_text', text: prompt },
        { type: 'input_image', image_url: dataUrl(frame) },
        ...crops.flatMap((crop) => [
          { type: 'input_text', text: `Zoomed crop of ${crop.id}:` },
          { type: 'input_image', image_url: dataUrl(crop.png) },
        ]),
      ] }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? JSON.stringify(data));
  const text = data.output.flatMap((item) => item.content ?? []).map((part) => part.text ?? '').join('');
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('model reply contained no JSON');
  return { reply: JSON.parse(json), seconds: (Date.now() - started) / 1000, usage: data.usage ?? null };
}

// Turns the model's raw reply into per-area results. Free places are only claimed from a usable,
// non-stale frame and a valid answer; otherwise the area is `unknown` and `free` is null.
export function interpretReply(reply, areas, media) {
  const reasons = [];
  if (media?.freshness === 'stale') reasons.push('source frame is stale');
  if (reply?.frame_usable === false) reasons.push('model reports the areas are obscured');
  const results = areas.map((area) => {
    const capacity = area.capacity ?? null;
    const found = Array.isArray(reply?.areas) ? reply.areas.find((a) => a.id === area.id) : undefined;
    const vehicles = Number(found?.vehicles);
    if (!found || !Number.isInteger(vehicles) || vehicles < 0) {
      return { id: area.id, kind: area.kind ?? 'regular', state: 'unknown', vehicles: null, capacity, free: null, reason: found ? 'invalid answer' : 'no answer' };
    }
    const state = reasons.length ? 'unknown' : 'ok';
    const confidence = Number(found.confidence);
    return {
      id: area.id, kind: area.kind ?? 'regular', state, vehicles,
      parked: Number.isFinite(Number(found.parked)) ? Number(found.parked) : null,
      moving: Number.isFinite(Number(found.moving)) ? Number(found.moving) : null,
      capacity,
      free: state === 'ok' && capacity !== null ? Math.max(0, capacity - vehicles) : null,
      overCapacity: capacity !== null && vehicles > capacity,
      confidence: Number.isFinite(confidence) ? confidence : null,
    };
  });
  const complete = results.every((r) => r.free !== null);
  return {
    state: results.every((r) => r.state === 'ok') ? 'ok' : 'unknown',
    reasons,
    areas: results,
    totalFree: complete ? results.reduce((sum, r) => sum + r.free, 0) : null,
  };
}

export async function analyzeFrame({ browser, png, camera, media, model = DEFAULT_MODEL, ask }) {
  const areas = camera.parkingAreas;
  const { frame, crops } = await prepareInputs(browser, png, areas);
  const { reply, seconds, usage } = await ask({ model, prompt: buildPrompt(areas), frame, crops });
  return { model, seconds, usage, ...interpretReply(reply, areas, media) };
}
