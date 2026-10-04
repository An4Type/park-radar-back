# Park Radar backend MVP

PostgreSQL/PostGIS stores parking state. An Express API reads that state for mobile map clients. One camera worker container per camera (`apps/camera-worker`) captures a public camera, counts cars in hand-marked parking areas with a vision model and logs the result. The camera workers do not write to the database yet.

## Requirements and quick start

- Docker with Compose
- Free host port 3000

```bash
cp .env.example .env   # then set OPENAI_API_KEY in .env
docker compose up --build
```

The API waits for a healthy database, applies the checked-in migration, and seeds five mock Kraków parking lots, the live AGH one and about 40 mock street parkings around Kraków (`packages/database/prisma/mock-parkings.ts`) before listening. Camera workers start with the stack. Only the API port is exposed. Startup may take longer the first time because the worker image includes Chromium.
The PostGIS image runs as `linux/amd64`, so Docker Desktop may emulate it on Apple Silicon.

```bash
curl http://localhost:3000/health
curl 'http://localhost:3000/api/parking?minLon=19.8&minLat=49.95&maxLon=20.1&maxLat=50.15'
curl http://localhost:3000/api/parking/00000000-0000-4000-8000-000000000001
# user-reported zone: level is none | few | many
curl -X POST -H 'Content-Type: application/json' -d '{"latitude":50.0639,"longitude":19.9241,"level":"few"}' http://localhost:3000/api/zones
curl 'http://localhost:3000/api/zones?minLon=19.8&minLat=49.95&maxLon=20.1&maxLat=50.15'
```

The first response should report `{"status":"ok","database":"connected"}`. The BBOX response contains `{ "parking": [...] }`; each item has `isPaid`, `type` (`OUTDOOR`, `COVERED` or `UNDERGROUND`) and a capacity and a free count for each of three separate pools of spaces: `regularSpaces` / `freeRegularSpaces`, `disabledSpaces` / `freeDisabledSpaces` and `evChargerSpaces` / `freeEvChargerSpaces`. A capacity of 0 means the parking has none of that kind, so a free count of 0 with a capacity above 0 means full. Busy counts stay internal. Repeat it after several seconds to see occupancy change.

Camera-counted parking (`/api/parking`) and user-reported zones (`/api/zones`) are separate. Parking has exact free/busy numbers and is never changed by user input. A camera tells the pools apart through the `kind` of each parking area (`regular` by default, `disabled` or `ev`); it reports one count per kind, and a pool with no marked area keeps its last known count. A zone has only coordinates and a rough `level` (`NONE`, `FEW`, `MANY`); it expires after the optional `lifespan` sent with the report (minutes, up to 1440) or, when omitted, after `ZONE_TTL_MINUTES` (default 30), and then stops being listed. A report within `ZONE_MERGE_METERS` (default 6) of an active zone updates that zone's level and restarts its lifespan instead of creating a new one (`200` instead of `201`; the zone keeps its original position). Seeded mock zones (`mock-zones.ts`) have `expiresAt: null` and never expire; a nearby report changes their level but keeps them permanent.

## Project layout

| Path | Responsibility |
| --- | --- |
| `apps/api` | Express routes, validation, DTOs, PostGIS BBOX query |
| `apps/camera-worker` | Standalone JavaScript worker: capture, parking areas, vision-model count, logs per camera (camera definition loaded from the database by `CAMERA_ID`; frames are discarded after analysis, only the logs remain) |
| `apps/worker` (not started by Compose) | Lease coordination, monitoring loop, Playwright capture, mock recognition |
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
docker compose logs -f camera-krakow-agh-stream1
docker compose stop camera-krakow-agh-stream1
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

## Cloudflare Tunnel deployment (current)

The production setup is this Compose stack exposed through a Cloudflare Tunnel; nothing else is public.

1. In the Cloudflare dashboard (Zero Trust → Networks → Tunnels) create a tunnel and copy its token into `TUNNEL_TOKEN` in `.env`.
2. Add a public hostname for the tunnel pointing at `http://api:3000`.
3. Start or update the stack:

```bash
docker compose --profile tunnel up -d --build
```

To ship a change, rebuild the affected service, for example `docker compose up -d --build api`. The API applies pending migrations on startup. Pushing to GitHub does not deploy anything.

## Railway deployment (GitHub) — not in use

The section below is kept for reference; we no longer deploy this way.

Railway does not run this repository's Compose file as one application. Create three
services in one Railway project instead:

| Railway service | Source | Public network | Purpose |
| --- | --- | --- | --- |
| `postgis` | Railway **PostGIS** template | No | Persistent database and spatial extension |
| `api` | This GitHub repository | Yes | HTTP API and database migrations |
| `worker` | This GitHub repository | No | Background parking monitor |

Use the **PostGIS** template, not Railway's plain PostgreSQL template. The first
migration executes `CREATE EXTENSION postgis` and creates a `geometry` column, so a
plain PostgreSQL image will fail during migration. Attach the template's persistent
volume using its default configuration and enable backups for production.

### API service

1. Create an empty Railway project, add the PostGIS template, and name its service
   `postgis`.
2. Add a GitHub service named `api`, connected to the `main` branch. If this project
   is pushed as part of a larger repository, set **Root Directory** to
   `/park-radar-back`; otherwise leave it at `/`.
3. Railway detects the root `Dockerfile`. Do not set a custom build or start command:
   the image applies Prisma migrations, performs the idempotent seed, then starts the
   API.
4. In **Variables**, add the following values (the first value is a Railway reference,
   not a literal connection string):

   ```dotenv
   DATABASE_URL=${{postgis.DATABASE_URL}}
   SERVICE_ROLE=api
   NODE_ENV=production
   WORKER_MODE=mock
   RECOGNITION_PROVIDER=mock
   ```

5. In **Settings**, set the healthcheck path to `/health`, set restart policy to
   `ON_FAILURE`, and generate a public domain. Railway supplies `PORT`; the API binds
   to it automatically.

The Docker image intentionally performs migration and seed only for `SERVICE_ROLE=api`.
That makes a failed migration fail the API deployment instead of exposing an API with
an incompatible schema.

### Worker service

Create a second GitHub service named `worker`, connected to the same branch and root
directory. It uses the same Docker image but starts a different process:

```dotenv
DATABASE_URL=${{postgis.DATABASE_URL}}
SERVICE_ROLE=worker
NODE_ENV=production
WORKER_MODE=mock
RECOGNITION_PROVIDER=mock
MAX_PARKINGS_PER_WORKER=5
WORKER_LEASE_SECONDS=30
WORKER_HEARTBEAT_SECONDS=10
CAPTURE_INTERVAL_SECONDS=5
```

Do not generate a public domain or configure an HTTP healthcheck for `worker`; it is
not an HTTP service. Set its restart policy to `ALWAYS`. A single worker with
`MAX_PARKINGS_PER_WORKER=5` covers the five seeded lots. For more lots or redundancy,
add worker replicas and tune that limit; database leases prevent two workers from
updating the same parking record.

### GitHub autodeploy and verification

Enable autodeploy for `main` on both GitHub services. If the repository is an
organization/private repository, make sure the Railway GitHub App has access and at
least one Railway project member has contributor access. Every push then rebuilds the
same Dockerfile for both services.

After the first API deployment completes, verify its generated domain:

```bash
curl https://<api-domain>/health
curl 'https://<api-domain>/api/parking?minLon=19.8&minLat=49.95&maxLon=20.1&maxLat=50.15'
```

The health endpoint must return `{"status":"ok","database":"connected"}`. API
logs should show migration/seed completion; worker logs should show `parking_claimed`.
Keep credentials exclusively in Railway Variables—do not commit a production `.env`
file.
