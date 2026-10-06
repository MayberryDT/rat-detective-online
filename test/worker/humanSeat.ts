import { PROTOCOL_VERSION } from '../../src/shared/networkProtocol';
import type { GameRoom } from '../../src/worker/GameRoom';
import { readSocketMessage } from './socketMessages';

/** A room plays only while a human holds a seat. Joins one real human socket straight to the room stub
 * (no matchmaker) and resolves with the socket and the rat's ID once welcomed. The caller closes the socket. */
export async function seatHuman(stub: DurableObjectStub<GameRoom>, name = 'Seat Rat', query = ''): Promise<{ ws: WebSocket; id: string }> {
  const response = await stub.fetch(`http://localhost/ws${query}`, { headers: { Upgrade: 'websocket', Origin: 'http://localhost' } });
  const ws = response.webSocket;
  if (!ws) throw new Error(`Seat refused: ${response.status}`);
  ws.accept();
  const id = await new Promise<string>((resolve, reject) => {
    ws.addEventListener('message', event => {
      const message = readSocketMessage(ws, event.data);
      if (message?.type === 'welcome') resolve(message.id);
      if (message?.type === 'error') reject(new Error(message.message));
    });
    ws.send(JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name, appearance: { hatType: 'fedora', hatColor: 1, furColor: 2, coatColor: 3 } }));
  });
  return { ws, id };
}
