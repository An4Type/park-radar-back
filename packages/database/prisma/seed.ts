import 'dotenv/config';
import { prisma } from '../src/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { mockParkings } from './mock-parkings.js';
import { mockZones } from './mock-zones.js';

// Illustrative values: replace with surveyed data before relying on them.
const realParkings: Prisma.ParkingUncheckedCreateInput[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Galeria Krakowska', address: 'Pawia 5, Kraków', latitude: 50.0670, longitude: 19.9447, regularSpaces: 294, disabledSpaces: 16, evChargerSpaces: 10, isPaid: true, type: 'UNDERGROUND', occupiedSpaces: 170, occupiedDisabledSpaces: 4, occupiedEvChargerSpaces: 3 },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Bonarka City Center', address: 'Kamieńskiego 11, Kraków', latitude: 50.0166, longitude: 19.9513, regularSpaces: 456, disabledSpaces: 20, evChargerSpaces: 24, isPaid: false, type: 'COVERED', occupiedSpaces: 290, occupiedDisabledSpaces: 5, occupiedEvChargerSpaces: 8 },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Galeria Kazimierz', address: 'Podgórska 34, Kraków', latitude: 50.0494, longitude: 19.9518, regularSpaces: 214, disabledSpaces: 10, evChargerSpaces: 6, isPaid: true, type: 'UNDERGROUND', occupiedSpaces: 120, occupiedDisabledSpaces: 2, occupiedEvChargerSpaces: 2 },
  { id: '00000000-0000-4000-8000-000000000004', name: 'Plaza Kraków', address: 'Jana Pawła II 41e, Kraków', latitude: 50.0728, longitude: 19.9917, regularSpaces: 164, disabledSpaces: 8, evChargerSpaces: 8, isPaid: false, type: 'COVERED', occupiedSpaces: 65, occupiedDisabledSpaces: 2, occupiedEvChargerSpaces: 2 },
  { id: '00000000-0000-4000-8000-000000000005', name: 'Galeria Bronowice', address: 'Stawowa 61, Kraków', latitude: 50.0820, longitude: 19.8913, regularSpaces: 88, disabledSpaces: 5, evChargerSpaces: 2, isPaid: false, type: 'OUTDOOR', occupiedSpaces: 55, occupiedDisabledSpaces: 1, occupiedEvChargerSpaces: 0 },
  { id: '00000000-0000-4000-8000-000000000006', name: 'AGH street parking', address: 'Główna Aleja Kampusu AGH, al. Mickiewicza 30, Kraków', latitude: 50.0639, longitude: 19.9241, regularSpaces: 8, disabledSpaces: 0, evChargerSpaces: 0, isPaid: false, type: 'OUTDOOR', occupiedSpaces: 0, occupiedDisabledSpaces: 0, occupiedEvChargerSpaces: 0 },
];

const parkings = [...realParkings, ...mockParkings];

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
      update: { name: parking.name, address: parking.address, latitude: parking.latitude, longitude: parking.longitude, regularSpaces: parking.regularSpaces, disabledSpaces: parking.disabledSpaces, evChargerSpaces: parking.evChargerSpaces, isPaid: parking.isPaid, type: parking.type },
      create: parking,
    });
  }
  for (const zone of mockZones) {
    // Seeded zones only fill in a missing one; level changes from user reports are kept.
    await prisma.reportedZone.upsert({ where: { id: zone.id as string }, update: {}, create: zone });
  }
  for (const camera of cameras) {
    // Seeded values only fill in a new camera; edits made in the database are kept.
    await prisma.camera.upsert({ where: { id: camera.id }, update: {}, create: camera });
  }
  console.log(JSON.stringify({ service: 'seed', event: 'complete', count: parkings.length, cameras: cameras.length, zones: mockZones.length }));
} finally {
  await prisma.$disconnect();
}
