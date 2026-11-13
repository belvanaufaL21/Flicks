export function getApplicationHealth() {
  return {
    status: 'ok',
    scope: 'application',
  } as const;
}
