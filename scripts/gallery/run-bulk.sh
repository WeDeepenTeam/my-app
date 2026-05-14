#!/bin/bash
# run-bulk.sh — for each manifest in tmp/gallery-manifests/, download + process + upload + cleanup.
# Intended to be invoked unattended. Logs go to tmp/gallery-manifests/<slug>.log
#
# Usage: ./scripts/gallery/run-bulk.sh [<slug1> <slug2> ...]
#   No args = process every .tsv in tmp/gallery-manifests/

set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

MANIFESTS_DIR="tmp/gallery-manifests"
SOURCE_DIR="tmp/gallery-source"
SUMMARY_LOG="$MANIFESTS_DIR/_bulk-summary.log"

mkdir -p "$SOURCE_DIR"
echo "[$(date)] === BULK RUN START ===" >> "$SUMMARY_LOG"

slugs=()
if [ $# -gt 0 ]; then
  slugs=("$@")
else
  for f in "$MANIFESTS_DIR"/*.tsv; do
    [ -f "$f" ] || continue
    base=$(basename "$f" .tsv)
    [ "$base" = "_bulk-summary" ] && continue
    slugs+=("$base")
  done
fi

for slug in "${slugs[@]}"; do
  manifest="$MANIFESTS_DIR/$slug.tsv"
  if [ ! -f "$manifest" ]; then
    echo "[$(date)] $slug: no manifest at $manifest" >> "$SUMMARY_LOG"
    continue
  fi

  log="$MANIFESTS_DIR/$slug.log"
  echo "[$(date)] === $slug START ===" | tee -a "$SUMMARY_LOG"

  # 1. Download
  echo "[$(date)] $slug: downloading..." >> "$SUMMARY_LOG"
  python3 scripts/gallery/download-from-manifest.py --album "$slug" >>"$log" 2>&1
  dlrc=$?
  echo "[$(date)] $slug: download exit=$dlrc" >> "$SUMMARY_LOG"

  # 2. Process + upload (even if some downloads failed — we run on what we have)
  count=$(ls -1 "$SOURCE_DIR/$slug" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" -lt 1 ]; then
    echo "[$(date)] $slug: 0 files downloaded; skip process" | tee -a "$SUMMARY_LOG"
    continue
  fi
  echo "[$(date)] $slug: processing $count files..." >> "$SUMMARY_LOG"
  (cd scripts/gallery && node process-and-upload.js --album "$slug") >>"$log" 2>&1
  prc=$?
  echo "[$(date)] $slug: process exit=$prc" >> "$SUMMARY_LOG"

  # 3. Cleanup local source to free disk
  rm -rf "$SOURCE_DIR/$slug"
  echo "[$(date)] $slug: cleaned up" >> "$SUMMARY_LOG"
  echo "[$(date)] === $slug DONE ===" | tee -a "$SUMMARY_LOG"

  # Cooldown between albums to ease rate limits
  sleep 15
done

# Build static pages at the end
echo "[$(date)] Building static pages..." | tee -a "$SUMMARY_LOG"
(cd scripts/gallery && node build-static-pages.js) >> "$SUMMARY_LOG" 2>&1
echo "[$(date)] === BULK RUN END ===" >> "$SUMMARY_LOG"
