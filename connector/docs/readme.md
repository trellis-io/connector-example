# Example Tracker connector

A minimal, complete `verified`-tier connector package for the fictional
**Example Tracker** work-tracking service at `api.example.test`.

It declares one credential slot, one `GET` request, and one mapping that turns
that request's JSON response into `:WorkItem` records. Everything in
`fixtures/` is synthetic — no real service, accounts, or personal data.

| Piece | File |
|---|---|
| Manifest | `kg-connector.json` |
| Mapping | `mappings/work-items.json` |
| Fixture | `fixtures/work-items.json` |

Run it from the repository root:

    kg connector validate connector/ --tier verified --json
    kg connector dev-run  connector/ --tier verified --json

See the repository README for the full author journey.
