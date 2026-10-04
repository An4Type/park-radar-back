const parkingSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    address: { type: 'string' },
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    totalSpaces: { type: 'integer' },
    occupiedSpaces: { type: 'integer' },
    freeSpaces: { type: 'integer' },
    status: { type: 'string', enum: ['ACTIVE', 'OFFLINE', 'STREAM_ERROR', 'RECOGNITION_ERROR', 'DISABLED'] },
    confidence: { type: 'number', nullable: true },
    lastUpdatedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, example: '00000000-0000-4000-8000-000000000006' };
const error = { description: 'Error', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } } } } };
const bbox = (name: string, example: number) => ({ name, in: 'query', schema: { type: 'number' }, example });

export const openApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Park Radar API', version: '1.0.0' },
  paths: {
    '/health': { get: { summary: 'Health check', responses: { 200: { description: 'OK' } } } },
    '/api/parking': {
      get: {
        summary: 'List parking lots, optionally within a bounding box',
        description: 'Provide all four bbox parameters or none.',
        parameters: [bbox('minLon', 19.8), bbox('minLat', 49.95), bbox('maxLon', 20.1), bbox('maxLat', 50.15)],
        responses: { 200: { description: 'Parking lots', content: { 'application/json': { schema: { type: 'object', properties: { parking: { type: 'array', items: parkingSchema } } } } } }, 400: error },
      },
    },
    '/api/parking/{id}': {
      get: {
        summary: 'Get one parking lot, including the latest recognition data',
        parameters: [idParam],
        responses: { 200: { description: 'Parking lot' }, 400: error, 404: error },
      },
    },
    '/api/parking/{id}/occupancy': {
      post: {
        summary: 'Push a recognition result (used by camera workers)',
        description: 'Requires `Authorization: Bearer <INGEST_TOKEN>` — use the Authorize button.',
        security: [{ ingestToken: [] }],
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object',
            required: ['status'],
            properties: {
              status: { type: 'string', enum: ['ACTIVE', 'STREAM_ERROR', 'RECOGNITION_ERROR', 'OFFLINE'] },
              occupiedSpaces: { type: 'integer', minimum: 0, description: 'Required when status is ACTIVE' },
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
    '/api/cameras/{id}': {
      get: {
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
