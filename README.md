# Park Radar backend MVP

PostgreSQL/PostGIS stores parking state. Three identical worker containers claim parking records with database leases and update them. An Express API reads that state for mobile map clients. Mock mode runs without video streams or a recognition service.

## Requirements and quick start

- Docker with Compose
- Free host port 3000

```bash
cp .env.example .env
docker compose up --build
```

The API waits for a healthy database, applies the checked-in migration, and seeds five Poznań parking lots before listening. Workers start after the API health check. Only the API port is exposed. Startup may take longer the first time because the worker image includes Chromium.
The PostGIS image runs as `linux/amd64`, so Docker Desktop may emulate it on Apple Silicon.

```bash
curl http://localhost:3000/health
curl 'http://localhost:3000/api/parking?minLon=16&minLat=52&maxLon=18&maxLat=53'
curl http://localhost:3000/api/parking/00000000-0000-4000-8000-000000000001
```

The first response should report `{"status":"ok","database":"connected"}`. The BBOX response contains `{ "parking": [...] }`; each item includes `totalSpaces`, `occupiedSpaces`, and derived `freeSpaces`. Repeat it after several seconds to see occupancy change.

## Project layout

| Path | Responsibility |
| --- | --- |
| `apps/api` | Express routes, validation, DTOs, PostGIS BBOX query |
| `apps/worker` | Lease coordination, monitoring loop, Playwright capture, mock recognition |
| `packages/database` | Prisma schema, SQL migration, seed, database client |
| `packages/shared` | Shared parking types, BBOX validation, structured logs |
| `tests` | Unit, API, and optional live database tests |

The PostGIS migration adds a generated `geometry(Point, 4326)` location column and GiST index. Longitude and latitude remain normal Prisma fields. The BBOX query uses `ST_MakeEnvelope` and that index. The database also enforces valid coordinates and capacity bounds. Screenshots stay in memory and are never persisted.

## Configuration

Copy `.env.example` before starting Compose. Compose always supplies its API and worker containers an internal `DATABASE_URL` using the `postgres` service, so an old host-side `DATABASE_URL=...localhost...` in `.env` cannot break the stack. Use `localhost` in a separate URL only when running Node commands on the host against an exposed PostgreSQL port. Change the example database password for any environment beyond local development. `PORT` controls the API host port. `WORKER_MODE=mock` requires no stream. `WORKER_MODE=playwright` opens each parking's `streamUrl` and captures JPEGs through a long-lived Chromium process, but still feeds the screenshot to the mock provider until the real recognition adapter is connected. Seed data has no stream URLs, so Playwright mode requires adding real URLs first.

`MAX_PARKINGS_PER_WORKER` defaults to 3 in the example. With five seeded lots and three workers, spare capacity remains for lease failover. Set it to 1 to demonstrate strict one-parking workers; with that setting, a replacement worker needs a free slot or an additional worker container to reclaim a lost lot. The default lease is 30 seconds with a 10-second heartbeat, and capture runs every 5 seconds.

## Database operations

These commands run from the project root after Compose starts:

```bash
docker compose exec api npx prisma migrate deploy
docker compose exec api node dist/packages/database/prisma/seed.js
```

Seeding is idempotent and preserves the current occupancy and recognition fields of existing seeded records. To inspect workers or stop one:

```bash
docker compose logs -f worker-1 worker-2 worker-3
docker compose stop worker-1
```

Workers use a single SQL `UPDATE` with `FOR UPDATE SKIP LOCKED` to atomically claim one unleased, enabled parking record. Every monitor has its own loop; the worker renews all its leases periodically. Writes require a still-valid lease owned by that worker. If a worker stops without releasing a lease, another worker with capacity can claim it after expiry. A graceful stop releases leases immediately.

## Tests and build

```bash
npm ci
npm run generate
npm run typecheck
npm test
npm run build
npx prisma validate
docker compose config
```

The regular suite tests free spaces, DTOs, BBOX validation and API filtering, parking lookup, recognition validation, and mock changes. To run the live PostGIS/API integration test, first start and seed the stack, then run the test service:

```bash
docker compose --profile test run --rm test
```

Alternatively, run `RUN_DB_TESTS=1 npm test` on the host with `DATABASE_URL` set to a reachable, migrated and seeded PostGIS database.

## Connecting the real recognition implementation

The seam is `RecognitionProvider.analyze(image: Buffer)` in `apps/worker/src/recognition.ts`. Create an adapter for the existing recognition code, select it when constructing `ParkingMonitor`, and map its output to `{ occupiedSpaces, confidence?, metadata? }`. `validateRecognition` rejects negative or fractional counts, invalid confidence, and malformed metadata; counts above capacity are clamped and logged. Workers mark capture problems `STREAM_ERROR`, analysis problems `RECOGNITION_ERROR`, and successful results `ACTIVE`. They retry with bounded backoff. Neither the mobile app nor API communicates directly with workers.
