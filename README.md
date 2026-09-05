# kg connector — reference connector & authoring manual

This repository is the front door for **authoring a kg connector**: a working
reference connector you can fork, the published [manifest JSON
Schema](docs/manifest-schema.json), and the CI gate that proves the schema and
the validator never drift apart.

A connector is **declarative data, not code**. You describe which origins it
may talk to, which credential slots it needs, which `GET` requests it may make,
and how each response becomes graph records. kg does the rest — and refuses
anything you did not declare.

| | |
|---|---|
| **Reference connector** | [`connector/`](connector/) — a complete, valid, `verified`-tier package |
| **Manifest schema** | [`docs/manifest-schema.json`](docs/manifest-schema.json) |
| **Deeper docs** | [`docs/authoring.md`](docs/authoring.md) — canonical JSON, the full rule list, error codes |

---

## Install kg

> **Private beta.** `kg` installs via **[trellisgraph.io](https://trellisgraph.io)** —
> [request access](https://trellisgraph.io). Public download is not yet
> available; the rest of this guide works exactly as written once you have the
> binary on your `PATH`.

Check your install:

```bash
kg connector validate --help
```

---

## The author journey

Four steps. The first three run entirely on your machine — no account, no
network, no corpus, no config.

### 1. `validate` — is my package legal?

```bash
kg connector validate connector/ --tier verified --json
```

This is **the oracle**. Every rule the marketplace enforces, it enforces here,
in the same vocabulary — so you never learn a rule for the first time at
submission. Failures carry a stable `KGCP-*` code and a JSON pointer:

```json
{"ok":false,"error":{"code":"KGCP-MANIFEST-CAPABILITY",
  "message":"package capability was refused"}}
```

Look the code up in [docs/authoring.md](docs/authoring.md#error-codes).

### 2. `dev-run` — what records do I actually produce?

```bash
kg connector dev-run connector/ --tier verified
```

`dev-run` compiles your mappings, renders each declared request's URL, and
evaluates that request's **fixture** through the real record layer. It is the
shortest path from a mapping you just edited to the records it produces:

```
request work-items: page 1 of a non-incremental render -> https://api.example.test/v1/work-items?project=PLATFORM&includeClosed=false&pageSize=50
request work-items: 5 records
  work-item#0 WorkItem id=PLATFORM-1041 {"assignee":"Test User","status":"in-progress", ...}
```

Each request binds the fixture whose **file stem matches the request id** —
`requests[].id = "work-items"` binds `fixtures/work-items.json`. Override
declared inputs with `--input name=value`.

> **Fixtures are not optional.** A manifest with no fixture bound to any
> declared request is refused by the marketplace's adversarial oracle
> (`MKT-ORACLE-NO-BOUND-FIXTURES`). Ship a fixture that exercises every record
> your mapping emits — the oracle mutates *your* fixture to attack *your*
> mapping, so a thin fixture is a weak proof.

### 3. `package` — build the archive

```bash
kg connector package connector/ --tier verified --out example-tracker.kgcp
```

Deterministic and canonical: the same source always produces the same bytes and
the same `archiveSha256`. You do not upload this file — the marketplace builds
it again from your reviewed commit — but building it locally proves it will.

### 4. `submit` — hand over a public repo and a tag

Submission is **a public GitHub repo URL plus a tag**. The pipeline resolves the
tag to a commit SHA and derives everything from it, including the signed
archive. You install the Trellis GitHub App on the repo; that installation *is*
the proof you control it.

**Where the package may live in your repository.** The pipeline locates the
package inside the fetched tree by one rule:

| Your repository | What is submitted |
|---|---|
| `kg-connector.json` at the repository root | the root is the package |
| exactly one `kg-connector.json` at the shallowest depth below the root (for example `connector/`) | that directory is the package — a depth-1 hit beats any deeper one, so `connector/` here wins over `counter-examples/*` |
| no `kg-connector.json` anywhere | refused, `MKT-PACKAGE-NOT-FOUND` |
| two or more at the same shallowest depth | refused, `MKT-PACKAGE-AMBIGUOUS` — ambiguity is never resolved by guessing |

So a repository shaped like every real repository — a root `README.md`,
`LICENSE`, `.github/`, and the package in a sub-directory — is submittable
**as-is**. That includes *this* repository: submit its URL and a tag, and
`connector/` is what gets validated, packaged and signed.

The package directory itself is still strict: inside it, only
`kg-connector.json`, `mappings/`, `fixtures/` and `docs/` are admitted (see
[docs/authoring.md §1](docs/authoring.md#1-the-package-vocabulary)). Keep your
repository files at the root and the package in its own directory, and both
rules are satisfied.

---

## Fork this connector

`connector/` is a complete, valid, `verified`-tier package for a fictional
work-tracking service at `api.example.test`. Everything in it is synthetic.

```
connector/
├── kg-connector.json          the manifest — identity, capability, inventories
├── mappings/work-items.json   response JSON -> :WorkItem records
├── fixtures/work-items.json   a recorded response, for dev-run and the oracle
└── docs/readme.md             human documentation
```

To make it yours, change `identity` (`registryId`, `family`, `systemKey`,
`version`), point `capability.publicOrigins` at your real API, and rewrite the
mapping's expressions to match your response shape. Then:

```bash
python3 tools/canonicalize.py connector/kg-connector.json connector/mappings/*.json
python3 tools/sync-manifest.py connector/
kg connector validate connector/ --tier verified --json
```

Two authoring rules bite early, so they have tools:

- **Package JSON must be byte-canonical** — sorted keys, no whitespace, one
  trailing newline. Edit readably, then run `tools/canonicalize.py`.
- **The manifest lists every file and every mapping's digest** — edit a mapping
  and the manifest is stale. `tools/sync-manifest.py` recomputes it.

Both are also CI checks (`--check`).

---

## The schema, and what proves it

[`docs/manifest-schema.json`](docs/manifest-schema.json) is a hand-authored JSON
Schema for the manifest. It is **documentation, not authority** —
`kg connector validate` is the only oracle.

So that the documentation cannot quietly rot, CI runs a **bidirectional gate**
against one pinned kg release:

- every **valid** example must pass **both** ajv-against-the-schema **and**
  `kg connector validate`;
- every **invalid** counter-example in [`counter-examples/`](counter-examples/)
  — one per schema rule — must fail **both**, with validate's exact `KGCP-*`
  code asserted.

Divergence in either direction reds CI. Drift against a newer kg release
surfaces deliberately at the pin-bump PR.

Run it yourself:

```bash
npm ci
node tools/check.mjs --kg /path/to/kg
```

---

## License

[MIT](LICENSE).
