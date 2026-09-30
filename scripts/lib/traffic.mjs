// Who a rat is, for every script that reads the city mirror (docs/data-plan.md, "Who is playing").
// An agent's headless browser joins with `agent=1`; its rats and perf reports carry `agent: true` (and `human: false`
// on rats). Agents are neither humans nor bots: no human measure and no bot measure counts them. Facts recorded before
// the flag have no agents, so their `human: false` rats are bots.

/** `agent`, `human` or `bot` for a situation, a shot, a session or a perf report. */
export const ratClass = r => (r.agent ? 'agent' : r.human ? 'human' : 'bot');

/** Every (round, actor) in the mirror's `situations` to its class; a mirror from before the agent column has no agents. */
export function actorClasses(db) {
  const hasAgent = !!db.prepare("SELECT 1 FROM pragma_table_info('situations') WHERE name = 'agent'").get();
  const rows = db.prepare(`SELECT DISTINCT round, a, human, ${hasAgent ? 'agent' : '0 AS agent'} FROM situations`).all();
  const out = new Map();
  for (const r of rows) {
    const key = `${r.round}:${r.a}`, cls = ratClass(r);
    // An actor seen as an agent once is an agent (a reconnect cannot change it).
    if (out.get(key) !== 'agent') out.set(key, cls);
  }
  return out;
}

/** Old facts carry no build: they read as `unknown`, as the aggregates do. */
export const buildOf = f => f.build ?? 'unknown';
