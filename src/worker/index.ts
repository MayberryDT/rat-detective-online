export { GameRoom } from './GameRoom';

export default {
  async fetch(): Promise<Response> {
    return Response.json({ ok: true, service: 'rat-detective' });
  },
} satisfies ExportedHandler<Env>;
