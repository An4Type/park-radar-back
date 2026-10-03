// Zoom into hand-marked parking areas of a captured frame.
// Areas are normalized polygons, so they survive viewport changes but only make sense for a
// fixed camera view: a panning camera needs viewpoint matching before areas are applied.
const LONG_SIDE = 1280;
const MAX_SCALE = 4;
const PADDING = 0.03;

export function pngSize(png) {
  if (png.length < 24 || png.subarray(1, 4).toString() !== 'PNG') throw new Error('Not a PNG image');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

// Pixel bounding box of a polygon, grown by a fraction of its size and clamped to the image.
export function cropRect(points, { width, height }, padding = PADDING) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const padX = (Math.max(...xs) - Math.min(...xs)) * padding;
  const padY = (Math.max(...ys) - Math.min(...ys)) * padding;
  // EPSILON stops float noise (e.g. 0.42 * 1000 = 420.00000000000006) from adding a pixel.
  const EPSILON = 1e-9;
  const x1 = Math.max(0, Math.floor((Math.min(...xs) - padX) * width + EPSILON));
  const y1 = Math.max(0, Math.floor((Math.min(...ys) - padY) * height + EPSILON));
  const x2 = Math.min(width, Math.ceil((Math.max(...xs) + padX) * width - EPSILON));
  const y2 = Math.min(height, Math.ceil((Math.max(...ys) + padY) * height - EPSILON));
  return { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
}

// Upscaling only interpolates: it makes small areas easier to inspect but adds no detail.
export function zoomScale({ width, height }) {
  return Math.max(1, Math.min(MAX_SCALE, LONG_SIDE / Math.max(width, height)));
}

// Returns one cropped, upscaled PNG per area. Cropping runs in a fresh Chromium context so no
// image library is needed.
export async function zoomAreas(browser, png, areas) {
  const size = pngSize(png);
  const jobs = areas.map((area) => {
    const rect = cropRect(area.points, size);
    return {
      id: area.id, mask: area.mask, rect, scale: zoomScale(rect),
      polygon: area.points.map(([x, y]) => [x * size.width - rect.x, y * size.height - rect.y]),
    };
  });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const encoded = await page.evaluate(async ({ source, jobs }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      return jobs.map(({ rect, scale, mask, polygon }) => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(rect.width * scale);
        canvas.height = Math.round(rect.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (mask) {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.beginPath();
          polygon.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x * scale, y * scale));
          ctx.closePath();
          ctx.clip();
        }
        ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png').split(',')[1];
      });
    }, { source: `data:image/png;base64,${png.toString('base64')}`, jobs });
    return jobs.map(({ id, rect, scale, mask }, i) => ({ id, rect, scale, mask, png: Buffer.from(encoded[i], 'base64') }));
  } finally {
    await context.close();
  }
}
