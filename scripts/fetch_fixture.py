#!/usr/bin/env python3
"""
Fetch a CC0 test model so the asset pipeline can be run end to end.

The repository deliberately ships no binary assets — a skill that preaches payload
discipline should not put megabytes into every clone. This pulls one public-domain
model on demand instead, into a gitignored directory.

    ./fetch_fixture.py                      # WoodenChair_01 at 1k
    ./fetch_fixture.py --res 2k
    ./fetch_fixture.py --asset Ottoman_01 --outdir /tmp/fixtures

Source: Poly Haven (https://polyhaven.com/license) — CC0 / public domain. Free to
redistribute, modify and use commercially, no attribution required. Nothing is
committed, so the repository stays MIT-clean either way.
"""

import argparse
import json
import sys
import urllib.request
from pathlib import Path

API = "https://api.polyhaven.com"
DEFAULT_ASSET = "WoodenChair_01"

# Poly Haven rejects urllib's default User-Agent with a 403.
UA = {"User-Agent": "3d-web-revamp-fixture/1.0 (+https://github.com/yogeshkumbhat/3d-web-revamp)"}


def fetch(url, timeout=60):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)


def get_json(url):
    with fetch(url, timeout=30) as r:
        return json.load(r)


def download(url, path):
    with fetch(url) as r, open(path, "wb") as f:
        while chunk := r.read(65536):
            f.write(chunk)


def collect(node, files, rel=None):
    """Walk a Poly Haven file tree, collecting (relative path, url, size) entries.

    A glTF node carries its own url/size *and* an "include" map of sibling files
    (the .bin and the textures) keyed by the relative path the .gltf refers to, so
    the directory layout has to be preserved or the URIs will not resolve.
    """
    if not isinstance(node, dict):
        return
    if "url" in node and "size" in node:
        name = rel or node["url"].split("/")[-1]
        files.append((name, node["url"], node["size"]))
        for path, child in (node.get("include") or {}).items():
            collect(child, files, path)
        return
    for value in node.values():
        collect(value, files)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--asset", default=DEFAULT_ASSET, help=f"Poly Haven model id (default: {DEFAULT_ASSET})")
    ap.add_argument("--res", default="1k", help="texture resolution: 1k, 2k or 4k (default: 1k)")
    ap.add_argument("--outdir", default="fixtures", help="where to write (default: ./fixtures)")
    args = ap.parse_args()

    try:
        tree = get_json(f"{API}/files/{args.asset}")
    except Exception as e:
        sys.exit(f"Could not reach the Poly Haven API: {e}")

    if "gltf" not in tree:
        sys.exit(f"{args.asset} has no glTF variant.")
    if args.res not in tree["gltf"]:
        sys.exit(f"{args.asset} has no {args.res} glTF. Available: {', '.join(tree['gltf'])}")

    files = []
    collect(tree["gltf"][args.res], files)
    if not files:
        sys.exit(f"No files listed for {args.asset} at {args.res}.")

    dest = Path(args.outdir) / args.asset
    dest.mkdir(parents=True, exist_ok=True)

    total = 0
    entry = None
    for name, url, size in files:
        path = dest / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and path.stat().st_size == size:
            print(f"  cached  {name}")
        else:
            print(f"  fetch   {name}  ({size / 1048576:.2f} MB)")
            download(url, path)
        total += size
        if name.endswith(".gltf"):
            entry = path

    print(f"\n{args.asset} @ {args.res} — {total / 1048576:.2f} MB raw, CC0 (Poly Haven)")
    print(f"Wrote {dest}/")
    if entry:
        print("\nRun the pipeline on it:")
        print(f"  ./scripts/optimize_assets.sh {entry} --category configurator --texture-size 1024")


if __name__ == "__main__":
    main()
