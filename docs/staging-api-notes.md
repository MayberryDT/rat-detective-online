# Staging API notes


> **Historical record — September 5–6 staging upload workaround.** Classified on 2026-09-08. Statements below describe that pass, including its then-current code, deployment, authorization and test counts. They are not present-day instructions or a current feature inventory. Use [the current reference](live-service.md) before acting. Preserve the measurements; do not restore obsolete behavior from this report.

Preparation for a **separate** `rat-detective-staging` Worker. This is not a production
deploy. Live Worker `rat-detective-preview` and custom domain `rat-detective.animasai.co`
must stay untouched.

At the time of this historical session, Wrangler CLI was unauthenticated. Authenticated reads/writes go through
the installed Cloudflare API connector (`mcp__cloudflare_api__execute`) on account
`e0f9e82703380afb5e7022ade62b906c`. Local Node only handles hashing, JWT-authenticated
asset-bucket upload, and multipart packaging.

Local helper: [`scripts/staging-assets.mjs`](../scripts/staging-assets.mjs). Node builtins
only. JWT on stdin. Status output never prints tokens. Completion JWT may be written
mode `0600` to a temp file for immediate parent-tool handoff, then deleted.

## Historical preparation facts

Read-only connector checks on 2026-09-05, before staging creation (not current deployment status):

- Account workers.dev subdomain: `mayberrydt`
- Staging URL after enable: `https://rat-detective-staging.mayberrydt.workers.dev`
- `rat-detective-staging` did not yet exist (GET script returned error 10007)
- `rat-detective-preview` exists, `workers.dev` disabled, custom domain in use
- Preview bindings: `ASSETS` (`assets`), `GAME_ROOM` (`durable_object_namespace`, class `GameRoom`, namespace `70ceefe8318a4177ae08f5d0b6f3f00d`)
- Preview compatibility: `2026-07-08`, flag `nodejs_compat`

Do not reuse the live Durable Object namespace id. Staging is a new Worker, so the first
SQLite class migration creates a **new** `GameRoom` namespace.

## Hash algorithm

Authoritative public docs
([Direct upload](https://developers.cloudflare.com/workers/static-assets/direct-upload/)):

```js
crypto.createHash("sha256")
  .update(fileBytes.toString("base64") + extnameWithoutDot)
  .digest("hex")
  .slice(0, 32);
```

Manifest keys are POSIX paths starting with `/`, for example `/index.html`.
`size` is the raw byte length, not the base64 length.

Wrangler 4.129.0 locally hashes the same `base64 + extension` input with **blake3**
(`blake3Wasm.hash(...).toString("hex").slice(0, 32)`). This helper follows the published
API example and Node builtins (SHA-256). If `assets-upload-session` rejects hashes, that
divergence is the first thing to check. Do not add a blake3 dependency unless the session
call proves SHA-256 is rejected.

## Endpoints

All paths are relative to `https://api.cloudflare.com/client/v4`.

| Step | Method | Path | Auth |
|------|--------|------|------|
| Account subdomain | GET | `/accounts/{account_id}/workers/subdomain` | connector |
| Create empty Worker | POST | `/accounts/{account_id}/workers/workers` | connector |
| Asset session | POST | `/accounts/{account_id}/workers/scripts/rat-detective-staging/assets-upload-session` | connector |
| Upload buckets | POST | `/accounts/{account_id}/workers/assets/upload?base64=true` | ephemeral session JWT |
| Upload Worker | PUT | `/accounts/{account_id}/workers/scripts/rat-detective-staging` | connector |
| Enable workers.dev | POST | `/accounts/{account_id}/workers/scripts/rat-detective-staging/subdomain` | connector |
| Confirm workers.dev | GET | `/accounts/{account_id}/workers/scripts/rat-detective-staging/subdomain` | connector |

OpenAPI names: Create Assets Upload Session, Upload Assets, Upload Worker Module,
Post Worker subdomain, Create Worker.

Do **not** call route/custom-domain APIs. Do **not** PUT `rat-detective-preview`.

## Exact request bodies

### 0. Bootstrap Worker (required before session if 10007)

Docs create the Worker first via the beta/create API, then open the asset session.

```json
{
  "name": "rat-detective-staging",
  "subdomain": { "enabled": false, "previews_enabled": false },
  "observability": { "enabled": true }
}
```

`POST /accounts/{account_id}/workers/workers`. Required field is `name`. Keep
`subdomain.enabled` false until after the script PUT, then enable explicitly.

If create is rejected, a stub `PUT .../scripts/rat-detective-staging` with a tiny
module also registers the script name. Prefer Create Worker so the later PUT is an
update of staging only.

### 1. Asset session body

```json
{
  "manifest": {
    "/index.html": { "hash": "<32 hex chars>", "size": 15474 }
  }
}
```

Response `result`:

- `jwt` (sensitive, 1 hour): session upload token
- `buckets`: array of hash arrays. Empty means reuse session JWT as completion JWT.

Pass `result.jwt` to the local helper on stdin. Do not log it. Persist only
`result.buckets` (hashes) to a temp JSON file.

### 2. Bucket upload

`multipart/form-data`, query `base64=true` **required**. Each part:

- name = file hash
- filename = file hash
- Content-Type = serving type (`text/html; charset=utf-8`, `text/javascript; charset=utf-8`, `image/png`, `audio/mpeg`, or `application/null`)
- body = **base64** of the raw file bytes

`Authorization: Bearer <session jwt>` only. Connector account auth will not work here.

HTTP 202 = more buckets remain. HTTP 201 = `result.jwt` is the completion token
(valid 1 hour). Write that token mode `0600` and delete after the Worker PUT.

### 3. Worker PUT metadata

Multipart parts: `metadata` (`application/json`) plus the bundled module
(`application/javascript+module`). `main_module` must equal the module part filename
from `wrangler deploy --env staging --dry-run --outdir <dir>`.

```json
{
  "main_module": "index.js",
  "compatibility_date": "2026-07-08",
  "compatibility_flags": ["nodejs_compat"],
  "bindings": [
    { "type": "assets", "name": "ASSETS" },
    {
      "type": "durable_object_namespace",
      "name": "GAME_ROOM",
      "class_name": "GameRoom"
    }
  ],
  "migrations": {
    "new_tag": "v1",
    "new_sqlite_classes": ["GameRoom"]
  },
  "assets": {
    "jwt": "<completion jwt>",
    "config": {
      "not_found_handling": "single-page-application",
      "run_worker_first": ["/ws", "/health"]
    }
  },
  "observability": {
    "enabled": true,
    "logs": {
      "enabled": true,
      "invocation_logs": true,
      "head_sampling_rate": 1
    }
  }
}
```

First staging deploy has no previous migration tag: send `new_tag` and
`new_sqlite_classes`, omit `old_tag`. Later staging deploys must send `old_tag`
matching the live staging tag or the upload is rejected.

Do not include `routes`. Do not copy preview's `namespace_id`.

Connector PUT example (body assembled locally, then passed into execute):

```js
async () => {
  const body = /* multipart bytes from scripts/staging-assets.mjs worker-multipart */;
  const boundary = /* from helper headersOut */;
  return cloudflare.request({
    method: "PUT",
    path: `/accounts/${accountId}/workers/scripts/rat-detective-staging`,
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
    rawBody: true,
  });
}
```

Large files can flow from `functions.exec` output into the execute tool without
echoing bytes to the model.

### 4. Enable workers.dev

```json
{ "enabled": true, "previews_enabled": false }
```

`POST /accounts/{account_id}/workers/scripts/rat-detective-staging/subdomain`.

Wrangler defaults `workers_dev` to true only when the env has **no routes**. Staging
must set `"workers_dev": true` and `"routes": []` in config so a later `wrangler deploy
--env staging` cannot inherit `rat-detective.animasai.co`.

## Current wrangler.jsonc (owned by another agent)

Do not edit `wrangler.jsonc` from this helper. As of this prep, top-level `name` is
`rat-detective-local`, custom domain lives only under `env.production`, and
`env.staging.name` is already `rat-detective-staging` with `workers_dev: true`.

`routes` **are inherited from top-level**, not from sibling envs. Top-level currently
has no `routes`, so staging will not steal `rat-detective.animasai.co`. Still add
`"routes": []` and `"preview_urls": false` on `env.staging` before any deploy as
hardening: Wrangler warns that a future top-level custom domain would otherwise be
reassigned onto staging.

Durable Object bindings are **not** inherited; staging already restates `GAME_ROOM`.
`migrations` are inherited (`tag: v1`, `new_sqlite_classes: ["GameRoom"]`), which is
correct for a brand-new Worker.

Local bundle without upload:

```bash
npx wrangler deploy --env staging --dry-run --outdir /tmp/rat-detective-staging-bundle
```

That writes the Worker module used as `--script-file`. `--dry-run` without `--outdir`
only uses `.wrangler/tmp/bundle-*` middleware facades, not a deployable ESM file.

## Parent workflow (when authorized to deploy staging)

No deploy was performed by this prep.

1. Confirm `wrangler.jsonc` `env.staging.name` is `rat-detective-staging`. Prefer adding
   `"routes": []` and `"preview_urls": false` on staging before deploy; do not edit that
   file from this helper.
2. `npm run build` when runtime/client work is ready. Current `dist/` has 8 files /
   ~5.1 MiB and is enough to exercise hashing.
3. `npx wrangler deploy --env staging --dry-run --outdir /tmp/rat-detective-staging-bundle`
4. `node scripts/staging-assets.mjs session-body --out /tmp/rat-detective-staging-session.json`
5. Connector GET `.../scripts/rat-detective-staging`. On 10007, connector POST
   `/workers/workers` with the bootstrap body.
6. Connector POST session path with the session-body JSON. Save `result.buckets` to
   `/tmp/rat-detective-staging-buckets.json`. Keep `result.jwt` only in memory / stdin.
7. `node scripts/staging-assets.mjs upload --buckets-file /tmp/rat-detective-staging-buckets.json --completion-jwt-out /tmp/rat-detective-staging-completion.jwt`
   with the session JWT on stdin.
8. `node scripts/staging-assets.mjs worker-multipart --script-file /tmp/rat-detective-staging-bundle/<main> --jwt-file /tmp/rat-detective-staging-completion.jwt --out /tmp/rat-detective-staging-put.multipart`
9. Connector PUT the multipart file to `.../scripts/rat-detective-staging`.
10. Connector POST subdomain `{enabled: true, previews_enabled: false}`.
11. `rm -f` completion JWT, session JWT copies, and multipart body.
12. Verify GET subdomain and `https://rat-detective-staging.mayberrydt.workers.dev/health`.
    Do not hit the live custom domain.

## Connector snippets

Create Worker:

```js
async () => cloudflare.request({
  method: "POST",
  path: `/accounts/${accountId}/workers/workers`,
  body: {
    name: "rat-detective-staging",
    subdomain: { enabled: false, previews_enabled: false },
    observability: { enabled: true },
  },
})
```

Asset session (read session JSON from exec, do not print JWT):

```js
async () => cloudflare.request({
  method: "POST",
  path: `/accounts/${accountId}/workers/scripts/rat-detective-staging/assets-upload-session`,
  body: sessionBody,
})
```

Enable workers.dev:

```js
async () => cloudflare.request({
  method: "POST",
  path: `/accounts/${accountId}/workers/scripts/rat-detective-staging/subdomain`,
  body: { enabled: true, previews_enabled: false },
})
```

## Safety

- Script name regex: `^[a-z0-9_][a-z0-9-_]*$`. `rat-detective-staging` matches.
- Never create account API tokens or a broad API proxy.
- Never persist JWTs in the repo, docs, or world-readable files.
- Completion JWT file mode `0600`, delete after PUT.
- If a command would target `rat-detective-preview` or `rat-detective.animasai.co`, stop.
