#!/usr/bin/env node
/**
 * Local helper for rat-detective-staging asset upload.
 *
 * Generates a Workers static-asset manifest, uploads session buckets with an
 * ephemeral JWT from stdin, and can write a 0600 completion JWT / multipart
 * Worker PUT body for an immediate parent-tool handoff.
 *
 * Never logs JWTs. Never writes credentials into the repo. Scope is the
 * rat-detective-staging Worker only.
 */

import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const ACCOUNT_ID = "e0f9e82703380afb5e7022ade62b906c";
const SCRIPT_NAME = "rat-detective-staging";
const LIVE_SCRIPT_NAME = "rat-detective-preview";
const ACCOUNT_SUBDOMAIN = "mayberrydt";
const API_ORIGIN = "https://api.cloudflare.com";

const DEFAULT_COMPATIBILITY_DATE = "2026-07-08";
const DEFAULT_COMPATIBILITY_FLAGS = ["nodejs_compat"];
const DEFAULT_ASSETS_DIR = "dist";

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".htm", "text/html; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".ttf", "font/ttf"],
  [".wasm", "application/wasm"],
  [".wav", "audio/wav"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function usage(exitCode = 0) {
  const text = `Usage: node scripts/staging-assets.mjs <command> [options]

Commands:
  constants                         Print account/script/API constants (no secrets)
  manifest                          Hash ./dist and print a safe manifest summary
  session-body                      Write {manifest} JSON for assets-upload-session
  upload                            Upload session buckets; JWT on stdin
  metadata                          Write Worker PUT metadata JSON (JWT from file)
  worker-multipart                  Write multipart body for PUT .../scripts/rat-detective-staging

Shared options:
  --assets-dir <dir>                Static assets directory (default: dist)
  --out <path>                      Output file

upload options:
  --buckets-file <path>             JSON array of hash buckets from the session
  --buckets-json <json>             Inline buckets JSON (avoid for large payloads)
  --account-id <id>                 Cloudflare account id
  --completion-jwt-out <path>       Write completion JWT mode 0600 (temp file)

metadata / worker-multipart options:
  --jwt-file <path>                 Completion JWT file (mode 0600 recommended)
  --main-module <name>              Bundled Worker filename (default: index.js)
  --script-file <path>              Bundled Worker module from wrangler --outdir
  --compatibility-date <date>       Default ${DEFAULT_COMPATIBILITY_DATE}

JWT handling:
  upload reads the session JWT from stdin and never prints it.
  Completion JWT may be written to a 0600 temp file for parent-tool handoff.
  Delete that file immediately after the Worker PUT.
`;
  process.stdout.write(text);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
        continue;
      }
      args[key] = next;
      i += 1;
      continue;
    }
    args._.push(token);
  }
  return args;
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function resolveFromRoot(maybePath) {
  if (!maybePath) return maybePath;
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(repoRoot(), maybePath);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES.get(ext) ?? "application/null";
}

/**
 * Documented Workers asset hash:
 * sha256(base64(fileBytes) + extensionWithoutDot).hex.slice(0, 32)
 * https://developers.cloudflare.com/workers/static-assets/direct-upload/
 */
function hashAsset(buffer, filePath) {
  const extension = path.extname(filePath).slice(1);
  return createHash("sha256")
    .update(buffer.toString("base64") + extension)
    .digest("hex")
    .slice(0, 32);
}

function manifestPathFor(relativePath) {
  return `/${relativePath.split(path.sep).join("/")}`;
}

async function walkFiles(directory) {
  const files = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".DS_Store" || entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  await visit(directory);
  files.sort();
  return files;
}

async function buildManifest(assetsDir) {
  const root = resolveFromRoot(assetsDir);
  const info = await stat(root);
  if (!info.isDirectory()) {
    throw new Error(`Assets directory is not a directory: ${root}`);
  }
  const files = await walkFiles(root);
  if (files.length === 0) {
    throw new Error(`No files found in assets directory: ${root}`);
  }
  const manifest = {};
  const listing = [];
  let totalBytes = 0;
  for (const filePath of files) {
    const buffer = await readFile(filePath);
    const relativePath = path.relative(root, filePath);
    const key = manifestPathFor(relativePath);
    const hash = hashAsset(buffer, filePath);
    manifest[key] = { hash, size: buffer.length };
    listing.push({
      path: key,
      hash,
      size: buffer.length,
      contentType: contentTypeFor(filePath),
    });
    totalBytes += buffer.length;
  }
  return { assetsDir: root, manifest, listing, fileCount: listing.length, totalBytes };
}

function printStatus(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function redactJwt(value) {
  if (!value) return { present: false, length: 0 };
  return { present: true, length: value.length };
}

async function readStdinToken() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const token = Buffer.concat(chunks).toString("utf8").trim();
  if (!token) {
    throw new Error("Expected a JWT on stdin");
  }
  if (token.split(".").length !== 3) {
    throw new Error("stdin did not look like a JWT");
  }
  return token;
}

async function writePrivateFile(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, { encoding: "utf8", mode: 0o600 });
  await chmod(filePath, 0o600);
  return filePath;
}

function encodeMultipart(parts) {
  const boundary = `----ratdetective${randomBytes(12).toString("hex")}`;
  const chunks = [];
  for (const part of parts) {
    const disposition = part.filename
      ? `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"`
      : `Content-Disposition: form-data; name="${part.name}"`;
    chunks.push(`--${boundary}\r\n`);
    chunks.push(`${disposition}\r\n`);
    if (part.contentType) {
      chunks.push(`Content-Type: ${part.contentType}\r\n`);
    }
    chunks.push("\r\n");
    chunks.push(part.body);
    chunks.push("\r\n");
  }
  chunks.push(`--${boundary}--\r\n`);
  const buffers = chunks.map((chunk) =>
    Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"),
  );
  return {
    boundary,
    body: Buffer.concat(buffers),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function workerMetadata({
  mainModule,
  completionJwt,
  compatibilityDate,
  compatibilityFlags,
}) {
  return {
    main_module: mainModule,
    compatibility_date: compatibilityDate,
    compatibility_flags: compatibilityFlags,
    bindings: [
      { type: "assets", name: "ASSETS" },
      {
        type: "durable_object_namespace",
        name: "GAME_ROOM",
        class_name: "GameRoom",
      },
    ],
    migrations: {
      new_tag: "v1",
      new_sqlite_classes: ["GameRoom"],
    },
    assets: {
      jwt: completionJwt,
      config: {
        not_found_handling: "single-page-application",
        run_worker_first: ["/ws", "/health", "/status"],
      },
    },
    observability: {
      enabled: true,
      logs: {
        enabled: true,
        invocation_logs: true,
        head_sampling_rate: 1,
      },
    },
  };
}

async function commandConstants() {
  printStatus({
    accountId: ACCOUNT_ID,
    scriptName: SCRIPT_NAME,
    liveScriptName: LIVE_SCRIPT_NAME,
    accountSubdomain: ACCOUNT_SUBDOMAIN,
    workersDevUrl: `https://${SCRIPT_NAME}.${ACCOUNT_SUBDOMAIN}.workers.dev`,
    endpoints: {
      createWorker: `POST /accounts/${ACCOUNT_ID}/workers/workers`,
      assetsUploadSession: `POST /accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/assets-upload-session`,
      assetsUpload: `POST /accounts/${ACCOUNT_ID}/workers/assets/upload?base64=true`,
      uploadWorker: `PUT /accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}`,
      enableWorkersDev: `POST /accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/subdomain`,
      getAccountSubdomain: `GET /accounts/${ACCOUNT_ID}/workers/subdomain`,
    },
    hashAlgorithm:
      "sha256(base64(fileBytes) + extnameWithoutDot).digest(hex).slice(0, 32)",
  });
}

async function commandManifest(args) {
  const built = await buildManifest(args["assets-dir"] || DEFAULT_ASSETS_DIR);
  if (args.out) {
    const outPath = resolveFromRoot(args.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(built.manifest, null, 2)}\n`);
  }
  printStatus({
    ok: true,
    assetsDir: built.assetsDir,
    fileCount: built.fileCount,
    totalBytes: built.totalBytes,
    files: built.listing,
    out: args.out ? resolveFromRoot(args.out) : null,
  });
}

async function commandSessionBody(args) {
  const built = await buildManifest(args["assets-dir"] || DEFAULT_ASSETS_DIR);
  const body = { manifest: built.manifest };
  const outPath = resolveFromRoot(
    args.out || path.join(tmpdir(), `rat-detective-staging-session-${Date.now()}.json`),
  );
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(body)}\n`);
  printStatus({
    ok: true,
    out: outPath,
    scriptName: SCRIPT_NAME,
    path: `/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/assets-upload-session`,
    method: "POST",
    fileCount: built.fileCount,
    totalBytes: built.totalBytes,
  });
}

function parseBuckets(raw) {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(value)) {
    throw new Error("buckets must be an array of hash arrays");
  }
  return value.map((bucket, index) => {
    if (!Array.isArray(bucket)) {
      throw new Error(`buckets[${index}] is not an array`);
    }
    return bucket.map(String);
  });
}

async function commandUpload(args) {
  const assetsDir = resolveFromRoot(args["assets-dir"] || DEFAULT_ASSETS_DIR);
  const accountId = args["account-id"] || ACCOUNT_ID;
  const built = await buildManifest(assetsDir);
  const hashToFile = new Map(built.listing.map((entry) => [entry.hash, entry]));

  let buckets;
  if (args["buckets-file"]) {
    buckets = parseBuckets(await readFile(resolveFromRoot(args["buckets-file"]), "utf8"));
  } else if (args["buckets-json"]) {
    buckets = parseBuckets(args["buckets-json"]);
  } else {
    throw new Error("upload requires --buckets-file or --buckets-json");
  }

  const sessionJwt = await readStdinToken();
  const uploadUrl = `${API_ORIGIN}/client/v4/accounts/${accountId}/workers/assets/upload?base64=true`;

  if (buckets.length === 0 || buckets.every((bucket) => bucket.length === 0)) {
    let completionOut = null;
    if (args["completion-jwt-out"]) {
      completionOut = await writePrivateFile(
        resolveFromRoot(args["completion-jwt-out"]),
        sessionJwt,
      );
    }
    printStatus({
      ok: true,
      skippedUpload: true,
      reason: "session returned no buckets; using session JWT as completion JWT",
      bucketCount: 0,
      uploadedFiles: 0,
      completionJwt: redactJwt(sessionJwt),
      completionJwtOut: completionOut,
    });
    return;
  }

  let completionJwt = "";
  const bucketStatuses = [];
  let uploadedFiles = 0;

  for (let i = 0; i < buckets.length; i += 1) {
    const bucket = buckets[i];
    const parts = [];
    for (const hash of bucket) {
      const entry = hashToFile.get(hash);
      if (!entry) {
        throw new Error(`Session requested unknown hash ${hash}`);
      }
      const absPath = path.join(assetsDir, entry.path.replace(/^\//, ""));
      const buffer = await readFile(absPath);
      parts.push({
        name: hash,
        filename: hash,
        contentType: entry.contentType,
        body: buffer.toString("base64"),
      });
    }
    const encoded = encodeMultipart(parts);
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionJwt}`,
        "Content-Type": encoded.contentType,
      },
      body: encoded.body,
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const jwt = parsed?.result?.jwt || parsed?.jwt || "";
    if (jwt) completionJwt = jwt;
    uploadedFiles += bucket.length;
    bucketStatuses.push({
      index: i,
      httpStatus: response.status,
      success: Boolean(parsed?.success ?? response.ok),
      fileCount: bucket.length,
      hashes: bucket,
      completionJwt: redactJwt(jwt),
      errors: parsed?.errors ?? (response.ok ? [] : [{ message: "non-JSON or failed upload" }]),
    });
    if (!response.ok) {
      throw new Error(`Asset bucket ${i} upload failed with HTTP ${response.status}`);
    }
  }

  if (!completionJwt) {
    throw new Error("Upload finished without a completion JWT (expected HTTP 201 on the last bucket)");
  }

  let completionOut = null;
  if (args["completion-jwt-out"]) {
    completionOut = await writePrivateFile(
      resolveFromRoot(args["completion-jwt-out"]),
      completionJwt,
    );
  }

  printStatus({
    ok: true,
    skippedUpload: false,
    bucketCount: buckets.length,
    uploadedFiles,
    buckets: bucketStatuses,
    completionJwt: redactJwt(completionJwt),
    completionJwtOut: completionOut,
  });
}

async function readJwtFile(filePath) {
  const token = (await readFile(resolveFromRoot(filePath), "utf8")).trim();
  if (!token || token.split(".").length !== 3) {
    throw new Error("jwt file did not contain a JWT");
  }
  return token;
}

async function commandMetadata(args) {
  const jwt = args["jwt-file"] ? await readJwtFile(args["jwt-file"]) : "";
  const metadata = workerMetadata({
    mainModule: args["main-module"] || "index.js",
    completionJwt: jwt || "<completion-jwt>",
    compatibilityDate: args["compatibility-date"] || DEFAULT_COMPATIBILITY_DATE,
    compatibilityFlags: DEFAULT_COMPATIBILITY_FLAGS,
  });
  const outPath = resolveFromRoot(
    args.out || path.join(tmpdir(), `rat-detective-staging-metadata-${Date.now()}.json`),
  );
  if (jwt) {
    await writePrivateFile(outPath, `${JSON.stringify(metadata)}\n`);
  } else {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(metadata, null, 2)}\n`);
  }
  const publicMetadata = structuredClone(metadata);
  publicMetadata.assets.jwt = redactJwt(jwt || null);
  printStatus({
    ok: true,
    out: outPath,
    jwtIncluded: Boolean(jwt),
    metadata: publicMetadata,
  });
}

async function commandWorkerMultipart(args) {
  if (!args["script-file"]) {
    throw new Error("worker-multipart requires --script-file from wrangler --outdir");
  }
  if (!args["jwt-file"]) {
    throw new Error("worker-multipart requires --jwt-file with the completion JWT");
  }
  const scriptPath = resolveFromRoot(args["script-file"]);
  const mainModule = args["main-module"] || path.basename(scriptPath);
  const jwt = await readJwtFile(args["jwt-file"]);
  const metadata = workerMetadata({
    mainModule,
    completionJwt: jwt,
    compatibilityDate: args["compatibility-date"] || DEFAULT_COMPATIBILITY_DATE,
    compatibilityFlags: DEFAULT_COMPATIBILITY_FLAGS,
  });
  const scriptSource = await readFile(scriptPath);
  const encoded = encodeMultipart([
    {
      name: "metadata",
      contentType: "application/json",
      body: JSON.stringify(metadata),
    },
    {
      name: mainModule,
      filename: mainModule,
      contentType: "application/javascript+module",
      body: scriptSource,
    },
  ]);
  const outPath = resolveFromRoot(
    args.out || path.join(tmpdir(), `rat-detective-staging-put-${Date.now()}.multipart`),
  );
  await mkdir(path.dirname(outPath), { recursive: true });
  await pipeline(Readable.from(encoded.body), createWriteStream(outPath, { mode: 0o600 }));
  await chmod(outPath, 0o600);
  const headerPath = `${outPath}.headers.json`;
  await writeFile(
    headerPath,
    `${JSON.stringify(
      {
        method: "PUT",
        path: `/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}`,
        contentType: encoded.contentType,
        bodyPath: outPath,
        bodyBytes: encoded.body.length,
      },
      null,
      2,
    )}\n`,
  );
  printStatus({
    ok: true,
    out: outPath,
    headersOut: headerPath,
    contentType: encoded.contentType,
    bodyBytes: encoded.body.length,
    mainModule,
    scriptFile: scriptPath,
    jwt: redactJwt(jwt),
    putPath: `/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}`,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (args.help || !command) {
    usage(command ? 0 : 1);
  }
  switch (command) {
    case "constants":
      await commandConstants();
      break;
    case "manifest":
      await commandManifest(args);
      break;
    case "session-body":
      await commandSessionBody(args);
      break;
    case "upload":
      await commandUpload(args);
      break;
    case "metadata":
      await commandMetadata(args);
      break;
    case "worker-multipart":
      await commandWorkerMultipart(args);
      break;
    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      usage(1);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
