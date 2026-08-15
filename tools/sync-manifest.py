#!/usr/bin/env python3
"""Re-derive a manifest's file inventories from what is actually on disk.

`semanticFiles`, `fixtureFiles` and `documentationFiles` must each equal the
package's real `mappings/`, `fixtures/` and `docs/` members exactly, strictly
sorted, and every `semanticFiles[].sha256` must be the lowercase SHA-256 of
that mapping's exact canonical bytes. Edit a mapping and the manifest is
stale; this recomputes it.

    python3 tools/sync-manifest.py connector/
    python3 tools/sync-manifest.py --check connector/
"""
import argparse
import hashlib
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from canonicalize import canonicalize, NotCanonical  # noqa: E402

MANIFEST = "kg-connector.json"


def members(root, directory, suffix):
    base = root / directory
    if not base.is_dir():
        return []
    return sorted(f"{directory}/{p.name}" for p in base.iterdir()
                  if p.is_file() and p.name.endswith(suffix))


def build(root):
    import json
    manifest_path = root / MANIFEST
    manifest = json.loads(manifest_path.read_bytes().decode("utf-8"))

    semantic = []
    for path in members(root, "mappings", ".json"):
        digest = hashlib.sha256((root / path).read_bytes()).hexdigest()
        semantic.append({"path": path, "sha256": digest})
    manifest["semanticFiles"] = semantic
    manifest["fixtureFiles"] = members(root, "fixtures", ".json")
    manifest["documentationFiles"] = members(root, "docs", ".md")
    return manifest_path, canonicalize(json.dumps(manifest).encode("utf-8"))


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", help="package source directory")
    parser.add_argument("--check", action="store_true",
                        help="exit non-zero if the manifest is stale; write nothing")
    args = parser.parse_args()

    root = pathlib.Path(args.source)
    try:
        manifest_path, after = build(root)
    except NotCanonical as error:
        print(f"{args.source}: {error}", file=sys.stderr)
        return 1

    before = manifest_path.read_bytes()
    if before == after:
        return 0
    if args.check:
        print(f"{manifest_path}: file inventories or digests are stale", file=sys.stderr)
        return 1
    manifest_path.write_bytes(after)
    print(f"{manifest_path}: inventories and digests synced")
    return 0


if __name__ == "__main__":
    sys.exit(main())
