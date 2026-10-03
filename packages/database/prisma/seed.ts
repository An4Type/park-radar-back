import 'dotenv/config';
import { prisma } from '../src/client.js';
import type { Prisma } from '../generated/prisma/client.js';

const parkings = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Stary Browar', address: 'Półwiejska 42, Poznań', latitude: 52.4009, longitude: 16.9281, totalSpaces: 320, occupiedSpaces: 170 },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Posnania', address: 'Pleszewska 1, Poznań', latitude: 52.3970, longitude: 16.9542, totalSpaces: 500, occupiedSpaces: 290 },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Avenida Poznań', address: 'Matyi 2, Poznań', latitude: 52.4004, longitude: 16.9128, totalSpaces: 230, occupiedSpaces: 120 },
  { id: '00000000-0000-4000-8000-000000000004', name: 'Galeria Malta', address: 'Maltańska 1, Poznań', latitude: 52.4082, longitude: 16.9616, totalSpaces: 180, occupiedSpaces: 65 },
  { id: '00000000-0000-4000-8000-000000000005', name: 'Plac Wolności', address: 'Plac Wolności 18, Poznań', latitude: 52.4091, longitude: 16.9254, totalSpaces: 95, occupiedSpaces: 55 },
  { id: '00000000-0000-4000-8000-000000000006', name: 'AGH street parking', address: 'Główna Aleja Kampusu AGH, al. Mickiewicza 30, Kraków', latitude: 50.0639, longitude: 19.9241, totalSpaces: 8, occupiedSpaces: 0 },
];

// Camera definitions the workers load by id (previously apps/camera-worker/config/cameras.json).
const cameras: Prisma.CameraUncheckedCreateInput[] = [
  {
    "id": "krakow-plac-wszystkich-swietych-live",
    "name": "Kraków — Plac Wszystkich Świętych",
    "enabled": false,
    "url": "https://www.webcamera.pl/kamera/krakow-plac-wszystkich-swietych/",
    "description": "Experimental public live player: adverts can obscure the video and transparent ad iframes can fail obstruction checks. Use the enabled official still widget for regular captures.",
    "sourceUrl": "https://www.webcamera.pl/kamera/krakow-plac-wszystkich-swietych/",
    "mediaType": "video",
    "selector": "#stream-player",
    "readySelector": "#video",
    "startPlayback": false,
    "timeoutMs": 60000,
    "settleMs": 5000,
    "attempts": 2,
    "maxCaptures": 288,
    "clickSelectors": [
      "button:has-text('Zaakceptuj wszystko'):visible, button:has-text('Accept All'):visible",
      ".stream-player__main-button"
    ],
    "viewportWidth": 1920,
    "viewportHeight": 1080
  },
  {
    "id": "krakow-nowa-huta",
    "name": "Kraków — Nowa Huta, Plac Centralny",
    "enabled": true,
    "url": "https://imageserver.webcamera.pl/umiesc/krakow-nowa-huta",
    "description": "Current public square/street view when checked on 2026-10-03. Parked cars are visible along the receding street at upper left, but individual bays are distant; validate region visibility before occupancy analysis.",
    "sourceUrl": "https://www.webcamera.pl/kamera/krakow-nowa-huta/umiesc",
    "mediaType": "image",
    "selector": ".wc-widget",
    "readySelector": "img.wc-image",
    "timeoutMs": 30000,
    "settleMs": 1000,
    "attempts": 2,
    "maxCaptures": 288,
    "maxMediaAgeSeconds": 900,
    "viewportWidth": 1920,
    "viewportHeight": 1080
  },
  {
    "id": "krakow-szeroka",
    "name": "Kraków — ulica Szeroka, Kazimierz",
    "enabled": false,
    "url": "https://imageserver.webcamera.pl/umiesc/krakow-kazimierz-szeroka",
    "description": "Parking prototype only: public street view with visible marked bays. On 2026-10-03 the widget image had Last-Modified 2025-02-19; do not use as current parking availability.",
    "sourceUrl": "https://krakow-kazimierz-szeroka.webcamera.pl/umiesc",
    "mediaType": "image",
    "selector": ".wc-widget",
    "readySelector": "img.wc-image",
    "timeoutMs": 30000,
    "settleMs": 1000,
    "attempts": 2,
    "maxCaptures": 288,
    "maxMediaAgeSeconds": 900,
    "viewportWidth": 1280,
    "viewportHeight": 720
  },
  {
    "id": "krakow-agh-stream1",
    "name": "Kraków — AGH (stream 1)",
    "enabled": true,
    "url": "http://live.uci.agh.edu.pl/video/stream1.shtml",
    "description": "Public AGH university camera, fixed view of a street with kerbside parked cars; no marked bays; a flag obstructs the right foreground.",
    "sourceUrl": "http://live.uci.agh.edu.pl/video/stream1.shtml",
    "mediaType": "video",
    "selector": "video",
    "readySelector": "video",
    "timeoutMs": 45000,
    "settleMs": 3000,
    "attempts": 2,
    "maxCaptures": 288,
    "parkingAreas": [
      {
        "id": "area-5",
        "points": [
          [
            0.3285,
            0.2193
          ],
          [
            0.3608,
            0.2012
          ],
          [
            0.4041,
            0.3278
          ],
          [
            0.3582,
            0.3504
          ],
          [
            0.3268,
            0.2208
          ]
        ],
        "capacity": 5
      },
      {
        "id": "area-2",
        "points": [
          [
            0.4278,
            0.5433
          ],
          [
            0.5458,
            0.9895
          ],
          [
            0.7572,
            0.9895
          ],
          [
            0.5085,
            0.5177
          ],
          [
            0.4295,
            0.5388
          ]
        ],
        "capacity": 2
      },
      {
        "id": "area-3",
        "points": [
          [
            0.5764,
            0.4017
          ],
          [
            0.5781,
            0.3097
          ],
          [
            0.708,
            0.3067
          ],
          [
            0.7046,
            0.4002
          ],
          [
            0.5756,
            0.4002
          ]
        ],
        "capacity": 1
      }
    ],
    "viewportWidth": 1920,
    "viewportHeight": 1080,
    "parkingId": "00000000-0000-4000-8000-000000000006"
  }
];

try {
  for (const parking of parkings) {
    await prisma.parking.upsert({
      where: { id: parking.id },
      update: { name: parking.name, address: parking.address, latitude: parking.latitude, longitude: parking.longitude, totalSpaces: parking.totalSpaces },
      create: parking,
    });
  }
  for (const camera of cameras) {
    // Seeded values only fill in a new camera; edits made in the database are kept.
    await prisma.camera.upsert({ where: { id: camera.id }, update: {}, create: camera });
  }
  console.log(JSON.stringify({ service: 'seed', event: 'complete', count: parkings.length, cameras: cameras.length }));
} finally {
  await prisma.$disconnect();
}
