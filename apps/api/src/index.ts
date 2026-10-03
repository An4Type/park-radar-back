import { createApp } from './app.js';
import { parkingRepository } from './repository.js';
import { log } from '../../../packages/shared/src/log.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
createApp(parkingRepository).listen(port, '0.0.0.0', () => log('api', 'listening', { port }));
