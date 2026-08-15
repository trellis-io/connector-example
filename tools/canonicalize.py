#!/usr/bin/env python3
"""Canonicalize a connector package JSON file in place (or on stdin/stdout).

kg refuses any package JSON whose bytes are not already the canonical
encoding (kg-core `package::canonical_json`): object member names sorted by
byte, no insignificant whitespace, exactly one trailing LF, integers only,
no control characters inside strings, and NFC-normalized text. Authoring
that by hand is error-prone, so edit readably and run this before validate.

    python3 tools/canonicalize.py connector/kg-connector.json
    python3 tools/canonicalize.py --check connector/**/*.json
    cat draft.json | python3 tools/canonicalize.py > canonical.json
"""
import argparse
import json
import sys
import unicodedata


class NotCanonical(Exception):
    """The input cannot be represented as canonical package JSON."""


def _no_duplicates(pairs):
    seen = set()
    for key, _ in pairs:
        if key in seen:
            raise NotCanonical(f"duplicate object member {key!r}")
        seen.add(key)
    return dict(pairs)


def _check_string(text, where):
    for char in text:
        if unicodedata.category(char) == "Cc":
            raise NotCanonical(f"forbidden control character at {where}: {text!r}")
    if unicodedata.normalize("NFC", text) != text:
        raise NotCanonical(f"string is not Unicode NFC at {where}: {text!r}")


def _check(value, where="<root>"):
    if isinstance(value, dict):
        for key, sub in value.items():
            if not key.isascii():
                raise NotCanonical(f"object member name must be ASCII at {where}: {key!r}")
            _check_string(key, where)
            _check(sub, f"{where}.{key}")
    elif isinstance(value, list):
        for index, sub in enumerate(value):
            _check(sub, f"{where}[{index}]")
    elif isinstance(value, str):
        _check_string(value, where)
    elif isinstance(value, bool) or value is None:
        pass
    elif isinstance(value, float):
        raise NotCanonical(f"floating-point numbers are forbidden at {where}")
    elif isinstance(value, int):
        pass
    else:
        raise NotCanonical(f"unsupported JSON type at {where}: {type(value).__name__}")


def canonicalize(raw):
    """Return the canonical bytes for one JSON document."""
    if raw.startswith(b"\xef\xbb\xbf"):
        raise NotCanonical("UTF-8 BOM is forbidden")
    value = json.loads(raw.decode("utf-8"), object_pairs_hook=_no_duplicates,
                       parse_float=_reject_float)
    _check(value)
    text = json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False)
    return text.encode("utf-8") + b"\n"


def _reject_float(literal):
    raise NotCanonical(f"floating-point number {literal!r} is forbidden")


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("files", nargs="*",
                        help="JSON files to rewrite in place; omit to filter stdin to stdout")
    parser.add_argument("--check", action="store_true",
                        help="exit non-zero if any file is not already canonical; write nothing")
    args = parser.parse_args()

    if not args.files:
        sys.stdout.buffer.write(canonicalize(sys.stdin.buffer.read()))
        return 0

    failures = 0
    for path in args.files:
        with open(path, "rb") as handle:
            before = handle.read()
        try:
            after = canonicalize(before)
        except NotCanonical as error:
            print(f"{path}: {error}", file=sys.stderr)
            failures += 1
            continue
        if before == after:
            continue
        if args.check:
            print(f"{path}: not canonical", file=sys.stderr)
            failures += 1
            continue
        with open(path, "wb") as handle:
            handle.write(after)
        print(f"{path}: canonicalized")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
