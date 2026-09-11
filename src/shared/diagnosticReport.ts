/** Fixed numeric allowlist: diagnostic messages cannot put arbitrary text in logs. */
export function sanitizeDiagnosticReport(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const numbers = (value: unknown, keys: string[]): Record<string, number> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const object = value as Record<string, unknown>;
    return Object.fromEntries(keys.filter(key => typeof object[key] === 'number' &&
      Number.isFinite(object[key]) && Math.abs(object[key] as number) <= Number.MAX_SAFE_INTEGER)
      .map(key => [key, object[key] as number]));
  };
  const details = body.details && typeof body.details === 'object' ? body.details as Record<string, unknown> : {};
  return {
    ...numbers(body, ['at', 'samples', 'frameMedianMs', 'frameP95Ms', 'longestFrameMs', 'stallsOver100Ms', 'calls', 'triangles', 'geometries', 'textures']),
    world: numbers(body.world, ['seed', 'version']), hidden: body.hidden === true,
    input: numbers(body.input, ['lockLosses', 'escapeLosses', 'focusedLosses', 'windowBlurs', 'requestFailures', 'ignoredClicks', 'lastLossAt']),
    phaseMaxMs: numbers(body.phaseMaxMs, ['simulationMs', 'botsMs', 'presentationMs', 'renderMs']),
    details: {
      ...numbers(details, ['shotsAttempted', 'shotsSent', 'snapshotAgeMs']),
      network: numbers(details.network, ['receivedCount', 'receivedChars', 'parseMs', 'parseMaxMs', 'invalidCount', 'ignoredCount', 'lastReceivedAt', 'sentCount', 'sendFailures', 'oversizeCount', 'bufferedAmount','receivedBytes','applyMs','applyMaxMs','joinMs','reconnectCount','lastCloseCode']),
      projectiles: numbers(details.projectiles, ['receivedShots', 'renderedBalls', 'corpses', 'snapshotAgeMs']),
    },
  };
}
