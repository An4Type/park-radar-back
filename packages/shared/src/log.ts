export function log(service: string, event: string, fields: Record<string, unknown> = {}): void {
  const payload = { timestamp: new Date().toISOString(), service, event, ...fields };
  const line = JSON.stringify(payload);
  if (event.endsWith('_error') || event.endsWith('_failed')) console.error(line);
  else console.log(line);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
