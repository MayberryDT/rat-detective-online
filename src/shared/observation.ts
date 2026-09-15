/** Observer access belongs to the authenticated, expiring hosted test Worker.
 * A URL flag alone never grants an invisible public player. */
export const MAX_OBSERVERS = 4;
export function observationRoom(room: string): boolean {
  return /^graybox-benchmark-ai-[a-z0-9-]{1,60}$/.test(room);
}
export function observationAllowed(url: URL, env: {CAPACITY_FIXTURE_ID?: string; CAPACITY_EXPIRES_AT?: string}, now = Date.now()): boolean {
  const expires = Number(env.CAPACITY_EXPIRES_AT);
  return !!env.CAPACITY_FIXTURE_ID && Number.isFinite(expires) && expires > now && observationRoom(url.searchParams.get('room') ?? '');
}
