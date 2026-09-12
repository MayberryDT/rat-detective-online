import { sanitizeDiagnosticReport } from '../shared/diagnosticReport';
import { log } from './logging';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** A local page's existing gameplay socket is the sole diagnostic transport. */
export function allowsLocalDiagnostics(request: Request): boolean {
  const url = new URL(request.url);
  return LOCAL_HOSTS.has(url.hostname) && request.headers.get('origin') === url.origin;
}

export function logClientDiagnostics(report: Record<string, unknown>): void {
  const clean = sanitizeDiagnosticReport(report);
  if (!clean) return;
  const { details, ...summary } = clean;
  const { network, projectiles, netplay, remoteTiming, ...shots } = details as Record<string, unknown>;
  log('info', 'client diagnostics', { ...summary, network, netplay, remoteTiming, shots, projectiles });
}
