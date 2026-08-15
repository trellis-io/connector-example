#!/usr/bin/env node
// The G-6 bidirectional gate.
//
// The published JSON Schema (docs/manifest-schema.json) is documentation; the
// pinned `kg connector validate` is the oracle. This runner proves they agree
// in BOTH directions and fails if they ever diverge:
//
//   VALID   connector/            -> ajv PASSES  and  kg validate PASSES
//                                    and kg dev-run PASSES on its declared requests
//   INVALID counter-examples/<r>/ -> ajv FAILS   and  kg validate FAILS
//                                    with exactly the KGCP-* code the case declares
//
// Divergence in either direction reds CI. Never relax an assertion here to get
// a green run: a disagreement means the schema is stale (or the counter-example
// is wrong), and that is precisely what this gate exists to surface.
//
//   node tools/check.mjs --kg ./kg

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";

const SCHEMA_PATH = "docs/manifest-schema.json";
const CONNECTOR_DIR = "connector";
const COUNTER_EXAMPLES_DIR = "counter-examples";
const MANIFEST_NAME = "kg-connector.json";
const TIER = "verified";

function parseArgs(argv) {
  const args = { kg: process.env.KG_BIN ?? "kg" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--kg") {
      args.kg = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

const { kg } = parseArgs(process.argv.slice(2));

/** Run a kg verb and return {exitCode, envelope}. A non-zero exit is expected input, not an error. */
function runKg(argv) {
  let stdout = "";
  let exitCode = 0;
  try {
    stdout = execFileSync(kg, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (error.status === undefined) throw error; // spawn failure: the binary is missing/unrunnable
    exitCode = error.status;
    stdout = error.stdout ?? "";
  }
  let envelope = null;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    // A malformed envelope is itself a failure; callers assert on it.
  }
  return { exitCode, envelope, stdout };
}

const failures = [];
const lines = [];

function record(ok, label, detail) {
  lines.push(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// Compile the published schema
// ---------------------------------------------------------------------------

const ajv = new Ajv2020({ allErrors: true, strict: true });
const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const validateManifest = ajv.compile(schema);

// ---------------------------------------------------------------------------
// Direction 1: the valid example must pass BOTH gates
// ---------------------------------------------------------------------------

console.log(`VALID examples (must pass ajv AND kg validate, and dev-run clean)`);

const validManifest = JSON.parse(readFileSync(join(CONNECTOR_DIR, MANIFEST_NAME), "utf8"));
const schemaOk = validateManifest(validManifest);
record(schemaOk, `${CONNECTOR_DIR}/ ajv`,
  schemaOk ? "" : ajv.errorsText(validateManifest.errors, { separator: "; " }));

const validateRun = runKg(["connector", "validate", CONNECTOR_DIR, "--tier", TIER, "--json"]);
const validateOk = validateRun.exitCode === 0 && validateRun.envelope?.ok === true;
record(validateOk, `${CONNECTOR_DIR}/ kg validate`,
  validateOk ? "" : `exit ${validateRun.exitCode} ${validateRun.envelope?.error?.code ?? validateRun.stdout.slice(0, 200)}`);

const devRun = runKg(["connector", "dev-run", CONNECTOR_DIR, "--tier", TIER, "--json"]);
const devRunOk = devRun.exitCode === 0 && devRun.envelope?.ok === true;
record(devRunOk, `${CONNECTOR_DIR}/ kg dev-run`,
  devRunOk ? "" : `exit ${devRun.exitCode} ${devRun.stdout.slice(0, 200)}`);

// Every declared request must actually bind a fixture and emit records. A
// fixture-less manifest is refused by the marketplace oracle gate
// (MKT-ORACLE-NO-BOUND-FIXTURES), so the reference connector proves the
// opposite here rather than discovering it at submission.
if (devRunOk) {
  const requests = devRun.envelope.result?.requests ?? [];
  record(requests.length > 0, `${CONNECTOR_DIR}/ declares at least one request`,
    `${requests.length}`);
  for (const request of requests) {
    const id = request.mappingId ?? "<unnamed>";
    // `fixtureError` is null exactly when a fixture bound by stem and parsed;
    // §4.4's unbound case reports here rather than failing the run, so an
    // unbound fixture would otherwise slip through as a silent exit 0.
    record(request.fixtureError === null, `${CONNECTOR_DIR}/ '${id}' binds a fixture`,
      request.fixtureError === null ? "" : `fixtureError=${JSON.stringify(request.fixtureError)}`);
    record(request.failure === null, `${CONNECTOR_DIR}/ '${id}' evaluates without refusal`,
      request.failure === null ? "" : `failure=${JSON.stringify(request.failure)}`);
    const count = Array.isArray(request.records) ? request.records.length : 0;
    record(count > 0, `${CONNECTOR_DIR}/ '${id}' emits records`, `${count} records`);
  }
}

// ---------------------------------------------------------------------------
// Direction 2: every counter-example must FAIL BOTH gates, with the exact code
// ---------------------------------------------------------------------------

console.log(`\nINVALID counter-examples (must fail ajv AND kg validate with the declared code)`);

const cases = readdirSync(COUNTER_EXAMPLES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

record(cases.length > 0, "counter-examples corpus is non-empty", `${cases.length} cases`);

const scratch = mkdtempSync(join(tmpdir(), "kg-counter-"));
try {
  for (const name of cases) {
    const caseDir = join(COUNTER_EXAMPLES_DIR, name);
    const expected = JSON.parse(readFileSync(join(caseDir, "expected.json"), "utf8"));
    const manifestText = readFileSync(join(caseDir, MANIFEST_NAME), "utf8");

    // (a) ajv must reject it.
    let parsed = null;
    let parseError = null;
    try {
      parsed = JSON.parse(manifestText);
    } catch (error) {
      parseError = error;
    }
    const ajvRejected = parseError !== null || !validateManifest(parsed);
    record(ajvRejected, `${name} ajv rejects`,
      ajvRejected ? "" : "schema ACCEPTED an invalid manifest — the schema is too permissive");

    // (b) kg validate must reject it with exactly the declared code. The case
    // supplies only a manifest; it is materialized over the real connector's
    // mappings/fixtures/docs so the ONLY difference from a valid package is
    // the rule under test.
    const packageDir = join(scratch, name);
    cpSync(CONNECTOR_DIR, packageDir, { recursive: true });
    writeFileSync(join(packageDir, MANIFEST_NAME), manifestText);

    const run = runKg(["connector", "validate", packageDir, "--tier", TIER, "--json"]);
    const kgRejected = run.exitCode !== 0 && run.envelope?.ok === false;
    record(kgRejected, `${name} kg validate rejects`,
      kgRejected ? "" : `exit ${run.exitCode} — kg ACCEPTED an invalid manifest`);

    if (kgRejected) {
      const actual = run.envelope.error?.code;
      record(actual === expected.code, `${name} code is ${expected.code}`,
        actual === expected.code ? "" : `got ${actual}`);
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------

console.log(`\n${lines.join("\n")}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:\n  - ${failures.join("\n  - ")}`);
  console.error("\nThe schema and the pinned validator disagree. Fix the schema or the");
  console.error("counter-example — do not weaken an assertion in this file.");
  process.exit(1);
}

console.log(`\nAll ${lines.length} checks passed. Schema and pinned validator agree in both directions.`);
