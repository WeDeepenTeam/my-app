#!/usr/bin/env python3
"""
download-drive.py — pulls a public Google Drive folder to a local directory.

Strategy:
  1. Run `gdown --folder` to enumerate files (gdown's folder mode reliably
     enumerates but often fails at the bulk-download phase due to Drive's
     anti-abuse on aggregated downloads).
  2. Parse the "Processing file <id> <name>" listing.
  3. Download each file individually via `gdown <id>` (single-file mode is
     stable for files <100MB).
  4. Resume-friendly: skips files already on disk by size match.

Usage:
  python3 scripts/gallery/download-drive.py --album <slug>
  python3 scripts/gallery/download-drive.py --album all
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ALBUMS_JSON = ROOT / "scripts" / "gallery" / "albums.json"
TMP_DIR = ROOT / "tmp" / "gallery-source"

GDOWN = [sys.executable, "-m", "gdown"]
PROCESSING_RE = re.compile(r"Processing file (\S+) (.+?)\s*$")


def load_albums():
    with open(ALBUMS_JSON) as f:
        return json.load(f)["albums"]


def enumerate_folder(folder_id):
    """Run `gdown --folder` to get the file listing.

    Returns list of (file_id, filename) tuples. Discards download failures.
    """
    url = f"https://drive.google.com/drive/folders/{folder_id}"
    cmd = GDOWN + ["--folder", url, "--remaining-ok", "--quiet=False"]
    print(f"  enumerating {url} ...", flush=True)
    res = subprocess.run(cmd, capture_output=True, text=True, cwd="/tmp")
    files = []
    seen = set()
    for line in (res.stdout + "\n" + res.stderr).splitlines():
        m = PROCESSING_RE.search(line)
        if m:
            fid, fname = m.group(1), m.group(2).strip()
            if fid not in seen:
                seen.add(fid)
                files.append((fid, fname))
    return files


def download_file(file_id, dest_path):
    """Download a single file by ID via gdown."""
    cmd = GDOWN + [file_id, "--output", str(dest_path), "--continue"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.returncode == 0, res.stderr


def download_album(album, force=False, skip_existing=True):
    slug = album["slug"]
    folder_id = album.get("drive_folder_id")
    if not folder_id:
        print(f"  ⊘ {slug}: no drive_folder_id; skip", flush=True)
        return False

    out_dir = TMP_DIR / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    if not force and any(out_dir.rglob("*.jpg")):
        existing = sum(1 for _ in out_dir.rglob("*.jpg"))
        print(f"  ✓ {slug}: {existing} files already present (use --force to redownload)", flush=True)
        return True

    files = enumerate_folder(folder_id)
    if not files:
        print(f"  ✗ {slug}: enumeration returned 0 files", flush=True)
        return False
    print(f"  → {slug}: {len(files)} files to download", flush=True)

    succeeded = 0
    skipped = 0
    failed = 0
    for i, (fid, fname) in enumerate(files):
        # Sanitize filename
        safe_name = re.sub(r"[^\w.\-]", "_", fname)
        dest = out_dir / safe_name

        if skip_existing and dest.exists() and dest.stat().st_size > 0:
            skipped += 1
            continue

        ok, err = download_file(fid, dest)
        if ok and dest.exists() and dest.stat().st_size > 0:
            succeeded += 1
            if (i + 1) % 10 == 0:
                print(f"    ... {succeeded}/{len(files)} downloaded ({skipped} skipped, {failed} failed)", flush=True)
        else:
            failed += 1
            tail = err.strip().splitlines()[-3:] if err else []
            print(f"    ✗ {fname}: failed — {' | '.join(tail)[:200]}", flush=True)
            try:
                if dest.exists() and dest.stat().st_size == 0:
                    dest.unlink()
            except Exception:
                pass

    print(f"  ✓ {slug}: {succeeded} downloaded, {skipped} cached, {failed} failed", flush=True)
    return failed == 0


def cleanup_album(slug):
    out_dir = TMP_DIR / slug
    if out_dir.exists():
        shutil.rmtree(out_dir)
        print(f"  cleaned up {out_dir}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--album", required=True, help="Album slug or 'all'")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--cleanup", action="store_true", help="Delete local copy after success (single album only)")
    args = ap.parse_args()

    if args.cleanup and args.album == "all":
        print("--cleanup is only valid for single-album runs"); sys.exit(2)

    albums = load_albums()
    targets = albums if args.album == "all" else [a for a in albums if a["slug"] == args.album]
    if not targets:
        print(f"No album matching '{args.album}'"); sys.exit(2)

    TMP_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {len(targets)} album(s) to {TMP_DIR}")

    succeeded = failed = skipped = 0
    for album in targets:
        ok = download_album(album, force=args.force)
        if not album.get("drive_folder_id"):
            skipped += 1
        elif ok:
            succeeded += 1
        else:
            failed += 1

    print(f"\nDone. {succeeded} succeeded, {skipped} skipped, {failed} failed.")
    if args.cleanup and succeeded == 1 and failed == 0:
        cleanup_album(targets[0]["slug"])
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
