# Counter-example corpus

One invalid manifest per rule that [`docs/manifest-schema.json`](../docs/manifest-schema.json)
encodes. Each case must fail **both** gates — ajv-against-the-schema **and**
`kg connector validate` — and validate's exact `KGCP-*` code is asserted.

That double requirement is what makes the corpus load-bearing. If the schema
drifts permissive, the `ajv rejects` half fails. If kg's rules move, the code
assertion fails. Either way [`../tools/check.mjs`](../tools/check.mjs) reds CI.

Each case directory holds:

- `kg-connector.json` — a complete manifest, canonical JSON, differing from
  [`../connector/kg-connector.json`](../connector/kg-connector.json) in exactly
  the one rule under test;
- `expected.json` — the rule in prose and the `KGCP-*` code validate must return.

The runner materializes each manifest over the real connector's `mappings/`,
`fixtures/` and `docs/`, so the only variable is the manifest itself.

> Rules kg enforces but a JSON Schema cannot express (cross-references,
> ontology membership, digest equality, canonical encoding) have **no**
> counter-example here — they could not fail the ajv half. They are listed in
> [`../docs/authoring.md`](../docs/authoring.md#7-what-the-schema-covers--and-what-it-cannot).

## The corpus (28 cases)

| Case | Rule | Expected code |
|---|---|---|
| [`credential-placement-mismatch`](credential-placement-mismatch/) | bearer requires the authorization header and no headerName | `KGCP-MANIFEST-CAPABILITY` |
| [`credential-send-to-empty`](credential-send-to-empty/) | sendTo must be non-empty | `KGCP-MANIFEST-CAPABILITY` |
| [`doc-path-wrong-extension`](doc-path-wrong-extension/) | documentation files are .md | `KGCP-MANIFEST-SEMANTIC-FILE` |
| [`family-sql-refused`](family-sql-refused/) | sql is not a legal manifest family | `KGCP-MANIFEST-IDENTITY` |
| [`family-unknown`](family-unknown/) | family must be one of the closed set | `KGCP-MANIFEST-IDENTITY` |
| [`fixture-path-outside-vocabulary`](fixture-path-outside-vocabulary/) | fixtures live directly under fixtures/ | `KGCP-MANIFEST-SEMANTIC-FILE` |
| [`identity-missing-version`](identity-missing-version/) | every identity member is required | `KGCP-MANIFEST-SCHEMA` |
| [`kind-not-package`](kind-not-package/) | kind must be exactly "kg.connector.package" | `KGCP-MANIFEST-SCHEMA` |
| [`manifest-schema-version-unsupported`](manifest-schema-version-unsupported/) | manifestSchemaVersion must be exactly 1 | `KGCP-MANIFEST-VERSION` |
| [`ontology-label-malformed`](ontology-label-malformed/) | an ontology label must be an identifier | `KGCP-ONTOLOGY-INVALID` |
| [`ontology-role-unknown`](ontology-role-unknown/) | ontology role is a closed vocabulary | `KGCP-MANIFEST-SCHEMA` |
| [`origin-missing-port`](origin-missing-port/) | an origin must carry an explicit port | `KGCP-MANIFEST-CAPABILITY` |
| [`origin-not-https`](origin-not-https/) | an origin must be https | `KGCP-MANIFEST-CAPABILITY` |
| [`origin-trailing-slash`](origin-trailing-slash/) | an origin must not carry a trailing slash | `KGCP-MANIFEST-CAPABILITY` |
| [`path-template-dot-segment`](path-template-dot-segment/) | pathTemplate must not contain dot segments | `KGCP-MANIFEST-CAPABILITY` |
| [`path-template-relative`](path-template-relative/) | pathTemplate must be absolute | `KGCP-MANIFEST-CAPABILITY` |
| [`public-origins-empty`](public-origins-empty/) | publicOrigins must be non-empty | `KGCP-MANIFEST-CAPABILITY` |
| [`redirects-not-disabled`](redirects-not-disabled/) | redirects must be "disabled" | `KGCP-MANIFEST-SCHEMA` |
| [`registry-id-noncanonical`](registry-id-noncanonical/) | registryId must be a canonical lowercase id | `KGCP-MANIFEST-IDENTITY` |
| [`request-method-not-get`](request-method-not-get/) | GET is the only legal method | `KGCP-MANIFEST-CAPABILITY` |
| [`requests-empty`](requests-empty/) | requests must be non-empty | `KGCP-MANIFEST-CAPABILITY` |
| [`response-urls-mode-unknown`](response-urls-mode-unknown/) | responseUrls.mode is a closed vocabulary | `KGCP-MANIFEST-SCHEMA` |
| [`response-urls-none-with-origins`](response-urls-none-with-origins/) | mode none forbids origins | `KGCP-MANIFEST-CAPABILITY` |
| [`semantic-file-digest-uppercase`](semantic-file-digest-uppercase/) | a digest must be lowercase hex | `KGCP-MANIFEST-SEMANTIC-FILE` |
| [`semantic-files-empty`](semantic-files-empty/) | semanticFiles must be non-empty | `KGCP-MANIFEST-SEMANTIC-FILE` |
| [`system-key-noncanonical`](system-key-noncanonical/) | systemKey segments admit only lowercase letters and digits | `KGCP-MANIFEST-IDENTITY` |
| [`unknown-top-level-field`](unknown-top-level-field/) | unknown members are refused at every level | `KGCP-MANIFEST-SCHEMA` |
| [`version-not-exact`](version-not-exact/) | version must be exact major.minor.patch | `KGCP-MANIFEST-IDENTITY` |

## Adding a case

1. Add the rule to `docs/manifest-schema.json`.
2. Create `counter-examples/<name>/kg-connector.json` violating exactly it, and
   `expected.json` naming the rule and the code.
3. Canonicalize: `python3 tools/canonicalize.py counter-examples/<name>/*.json`
   — a non-canonical manifest collapses to `KGCP-MANIFEST-SCHEMA` and would
   test the encoder instead of your rule.
4. `node tools/check.mjs --kg ./kg`
