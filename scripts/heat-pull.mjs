#!/usr/bin/env node
// Pull the live heat map into the city planning map (output/city-map/city-map.html).
// Usage: node scripts/heat-pull.mjs [days=7] [base=https://ratdetective.online]
import { writeFileSync, mkdirSync } from 'node:fs';

const days = process.argv[2] ?? '7';
const base = process.argv[3] ?? 'https://ratdetective.online';
const response = await fetch(`${base}/api/heat/v1?days=${encodeURIComponent(days)}`, { headers: { 'cache-control': 'no-store' } });
if (!response.ok) throw new Error(`heat map request failed: ${response.status} ${await response.text()}`);
const heat = await response.json();
const seconds = layer => Object.values(heat.layers[layer]).reduce((sum, n) => sum + n, 0);
const minutes = layer => (seconds(layer) / 60).toFixed(1);
heat.note = `${heat.days.join(', ') || 'no days yet'}. Human time ${minutes('humans')} rat-min, bots ${minutes('bots')} rat-min, `
  + `${seconds('deaths')} deaths, ${seconds('kills')} kills. Pulled ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`;
const dir = new URL('../output/city-map/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('heat-data.js', dir), `window.HEAT=${JSON.stringify(heat)};\n`);
console.log(heat.note);
