const parkingSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    address: { type: 'string' },
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    isPaid: { type: 'boolean' },
    type: { type: 'string', enum: ['OUTDOOR', 'COVERED', 'UNDERGROUND'], description: 'OUTDOOR = open-air, COVERED = under a roof' },
    regularSpaces: { type: 'integer', description: 'Regular spaces (capacity; disabled and EV charger spaces are not included)' },
    freeRegularSpaces: { type: 'integer', description: 'Free regular spaces' },
    disabledSpaces: { type: 'integer', description: 'Spaces reserved for disabled drivers (capacity; 0 = none)' },
    freeDisabledSpaces: { type: 'integer', description: 'Free spaces reserved for disabled drivers' },
    evChargerSpaces: { type: 'integer', description: 'Spaces with an electric-vehicle charger (capacity; 0 = none)' },
    freeEvChargerSpaces: { type: 'integer', description: 'Free spaces with an electric-vehicle charger' },
    status: { type: 'string', enum: ['ACTIVE', 'OFFLINE', 'STREAM_ERROR', 'RECOGNITION_ERROR', 'DISABLED'] },
    confidence: { type: 'number', nullable: true },
    lastUpdatedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};
const zoneSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    level: { type: 'string', enum: ['NONE', 'FEW', 'MANY'], description: 'Rough amount of free parking' },
    createdAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'null = never expires' },
  },
};
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '00000000-0000-4000-8000-000000000006' };
const error = { description: 'Error', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } } } } };
const bbox = (name: string, example: number) => ({ name, in: 'query', schema: { type: 'number' }, example });

export const openApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Park Radar API', version: '1.0.0' },
  tags: [
    { name: 'Clients', description: 'Public endpoints for the mobile app. No authentication.' },
    { name: 'Workers', description: 'Internal endpoints for camera workers. Require `Authorization: Bearer <INGEST_TOKEN>`.' },
    { name: 'System', description: 'Operational endpoints.' },
  ],
  paths: {
    '/health': { get: { tags: ['System'],
        summary: 'Health check', responses: { 200: { description: 'OK' } } } },
    '/api/parking': {
      get: {
        tags: ['Clients'],
        summary: 'List parking lots, optionally within a bounding box',
        description: 'Provide all four bbox parameters or none.',
        parameters: [bbox('minLon', 19.8), bbox('minLat', 49.95), bbox('maxLon', 20.1), bbox('maxLat', 50.15)],
        responses: { 200: { description: 'Parking lots', content: { 'application/json': { schema: { type: 'object', properties: { parking: { type: 'array', items: parkingSchema } } } } } }, 400: error },
      },
    },
    '/api/parking/{id}': {
      get: {
        tags: ['Clients'],
        summary: 'Get one parking lot, including the latest recognition data',
        parameters: [idParam],
        responses: { 200: { description: 'Parking lot' }, 400: error, 404: error },
      },
    },
    '/api/parking/{id}/occupancy': {
      post: {
        tags: ['Workers'],
        summary: 'Push a recognition result (used by camera workers)',
        description: 'Requires `Authorization: Bearer <INGEST_TOKEN>` — use the Authorize button. An ACTIVE report needs at least one of the three occupied counts; counts that are omitted keep their last known value.',
        security: [{ ingestToken: [] }],
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object',
            required: ['status'],
            properties: {
              status: { type: 'string', enum: ['ACTIVE', 'STREAM_ERROR', 'RECOGNITION_ERROR', 'OFFLINE'] },
              occupiedSpaces: { type: 'integer', minimum: 0, description: 'Cars in regular spaces' },
              occupiedDisabledSpaces: { type: 'integer', minimum: 0, description: 'Cars in disabled spaces' },
              occupiedEvChargerSpaces: { type: 'integer', minimum: 0, description: 'Cars in EV charger spaces' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              recognizedAt: { type: 'string', format: 'date-time' },
              data: { type: 'object' },
            },
            example: { status: 'ACTIVE', occupiedSpaces: 3, confidence: 0.8 },
          } } },
        },
        responses: { 200: { description: 'Updated parking lot' }, 400: error, 401: error, 404: error, 503: error },
      },
    },
    '/api/zones': {
      get: {
        tags: ['Clients'],
        summary: 'List active user-reported zones, optionally within a bounding box',
        description: 'Zones come from user reports, not cameras, and disappear when they expire. Provide all four bbox parameters or none.',
        parameters: [bbox('minLon', 19.8), bbox('minLat', 49.95), bbox('maxLon', 20.1), bbox('maxLat', 50.15)],
        responses: { 200: { description: 'Active zones', content: { 'application/json': { schema: { type: 'object', properties: { zones: { type: 'array', items: zoneSchema } } } } } }, 400: error },
      },
      post: {
        tags: ['Clients'],
        summary: 'Report free parking at a location',
        description: 'Public, no authentication. Creates a zone that expires after the configured lifespan (`ZONE_TTL_MINUTES`, default 30). If an active zone is within ZONE_MERGE_METERS (default 6) of the reported point, the level of that zone is updated and its lifespan restarted instead; its position does not change.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object',
            required: ['latitude', 'longitude', 'level'],
            properties: { latitude: { type: 'number' }, longitude: { type: 'number' }, level: { type: 'string', enum: ['none', 'few', 'many'] } },
            example: { latitude: 50.0639, longitude: 19.9241, level: 'few' },
          } } },
        },
        responses: { 200: { description: 'Existing nearby zone updated', content: { 'application/json': { schema: { type: 'object', properties: { zone: zoneSchema } } } } }, 201: { description: 'Zone created', content: { 'application/json': { schema: { type: 'object', properties: { zone: zoneSchema } } } } }, 400: error },
      },
    },
    '/api/cameras/{id}': {
      get: {
        tags: ['Workers'],
        summary: 'Get a camera configuration (used by camera workers)',
        description: 'Requires `Authorization: Bearer <INGEST_TOKEN>`.',
        security: [{ ingestToken: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'krakow-agh-stream1' }],
        responses: { 200: { description: 'Camera configuration' }, 400: error, 401: error, 404: error, 503: error },
      },
    },
  },
  components: { securitySchemes: { ingestToken: { type: 'http', scheme: 'bearer' } } },
};

export const docsHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>Park Radar API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/openapi.json', dom_id: '#ui' });</script></body></html>`;
