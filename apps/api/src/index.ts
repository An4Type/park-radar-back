import { createApp } from './app.js';
import { parkingRepository } from './repository.js';
import { log } from '../../../packages/shared/src/log.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
const zoneTtlSeconds = Number(process.env.ZONE_TTL_MINUTES ?? 30) * 60;
if (!Number.isFinite(zoneTtlSeconds) || zoneTtlSeconds <= 0) throw new Error('ZONE_TTL_MINUTES must be a positive number');
const zoneMergeMeters = Number(process.env.ZONE_MERGE_METERS ?? 6);
if (!Number.isFinite(zoneMergeMeters) || zoneMergeMeters < 0) throw new Error('ZONE_MERGE_METERS must be a non-negative number');
createApp(parkingRepository, { ingestToken: process.env.INGEST_TOKEN || undefined, zoneTtlSeconds, zoneMergeMeters }).listen(port, '0.0.0.0', () => log('api', 'listening', { port }));
