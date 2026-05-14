# WeDeepen Event Gallery — Pipeline & Runbook

Pulls event photos from public Google Drive folders, resizes them, uploads to Supabase Storage, and generates static HTML gallery pages on `wedeepen.com/wedeepen/gallery/`.

## What got built (already on this branch)

- `supabase/migrations/20260506_gallery.sql` — schema
- `scripts/gallery/albums.json` — album metadata + Drive folder IDs
- `scripts/gallery/download-drive.py` — gdown wrapper
- `scripts/gallery/process-and-upload.js` — sharp resize + Supabase upload
- `scripts/gallery/build-static-pages.js` — DB → static HTML
- `scripts/gallery/smoke-test.js` — verifies HTML is sound before push
- `scripts/gallery/lib/{escape-html,page-shell,index-template,album-template,supabase-admin}.js`
- `wedeepen/gallery/` — destination dir (will be created by build script)
- `wedeepen/index.html` — FB link swapped to `/wedeepen/gallery/`

## Morning runbook (~30–60 min)

### 0. One-time setup (5 min)

```bash
# Unlock Bitwarden, fetch Supabase service_role key
bw unlock                          # paste master password
bw get item "Supabase oycfonjaufdihuwjecxu" 2>/dev/null \
  || bw list items --search supabase  # find the right item

# Create scripts/gallery/.env from the example
cp scripts/gallery/.env.example scripts/gallery/.env
# Edit scripts/gallery/.env, paste SUPABASE_SERVICE_ROLE_KEY (from Bitwarden)

# Install gallery pipeline deps (sharp, supabase-js, dotenv)
npm run gallery:install

# Verify Python tooling
python3 -c "import gdown; print(gdown.__version__)"  # must print version, not error
```

### 1. Run schema migration (2 min)

Two options. Pick the one that matches your usual workflow.

**Option A — Supabase dashboard:**
1. Open https://supabase.com/dashboard/project/oycfonjaufdihuwjecxu/sql
2. Paste contents of `supabase/migrations/20260506_gallery.sql`
3. Run

**Option B — psql via DATABASE_URL:**
```bash
# Add DATABASE_URL to scripts/gallery/.env (find in Supabase → Project Settings → Database)
psql "$DATABASE_URL" < supabase/migrations/20260506_gallery.sql
```

### 2. Create the storage bucket (1 min)

Supabase dashboard → Storage → New bucket:
- Name: `gallery`
- Public bucket: **yes**
- File size limit: 5 MB

Or via Supabase CLI: `supabase storage create-bucket gallery --public`

### 3. Paste Drive folder IDs into albums.json (5 min)

Only Aboutly Training has a folder ID right now. Open the parent Drive folder:
https://drive.google.com/drive/folders/1yvHx-RePRo-yK7YYgDC4uEdkIh_z9HH_

For each event subfolder (the 11 named in `albums.json` with `drive_folder_id: null`):
1. Right-click the folder → "Get link" → copy
2. The folder ID is between `/folders/` and `?` in the URL
3. Paste into the matching album entry in `scripts/gallery/albums.json`

For `LOVE IMMERSIONS`: open it, then grab the ID for each Immersion I–VI subfolder.

If you skip an album for now, leave `drive_folder_id: null` — the pipeline will skip it.

### 4. POC: Aboutly Training only (~5 min, ~30MB peak disk)

```bash
# Download (38 photos, ~700MB raw)
python3 scripts/gallery/download-drive.py --album aboutly-training

# Resize + upload to Supabase
npm run gallery:process -- --album aboutly-training

# Optional: clean up local copy after upload
rm -rf tmp/gallery-source/aboutly-training

# Run unit test
npm run gallery:test

# Build static HTML (writes /wedeepen/gallery/index.html + /aboutly-training/index.html)
npm run gallery:build

# Smoke test
npm run gallery:smoke
```

Open `wedeepen/gallery/index.html` in browser — should show one album card. Click it — should show 38 photos in a grid. Click a thumb — lightbox opens. ←/→/Esc work.

If it looks good: skip to step 5. If not: tell Claude what's wrong, we iterate.

### 5. Bulk run (all 17 albums, ~30–60 min)

This is disk-friendly: download → process → cleanup, one album at a time. Peak disk ≈ 7GB for the biggest album.

```bash
# Bash loop: download → process → cleanup, per album
for slug in $(node -e "JSON.parse(require('fs').readFileSync('scripts/gallery/albums.json')).albums.filter(a=>a.drive_folder_id).forEach(a=>console.log(a.slug))"); do
  echo "=== $slug ==="
  python3 scripts/gallery/download-drive.py --album "$slug" || continue
  (cd scripts/gallery && node process-and-upload.js --album "$slug") || continue
  rm -rf "tmp/gallery-source/$slug"
done

# Build everything
npm run gallery:build
npm run gallery:smoke
```

Or: just run them all and don't clean up (if you have plenty of disk):
```bash
python3 scripts/gallery/download-drive.py --album all
npm run gallery:process -- --album all
npm run gallery:build
npm run gallery:smoke
```

### 6. Verify before push

```bash
# Open the gallery in your browser
open wedeepen/gallery/index.html

# Check a couple album pages
open wedeepen/gallery/aboutly-training/index.html
open wedeepen/gallery/love-immersion-vi/index.html

# Validate JSON-LD schema (paste any album page URL)
# https://search.google.com/test/rich-results

# Validate OG card render
# https://www.opengraph.xyz/  (paste any album URL)
```

### 7. Push

```bash
git status
git add -A
git commit -m "Add WeDeepen event gallery: 17 albums, full pipeline + static HTML"
./scripts/push-main.sh    # if pushing to main
# or: git push origin claude/focused-solomon-beb9a7  # to feature branch first
```

CI will bump version. Verify deploy at https://wedeepen.com/wedeepen/gallery/.

## Adding a new event later

1. Add an entry to `scripts/gallery/albums.json` with the Drive folder ID
2. Run:
   ```bash
   python3 scripts/gallery/download-drive.py --album <new-slug>
   npm run gallery:process -- --album <new-slug>
   npm run gallery:build
   ```
3. Commit + push

## Troubleshooting

- **`gdown` rate-limited**: wait an hour, or use a different network. The Drive folders are public so no auth issues, just download throttling.
- **Sharp OOM on huge originals**: scripts already set `limitInputPixels: 268M (~16k×16k)`. If a file is larger, Sharp throws — the script logs the error and continues with the next photo.
- **Supabase upload 413 (file too large)**: bucket file limit is 5MB; resized webp should always fit. If a single photo exceeds, lower the `quality` in `process-and-upload.js`.
- **Storage path conflict on rerun**: pipeline is idempotent — same source file produces same SHA1 hash → same storage path → upload uses upsert + DB row gets reused.
- **Build script fails with RLS error**: build script uses service_role key (bypasses RLS). Verify `SUPABASE_SERVICE_ROLE_KEY` is in `.env`, not the anon key.

## Architecture notes

- Photos stored in `media` table with `category='mktg'`. The `gallery_album_media` junction is the discriminator for "is this a gallery photo?"
- Storage paths are content-addressed: `<slug>/full/<sha1>.webp` and `<slug>/thumb/<sha1>.webp`. Re-uploads are idempotent.
- Static HTML is generated, not server-rendered. SEO-optimized: every album page is a real `index.html` with full schema.org `ImageGallery` JSON-LD, OG tags, canonical URL.
- Pagination: 100 photos initial render + "Load more" button (full DOM, JS reveals). Mobile-friendly.
- Lightbox: self-contained per page, keyboard-navigable (←/→/Esc), aria-labeled.

Phase 3 (event-page integration — pulling each album's photos onto its existing event page) is on the [GALLERY-PLAN.md](../../GALLERY-PLAN.md). Not in this initial bulk run.
