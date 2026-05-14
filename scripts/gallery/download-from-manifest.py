#!/usr/bin/env python3
"""
download-from-manifest.py — download files from a TSV manifest of (id, name) pairs.

Use this when gdown's --folder mode fails (folders >50 files, anti-abuse, etc).
Manifests are produced via DOM extraction from the Drive web app — see README.

Usage:
  python3 scripts/gallery/download-from-manifest.py --album <slug>

Reads tmp/gallery-manifests/<slug>.tsv. Each line: <file_id>\t<filename>
Downloads to tmp/gallery-source/<slug>/. Skips existing files.
"""
import argparse
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_DIR = ROOT / "tmp" / "gallery-manifests"
SOURCE_DIR = ROOT / "tmp" / "gallery-source"

GDOWN = [sys.executable, "-m", "gdown"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--album", required=True)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    manifest_path = MANIFEST_DIR / f"{args.album}.tsv"
    if not manifest_path.exists():
        print(f"Manifest not found: {manifest_path}")
        sys.exit(2)

    out_dir = SOURCE_DIR / args.album
    out_dir.mkdir(parents=True, exist_ok=True)

    entries = []
    with open(manifest_path) as f:
        for line in f:
            line = line.rstrip("\n")
            if not line or "\t" not in line:
                continue
            fid, name = line.split("\t", 1)
            entries.append((fid.strip(), name.strip()))

    print(f"Downloading {len(entries)} files for {args.album} -> {out_dir}", flush=True)
    succeeded = skipped = failed = 0
    consecutive_failures = 0
    for i, (fid, name) in enumerate(entries):
        safe = re.sub(r"[^\w.\-]", "_", name)
        dest = out_dir / safe
        if dest.exists() and dest.stat().st_size > 0 and not args.force:
            skipped += 1
            continue

        # Rate-limit avoidance: gentle cooldown every 25 successful downloads
        if succeeded > 0 and succeeded % 25 == 0:
            print(f"  ... cooldown 30s (avoiding Drive rate limit)", flush=True)
            time.sleep(30)

        cmd = GDOWN + [fid, "--output", str(dest)]
        res = subprocess.run(cmd, capture_output=True, text=True)
        ok = res.returncode == 0 and dest.exists() and dest.stat().st_size > 0

        if ok:
            succeeded += 1
            consecutive_failures = 0
            if (i + 1) % 5 == 0 or i + 1 == len(entries):
                print(f"  ... {succeeded}/{len(entries)} ({skipped} skipped, {failed} failed)", flush=True)
            time.sleep(0.5)  # small spacing between calls
        else:
            failed += 1
            consecutive_failures += 1
            tail = (res.stderr or "").strip().splitlines()[-2:]
            print(f"  ✗ {name}: {' | '.join(tail)[:160]}", flush=True)
            try:
                if dest.exists() and dest.stat().st_size == 0:
                    dest.unlink()
            except Exception:
                pass
            # If we hit a streak of failures, back off hard
            if consecutive_failures >= 3:
                back_off = min(120, 15 * consecutive_failures)
                print(f"    ... {consecutive_failures} consecutive failures, backing off {back_off}s", flush=True)
                time.sleep(back_off)

    print(f"\nDone. {succeeded} downloaded, {skipped} cached, {failed} failed.")
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
