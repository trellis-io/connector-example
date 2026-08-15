# Authoring a kg connector

Deeper reference behind the [README](../README.md)'s author journey. The
authority for every rule here is `kg connector validate` — this document
describes what it enforces and why.

---

## 1. The package vocabulary

A connector package source directory admits **exactly** these members, and
nothing else:

```
kg-connector.json      the manifest (required, exactly this name)
mappings/*.json        semantic authority — response JSON to records
fixtures/*.json        recorded responses for dev-run and the oracle
docs/*.md              human documentation
```

Each glob is exactly **two path segments** — nested subdirectories are not v1
vocabulary. Symlinks are refused. Any other root file, any other root
directory, any other extension is a whole-package refusal
(`KGCP-ARCHIVE-ENTRY`).

> **This bites at submission.** A repository with a root `README.md`,
> `LICENSE`, or `.github/` cannot be submitted as a package repo. See the
> README's [`git subtree`](../README.md#4-submit--hand-over-a-public-repo-and-a-tag)
> recipe for cutting a submittable mirror. This repository is laid out that way
> deliberately: the package lives in `connector/`, and the manual, schema and
> CI live at the root where humans expect them.

## 2. Canonical JSON

Every `.json` file in the package — manifest, mappings, and fixtures alike —
must already **be** its canonical encoding. kg re-encodes what it parses and
refuses any byte difference.

| Rule | Consequence |
|---|---|
| Object member names sorted by byte, ASCII only | `{"b":1,"a":2}` is refused |
| No insignificant whitespace | `{ "a": 1 }` is refused |
| Exactly one trailing newline (LF) | no newline, or two, is refused |
| Integers only | `1.0`, `1e3`, `NaN` are refused |
| No control characters inside strings | even escaped `\n` and `\t` are refused |
| Strings NFC-normalized | a decomposed `é` is refused |
| No duplicate member names | refused before deserialization |
| No UTF-8 BOM | refused |

Author readably, then run:

```bash
python3 tools/canonicalize.py connector/kg-connector.json connector/mappings/*.json
python3 tools/canonicalize.py --check connector/**/*.json   # CI mode
```

## 3. The manifest

Field-by-field shapes live in [`manifest-schema.json`](manifest-schema.json),
which is annotated with the kg source that owns each rule. The highlights:

**`identity`** — `registryId` is a canonical lowercase id (1–32 bytes, leading
lowercase letter, no doubled or trailing hyphen). `family` is one of `vcs`,
`work-trackers`, `docs`, `design`, `meetings`. `systemKey` is one or two dotted
segments of lowercase letters and digits — **no hyphens** — and its arity is
family-dependent: `docs.<leaf>` and `meetings.<leaf>` take two segments; `vcs`,
`work-trackers` and `design` take exactly one. `version` is exact
`major.minor.patch`.

> `sql` is a family in kg's wire vocabulary but **not** a legal manifest value:
> SQL connectors are outside the declarative REST/JSON v1 format and are
> refused outright.

**`capability`** — the whole security surface, declared up front:

- `publicOrigins` (non-empty): canonical `https://host:port` with an
  **explicit** port, no trailing slash, no userinfo, path, query or fragment.
- `credentials`: `bearer` and `basic` go in the authorization header with no
  `headerName`; `api-key` goes in a `named-header` and **must** carry one.
  `sendTo` names the origins a credential may reach — the blast radius of the
  secret, written down.
- `requests` (non-empty): `GET` only. `pathTemplate` is absolute, with no
  dot segments, backslash, query or fragment.
- `responseUrls`: `none` (and no origins) or `guarded-declared-origins` (and at
  least one). This governs URLs found *inside* a response body.
- `redirects`: `disabled` — the only v1 value.
- `ontology`: the labels you emit. Each must exist in kg's ontology, carry the
  role you declare, and be emittable at your tier. A `primary` declaration
  additionally requires a *stamped* label, and its record's key property must
  match that label's shipped key rule (`:WorkItem` keys on `id`).

**File inventories** — `semanticFiles`, `fixtureFiles` and `documentationFiles`
must each equal the real directory contents exactly, strictly sorted and
duplicate-free, and every `semanticFiles[].sha256` must be the lowercase
SHA-256 of that mapping's exact canonical bytes. Edit a mapping and the
manifest is stale:

```bash
python3 tools/sync-manifest.py connector/
```

## 4. Mappings

One mapping per request; `requestId` joins them. Expressions are a closed,
sandboxed **JMESPath subset** — bounded in source length, tokens, AST nodes and
depth, with a ten-name function set and no object literals.

Rules that catch authors out:

- `inputs` must be **strictly sorted by name**, and each name must be a
  canonical id (lowercase, hyphens — not `camelCase`).
- A **required input cannot have a default**.
- A record's `key.property` must match the label's shipped key rule, and must
  not also appear in `properties`.
- `incremental` is required but nullable — write `null`, do not omit it.
- An input's `default` is the schema's only optional field: omit it when
  absent, never write `null`.

## 5. Fixtures

A request binds the fixture whose **file stem equals the request id**:
`requests[].id = "work-items"` binds `fixtures/work-items.json`. There is no
path template — the binding is over the declared `fixtureFiles` list.

Fixtures are never runtime authority. They exist so `dev-run` can show you your
records, and so the marketplace's **adversarial oracle** has something to
attack: it mutates your fixture (nulls, missing keys, wrong types, oversize
values, unicode torture, structural damage) and checks the records your mapping
emits. A manifest with no bound fixture is refused outright
(`MKT-ORACLE-NO-BOUND-FIXTURES`), and a thin fixture is a weak proof. Cover
every record your mapping declares, including optional fields and absent ones.

## 6. Error codes

`validate` and `dev-run` emit stable machine identifiers — match on these, not
on message text.

| Code | Meaning |
|---|---|
| `KGCP-MANIFEST-SCHEMA` | unknown/missing/mistyped manifest field, or non-canonical JSON |
| `KGCP-MANIFEST-VERSION` | `manifestSchemaVersion` is not 1 |
| `KGCP-MANIFEST-IDENTITY` | `identity` refused — id, family, systemKey or version |
| `KGCP-MANIFEST-CAPABILITY` | capability refused — origins, credentials, requests, responseUrls |
| `KGCP-MANIFEST-SEMANTIC-FILE` | file inventories or a mapping digest are wrong |
| `KGCP-MANIFEST-SENSITIVE-FIELD` | a forbidden sensitive field appears in the package |
| `KGCP-ONTOLOGY-INVALID` | ontology declaration refused; per-declaration detail carries `KGCP-ONTOLOGY-UNKNOWN-LABEL`, `-MALFORMED-LABEL`, `-WRONG-ROLE`, `-NOT-EMITTABLE`, `-NOT-PRIMARY-ELIGIBLE`, `-NOT-A-MARKER`, `-DUPLICATE-DECLARATION`, `-CONTRADICTORY-DECLARATION`, `-EMPTY-DECLARATION` |
| `KGCP-MAPPING-SCHEMA` | mapping wire violation or cross-field rule |
| `KGCP-MAPPING-VERSION` | unsupported mapping kind or schema version |
| `KGCP-MAPPING-CAPABILITY` | mapping claims request/origin/credential/ontology authority the manifest does not grant |
| `KGCP-MAPPING-EXPRESSION` | expression syntax, forbidden form, or type refusal |
| `KGCP-MAPPING-LIMIT` | a static ceiling exceeded |
| `KGCP-ARCHIVE-ENTRY` / `-PATH` / `-FORMAT` / `-METADATA` / `-LIMIT` / `-NONCANONICAL` | package layout, path, or size refusals |

## 7. What the schema covers — and what it cannot

[`manifest-schema.json`](manifest-schema.json) is a **shape** gate. It encodes
every rule a JSON Schema can express, and the CI corpus in
[`../counter-examples/`](../counter-examples/) carries one counter-example per
such rule, each asserting the exact `KGCP-*` code validate returns.

These rules are enforced **only** by kg, deliberately not duplicated in the
schema — a second implementation of them would be a second source of truth, and
the drift would be silent:

- cross-references (`sendTo`, `requests[].origin`, `requests[].credential`, and
  `responseUrls.origins` must name declared ids)
- family/`systemKey` arity agreement
- ontology label membership, role agreement, tier emittability, key rules
- file inventories equalling the real directory contents
- `semanticFiles[].sha256` equalling the real bytes
- canonical JSON encoding
- every mapping rule (expressions, sorting, cross-field joins)
- the reserved-header deny-list for `headerName`
- `u16` bounds on version segments

Because of this split, a counter-example must break a rule the schema encodes —
otherwise it could not fail *both* gates, which is what the CI check requires.

## 8. Known rough edge

The root-entry strictness in §1 means a real author's connector repository
cannot carry a root `README.md`, `LICENSE` or `.github/` — the files GitHub
itself pushes people to add. Today the workaround is the `git subtree` mirror.
This is a UX landmine worth a kg-side ruling before external authors arrive:
either `validate` tolerates a small set of benign root entries, or the
marketplace pipeline pre-filters them before validation. Raised from this
repository's build; tracked on the kg side.
