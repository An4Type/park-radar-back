import { mkdir, writeFile, rename, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { zoomAreas } from './zoom.js';

export function log(event, details = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...details }));
}

async function atomicWrite(path, data) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, data);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function prune(directory, maxCaptures) {
  const names = await readdir(directory);
  const files = names.filter((file) => /^\d{4}-.*\.json$/.test(file)).sort();
  for (const file of files.slice(0, Math.max(0, files.length - maxCaptures))) {
    // A capture's files all share its timestamp stem: .json, .png and per-area zoom crops.
    const stem = file.replace(/\.json$/, '');
    for (const name of names) {
      if (name.startsWith(`${stem}.`) && /\.(json|png)$/.test(name)) await rm(join(directory, name), { force: true });
    }
  }
}

async function waitForMedia(locator, type, timeoutMs) {
  await locator.waitFor({ state: 'visible', timeout: timeoutMs });
  // Poll inside Chromium: visibility alone would allow broken images or blank players.
  await locator.evaluate((element, { type, timeoutMs }) => new Promise((resolve, reject) => {
    const started = Date.now();
    const initialVideoTime = element instanceof HTMLVideoElement ? element.currentTime : 0;
    const check = () => {
      const ready = type === 'image'
        ? element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0
        : element instanceof HTMLVideoElement && element.readyState >= 2 && element.videoWidth > 0 && !element.paused && element.currentTime > initialVideoTime;
      if (ready) return resolve();
      if (Date.now() - started >= timeoutMs) return reject(new Error(`${type} did not load before timeout`));
      setTimeout(check, 100);
    };
    check();
  }), { type, timeoutMs });
}

async function waitForUnobstructed(locator, timeoutMs) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((element, timeoutMs) => new Promise((resolve, reject) => {
    const started = Date.now();
    const points = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
    const transparent = (layer) => {
      // Invisible controls still intercept pointer hit tests (e.g. YouTube).
      for (let parent = layer; parent; parent = parent.parentElement) {
        if (Number(getComputedStyle(parent).opacity) === 0) return true;
      }
      if (/^(IMG|VIDEO|CANVAS|IFRAME|SVG|OBJECT|EMBED)$/.test(layer.tagName)) return false;
      const style = getComputedStyle(layer);
      const noBackground = style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.backgroundImage === 'none';
      const ownText = [...layer.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
      const pseudo = ['::before', '::after'].some((name) => {
        const s = getComputedStyle(layer, name);
        return !['none', 'normal'].includes(s.content) && s.display !== 'none' && Number(s.opacity) > 0;
      });
      return noBackground && !ownText && !pseudo && style.boxShadow === 'none' && style.filter === 'none'
        && style.backdropFilter === 'none' && ['Top', 'Right', 'Bottom', 'Left'].every((side) => style[`border${side}Width`] === '0px');
    };
    const check = () => {
      const rect = element.getBoundingClientRect();
      const visible = points.filter(([x, y]) => {
        const layers = element.ownerDocument.elementsFromPoint(rect.left + rect.width * x, rect.top + rect.height * y);
        for (const layer of layers) {
          if (layer === element || element.contains(layer)) return !transparent(element);
          if (!transparent(layer)) return false;
        }
        return false;
      }).length;
      // Allow corner branding/controls; reject adverts covering most of the media.
      if (visible >= 3) return resolve();
      if (Date.now() - started >= timeoutMs) return reject(new Error('Camera media is obstructed by an overlay'));
      setTimeout(check, 100);
    };
    check();
  }), timeoutMs);
}

async function screenshot(browser, camera) {
  const context = await browser.newContext({ viewport: camera.viewport, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
  const page = await context.newPage();
  const mediaHeaders = new Map();
  page.on('response', (response) => {
    if (['image', 'media'].includes(response.request().resourceType())) {
      mediaHeaders.set(response.url(), response.headers());
    }
  });
  page.setDefaultTimeout(camera.timeoutMs);
  page.setDefaultNavigationTimeout(camera.timeoutMs);
  try {
    // Streaming pages may never become network-idle.
    const response = await page.goto(camera.url, { waitUntil: 'domcontentloaded' });
    if (!response || !response.ok()) throw new Error(`Navigation returned HTTP ${response?.status() ?? 'no response'}`);
    for (const selector of camera.clickSelectors) await page.locator(selector).first().click();
    const scope = camera.frameSelector ? page.frameLocator(camera.frameSelector) : page;
    let media = null;
    if (camera.readySelector) {
      const ready = scope.locator(camera.readySelector).first();
      if (camera.mediaType === 'video') {
        await ready.waitFor({ state: 'visible' });
        await ready.evaluate((element, startPlayback) => {
          if (!(element instanceof HTMLVideoElement)) throw new Error('Video readySelector must select a <video>');
          element.muted = true;
          // Readiness polling bounds the wait even if play() never settles.
          if (startPlayback) element.play().catch(() => {});
        }, camera.startPlayback);
      }
      if (camera.mediaType === 'page') await ready.waitFor({ state: 'visible' });
      else await waitForMedia(ready, camera.mediaType, camera.timeoutMs);
      if (camera.mediaType !== 'page') {
        const mediaUrl = await ready.evaluate((element) => element.currentSrc || element.src);
        const headers = mediaHeaders.get(mediaUrl) ?? {};
        const modifiedTime = Date.parse(headers['last-modified']);
        const ageSeconds = Number.isFinite(modifiedTime) ? Math.max(0, Math.floor((Date.now() - modifiedTime) / 1000)) : null;
        media = {
          url: mediaUrl, lastModified: headers['last-modified'] ?? null,
          ageSeconds,
          freshness: ageSeconds === null ? 'unknown' : ageSeconds > camera.maxMediaAgeSeconds ? 'stale' : 'recent',
          maxAgeSeconds: camera.maxMediaAgeSeconds,
          playbackAdvancing: camera.mediaType === 'video',
        };
      }
    }
    // Keep hover controls and expandable adverts away from the camera crop.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(camera.settleMs);
    if (camera.readySelector && camera.mediaType !== 'page') {
      // Check the outer document as well when media is inside an iframe.
      if (camera.frameSelector) await waitForUnobstructed(page.locator(camera.frameSelector).first(), camera.timeoutMs);
      await waitForUnobstructed(scope.locator(camera.readySelector).first(), camera.timeoutMs);
      // Players can pause again while adverts/overlays are being dismissed.
      if (camera.mediaType === 'video') await waitForMedia(scope.locator(camera.readySelector).first(), 'video', camera.timeoutMs);
    }
    const target = camera.selector ? scope.locator(camera.selector).first() : page;
    const png = await target.screenshot({ type: 'png', timeout: camera.timeoutMs, ...(camera.selector ? {} : { fullPage: camera.fullPage }) });
    return { png, finalUrl: page.url(), httpStatus: response.status(), media };
  } catch (error) {
    // Diagnostics are kept separately and never overwrite the last successful capture.
    const diagnostic = await page.screenshot({ type: 'png', timeout: 5000 }).catch(() => undefined);
    throw Object.assign(error, { diagnostic });
  } finally {
    await context.close();
  }
}

export async function captureCamera(browser, camera, outputDir) {
  const directory = join(outputDir, camera.id);
  await mkdir(directory, { recursive: true });
  for (let attempt = 1; attempt <= camera.attempts; attempt++) {
    let result;
    try {
      result = await screenshot(browser, camera);
    } catch (error) {
      log('capture_failed', { camera: camera.id, attempt, message: error.message });
      if (attempt < camera.attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      const stem = `${new Date().toISOString().replace(/[:.]/g, '-')}-error`;
      const metadata = { cameraId: camera.id, url: camera.url, status: 'error', capturedAt: new Date().toISOString(), error: error.message };
      if (error.diagnostic) await atomicWrite(join(directory, `${stem}.png`), error.diagnostic);
      await atomicWrite(join(directory, `${stem}.json`), JSON.stringify(metadata, null, 2) + '\n');
      await prune(directory, camera.maxCaptures);
      return { ok: false, ...metadata };
    }
    const capturedAt = new Date().toISOString();
    const stem = capturedAt.replace(/[:.]/g, '-');
    const filename = `${stem}.png`;
    // Zooming is derived data: a failure is reported but never discards the verified capture.
    let zooms = [];
    let zoomError;
    if (camera.parkingAreas.length) {
      try {
        zooms = await zoomAreas(browser, result.png, camera.parkingAreas);
      } catch (error) {
        zoomError = error.message;
        log('zoom_failed', { camera: camera.id, message: error.message });
      }
    }
    const metadata = {
      cameraId: camera.id, name: camera.name ?? camera.id, status: 'ok', capturedAt,
      url: camera.url, sourceUrl: camera.sourceUrl ?? camera.url,
      finalUrl: result.finalUrl, httpStatus: result.httpStatus,
      mediaType: camera.mediaType, viewport: camera.viewport,
      media: result.media,
      selector: camera.selector ?? null, frameSelector: camera.frameSelector ?? null,
      filename,
      ...(camera.parkingAreas.length ? {
        parkingAreas: zooms.map(({ id, rect, scale, mask }) => ({ id, file: `${stem}.${id}.png`, crop: rect, scale, mask })),
        ...(zoomError ? { zoomError } : {}),
      } : {}),
    };
    const json = JSON.stringify(metadata, null, 2) + '\n';
    for (const zoom of zooms) await atomicWrite(join(directory, `${stem}.${zoom.id}.png`), zoom.png);
    await atomicWrite(join(directory, filename), result.png);
    await atomicWrite(join(directory, filename.replace(/\.png$/, '.json')), json);
    await atomicWrite(join(directory, 'latest.png'), result.png);
    await atomicWrite(join(directory, 'latest.json'), json);
    for (const zoom of zooms) await atomicWrite(join(directory, `latest.${zoom.id}.png`), zoom.png);
    await prune(directory, camera.maxCaptures);
    log('capture_saved', { camera: camera.id, path: join(directory, filename), bytes: result.png.length, mediaFreshness: result.media?.freshness ?? 'unknown' });
    return { ok: true, ...metadata };
  }
}
