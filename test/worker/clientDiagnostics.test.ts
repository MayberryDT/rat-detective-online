import { describe, it, expect, vi } from 'vitest';
import { allowsLocalDiagnostics, logClientDiagnostics } from '../../src/worker/clientDiagnostics';
import { parseClientMessage } from '../../src/shared/messageValidation';
import { MAX_MESSAGE_BYTES } from '../../src/shared/networkProtocol';

describe('local diagnostic websocket collection', () => {
  it('accepts numeric summaries and removes arbitrary text before logging', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const message = parseClientMessage(JSON.stringify({ type: 'diagnostics', report: {
      longestFrameMs: 1200, secret: 'do not log', details: { shotsSent: 7, network: { sendFailures: 0, secret: 'private' } },
    } }));
    expect(message?.type).toBe('diagnostics');
    if (message?.type !== 'diagnostics') throw new Error('invalid report');
    logClientDiagnostics(message.report);
    const output = JSON.stringify(spy.mock.calls);
    expect(output).toContain('1200'); expect(output).toContain('shotsSent');
    expect(output).not.toContain('do not log'); expect(output).not.toContain('private');
    spy.mockRestore();
  });
  it('only opts in local same-origin browser sockets', () => {
    expect(allowsLocalDiagnostics(new Request('http://127.0.0.1:5173/ws', { headers: { origin: 'http://127.0.0.1:5173' } }))).toBe(true);
    expect(allowsLocalDiagnostics(new Request('https://game.example/ws', { headers: { origin: 'https://game.example' } }))).toBe(false);
    expect(allowsLocalDiagnostics(new Request('http://localhost/ws', { headers: { origin: 'https://other.example' } }))).toBe(false);
    expect(allowsLocalDiagnostics(new Request('http://localhost/ws'))).toBe(false);
  });
  it('keeps existing message limits and rejects malformed reports', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'diagnostics', report: [] }))).toBe(null);
    expect(parseClientMessage(JSON.stringify({ type: 'diagnostics', report: { junk: 'x'.repeat(MAX_MESSAGE_BYTES) } }))).toBe(null);
  });
});
