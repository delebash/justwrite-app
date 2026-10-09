// SPDX-License-Identifier: MIT
// `justwrite-server` — run the server standalone, and as the desktop app's server process
// (the port of justwrite_server/serve.py).
//
//   node scripts/node24.js server/src/serve.js serve [--host H] [--port P] [--data-dir D]
//
// The family entry shape: `serve` is the canonical form and the bare form works too.
// Defaults as Python's: host 127.0.0.1 (JUSTWRITE_HOST), port 17495 (JUSTWRITE_PORT), the data
// dir `--data-dir`, else JUSTWRITE_DATA_DIR, else the family ladder (`<repo>/data` in a
// checkout). The command line is read the way Python's argparse read it — the same help,
// the same errors, exit 2 on a bad one — then the kit's runServer runs the server (it posts
// `ready` to the desktop shell, stops on SIGINT/SIGTERM or the shell's `stop`). Unlike
// Python, a relative --data-dir is made absolute (the kit's rule: a child process with its
// own working directory would resolve it differently).
//
// Seeding stays HERE, not in createApp(), on purpose: the test suite's createApp(tmp) apps
// must start from an empty database (the family's named winner for the seeding call-site).

import path from "node:path";
import { pathToFileURL } from "node:url";
import { runServer } from "@delebash/llm-runner/platform";
import { pyInt } from "@delebash/llm-runner/platform/py";
import { createApp } from "./app.js";
import { networkHost } from "./sync.js";
import { seedWorkspace } from "./database/seed.js";
import { PRODUCT, VERSION } from "./version.js";

export const PROG = "justwrite-server";
const USAGE = `usage: ${PROG} [-h] [--host HOST] [--port PORT] [--data-dir DATA_DIR]
                        [{serve}]
`;
const HELP = `${USAGE}
JustWrite server

positional arguments:
  {serve}

options:
  -h, --help           show this help message and exit
  --host HOST
  --port PORT
  --data-dir DATA_DIR
`;

/** argparse's error: the usage, then `<prog>: error: <message>`, exit 2. */
export class UsageError extends Error {}

const LONG = ["--help", "--host", "--port", "--data-dir"];

/** argparse's long-option abbreviation: an exact name, else a unique prefix. */
function matchLong(name) {
  if (LONG.includes(name)) return name;
  const hits = LONG.filter((o) => o.startsWith(name));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw new UsageError(`ambiguous option: ${name} could match ${hits.join(", ")}`);
  return null;
}

/**
 * The command line as Python's argparse read it: `{help: true}`, or `{host, port, dataDir}`
 * with the env defaults filled in. Throws UsageError with argparse's words.
 */
export function parseCli(argv, env = process.env) {
  const out = {
    host: env.JUSTWRITE_HOST ?? "127.0.0.1",
    port: env.JUSTWRITE_PORT ?? "17495",
    dataDir: env.JUSTWRITE_DATA_DIR ?? null,
  };
  const positionals = [];
  const unrecognized = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") return { help: true };
    if (a.startsWith("--") && a !== "--") {
      const eq = a.indexOf("=");
      const name = matchLong(eq < 0 ? a : a.slice(0, eq));
      if (name === null) {
        unrecognized.push(a);
        continue;
      }
      if (name === "--help") return { help: true };
      let value;
      if (eq >= 0) value = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) value = argv[++i];
      else throw new UsageError(`argument ${name}: expected one argument`);
      if (name === "--host") out.host = value;
      else if (name === "--port") out.port = value;
      else out.dataDir = value;
    } else if (a.startsWith("-") && a !== "-") {
      unrecognized.push(a);
    } else {
      positionals.push(a);
    }
  }
  if (positionals.length && positionals[0] !== "serve") {
    throw new UsageError(`argument command: invalid choice: '${positionals[0]}' (choose from serve)`);
  }
  unrecognized.push(...positionals.slice(1));
  if (unrecognized.length) throw new UsageError(`unrecognized arguments: ${unrecognized.join(" ")}`);
  try {
    out.port = pyInt(out.port);
  } catch {
    throw new UsageError(`argument --port: invalid int value: '${out.port}'`);
  }
  return out;
}

/** The entry: read the command line, then run the server until it is stopped. */
export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseCli(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    process.stderr.write(`${USAGE}${PROG}: error: ${e.message}\n`);
    return process.exit(2);
  }
  if (args.help) {
    process.stdout.write(HELP);
    return process.exit(0);
  }
  // An explicit --host / JUSTWRITE_HOST always wins; otherwise sync's "let my other devices
  // connect" (with a pairing token) widens 127.0.0.1 to the network (server/src/sync.js).
  const hostGiven = argv.includes("--host") || process.env.JUSTWRITE_HOST != null;
  return runServer({
    argv: ["serve", "--host", args.host, "--port", String(args.port), ...(args.dataDir ? ["--data-dir", args.dataDir] : [])],
    envPrefix: "JUSTWRITE",
    build: async ({ dataDir, host, port }) => {
      process.stdout.write(`${PRODUCT} ${VERSION} — http://${host}:${port}/\n`);
      const app = await createApp(dataDir);
      // Seed the default LLM providers etc. now that the DB is up (createApp opened it).
      // Kept here — and in the workspace-reset handler — rather than in createApp(), so the
      // test suite's createApp(tmp) apps still start from an empty database.
      seedWorkspace();
      return { app, host: hostGiven ? host : (networkHost() ?? host), port };
    },
  });
}

// Run when started as a program: by the desktop shell (a utilityProcess has `parentPort`),
// or as `node …/serve.js` — not when a test imports it.
const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (process.parentPort || entry === import.meta.url) await main();
