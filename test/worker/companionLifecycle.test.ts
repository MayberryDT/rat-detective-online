import { env, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createAssignment } from '../../src/shared/assignments';
import {
  PROTOCOL_VERSION,
  DEFAULT_ROOM_NAME,
  type ServerMessage,
} from '../../src/shared/networkProtocol';
import { RECONNECT_GRACE_MS } from '../../src/shared/reconnect';
import { GameRoom } from '../../src/worker/GameRoom';
import { readSocketMessage } from './socketMessages';

async function until(check: () => boolean | Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('condition timed out');
}

describe('companion publication lifecycle', () => {
  async function connect(name: string, resumeToken?: string) {
    const suffix = resumeToken ? `?resume=1&preferred=${DEFAULT_ROOM_NAME}` : '';
    const response = await SELF.fetch(`https://rat-detective.test/ws${suffix}`, {
      headers: { Upgrade: 'websocket', Origin: 'https://rat-detective.test' },
    });
    expect(response.status).toBe(101);
    const socket = response.webSocket!;
    socket.accept();
    const messages: ServerMessage[] = [];
    socket.addEventListener('message', event => {
      const message = readSocketMessage(socket, event.data);
      if (message) messages.push(message);
    });
    socket.send(JSON.stringify({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      name,
      appearance: { hatType: 'fedora', hatColor: 1, furColor: 2, coatColor: 3 },
      ...(resumeToken ? { resumeToken } : {}),
    }));
    await until(() => messages.some(message => message.type === 'welcome'));
    const welcome = messages.find((message): message is Extract<ServerMessage, { type: 'welcome' }> =>
      message.type === 'welcome')!;
    return { socket, welcome };
  }

  async function close(socket: WebSocket): Promise<void> {
    await new Promise<void>(resolve => {
      socket.addEventListener('close', () => resolve(), { once: true });
      socket.close(1000, 'test complete');
    });
  }

  async function summary(): Promise<{ humans: number; players: number } | undefined> {
    const status = await (await SELF.fetch('https://rat-detective.test/api/companion/v1/status'))
      .json<{ rooms: Array<{ room: string; humans: number; players: number }> }>();
    return status.rooms.find(room => room.room === DEFAULT_ROOM_NAME);
  }

  it('tracks attached humans, reconnects, scoring publication, and final expiry', async () => {
    const first = await connect('Companion Rat');
    const second = await connect('Second Rat');
    await until(async () => {
      const room = await summary();
      return room?.humans === 2 && room.players === 8;
    });

    const room = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME);
    await runInDurableObject(room, (instance: GameRoom) => {
      const game = instance as unknown as {
        chaosTimer: ReturnType<typeof setInterval> | null;
        chaos: {
          setAssignment(state: ReturnType<typeof createAssignment>): void;
          assignmentState?: ReturnType<typeof createAssignment>;
        };
        clock: () => number;
        companionRevision: number;
        publishCompanion(force?: boolean): void;
      };
      if (game.chaosTimer) clearInterval(game.chaosTimer);
      game.chaosTimer = null;
      const started = Date.now();
      let now = started;
      const assignment = createAssignment('jurisdiction', started, 'companion-scoring', () => 0);
      assignment.phase = 'active';
      game.chaos.setAssignment(assignment);
      const live = game.chaos.assignmentState!;
      game.clock = () => now;
      game.publishCompanion(true);
      const revision = game.companionRevision;
      for (let i = 1; i <= 10; i++) {
        now = started + i * 250;
        live.jurisdiction!.heldMs[first.welcome.id] = i * 250;
        game.publishCompanion();
      }
      expect(game.companionRevision - revision).toBeGreaterThanOrEqual(2);
      expect(game.companionRevision - revision).toBeLessThanOrEqual(3);
      game.clock = () => Date.now();
    });

    await close(first.socket);
    await until(async () => (await summary())?.humans === 1);
    await close(second.socket);
    await until(async () => {
      const city = await summary();
      return city?.humans === 0 && city.players === 8;
    });

    const resumed = await connect('Companion Rat', first.welcome.resumeToken);
    expect(resumed.welcome.id).toBe(first.welcome.id);
    await until(async () => (await summary())?.humans === 1);
    await close(resumed.socket);
    await until(async () => (await summary())?.humans === 0);

    await runInDurableObject(room, async (instance: GameRoom) => {
      const game = instance as unknown as { clock: () => number; alarm(): Promise<void> };
      const now = Date.now();
      game.clock = () => now + RECONNECT_GRACE_MS + 1;
      await game.alarm();
    });
    await until(async () => {
      return await summary() === undefined;
    });
  });
});
