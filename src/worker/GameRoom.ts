import { DurableObject } from 'cloudflare:workers';

export class GameRoom extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    return new Response('GameRoom not implemented yet', { status: 501 });
  }
}
