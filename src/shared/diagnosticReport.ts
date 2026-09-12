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
  const netplay=details.netplay&&typeof details.netplay==='object'&&!Array.isArray(details.netplay)?details.netplay as Record<string,unknown>:{};
  const boundedCounts=(value:unknown):Record<string,number>=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return{};
    return Object.fromEntries(Object.entries(value as Record<string,unknown>).slice(0,64).filter(([key,count])=>
      /^[a-z-]{1,24}:[a-z-]{1,32}$/.test(key)&&typeof count==='number'&&Number.isSafeInteger(count)&&count>=0&&count<=1_000_000)) as Record<string,number>;
  };
  const latency:Record<string,Record<string,number>>={};
  if(netplay.latency&&typeof netplay.latency==='object'&&!Array.isArray(netplay.latency))for(const [key,value] of Object.entries(netplay.latency as Record<string,unknown>).slice(0,32)){
    if(/^[a-z-]{1,24}(?::[a-z-]{1,32})?$/.test(key))latency[key]=numbers(value,['samples','p50','p95','p99','max']);
  }
  return {
    ...numbers(body, ['at', 'samples', 'frameMedianMs', 'frameP95Ms', 'longestFrameMs', 'stallsOver100Ms', 'calls', 'triangles', 'geometries', 'textures']),
    world: numbers(body.world, ['seed', 'version']), hidden: body.hidden === true,
    input: numbers(body.input, ['lockLosses', 'escapeLosses', 'focusedLosses', 'windowBlurs', 'requestFailures', 'ignoredClicks', 'lastLossAt']),
    phaseMaxMs: numbers(body.phaseMaxMs, ['simulationMs', 'botsMs', 'presentationMs', 'renderMs']),
    details: {
      ...numbers(details, ['shotsAttempted', 'shotsSent', 'snapshotAgeMs']),
      network: numbers(details.network, ['receivedCount', 'receivedChars', 'parseMs', 'parseMaxMs', 'invalidCount', 'ignoredCount', 'lastReceivedAt', 'sentCount', 'sendFailures', 'bufferedAmount','receivedBytes','applyMs','applyMaxMs','joinMs','reconnectCount','lastCloseCode','rttMs','rttMinMs','rttMaxMs','rttJitterMs']),
      netplay:{counts:boundedCounts(netplay.counts),...numbers(netplay,['pending']),latency},
      remoteTiming:numbers(details.remoteTiming,['rats','minimumDelayMs','maximumDelayMs']),
      projectiles: numbers(details.projectiles, ['receivedShots', 'renderedBalls', 'corpses', 'snapshotAgeMs']),
    },
  };
}
