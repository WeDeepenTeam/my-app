<!-- /autoplan restore point: /Users/christinaweber/.gstack/projects/WeDeepenTeam-my-app/claude-focused-solomon-beb9a7-autoplan-restore-20260505-234210.md -->
# WeDeepen Event Gallery — Implementation Plan

## Goal

Replace the "See More Photos on FB →" link on `wedeepen.com` with a full event gallery hosted on our own site. Public, SEO-optimized, with photos in Supabase Storage and videos as YouTube embeds. Pulls from a public Google Drive (~12 events, ~1,500–2,000 photos total).

## Non-goals

- No login/gating. Public for SEO.
- No CMS UI for managing albums (we run a script when adding new events; album metadata is checked into git as JSON).
- No video uploads to our storage — YouTube only.
- No automatic Drive→site sync (script is run manually when needed).

## Architecture

```
Google Drive (public)
  └─ Aboutly Training Feb 2025/photos/*.jpg (38 photos, 8–41MB each)
  └─ LOVE IMMERSIONS/Immersion VI/photos/*.jpg
  └─ ... (12 events total)

         ▼  scripts/gallery/download-drive.py  (gdown)

./tmp/gallery-source/<album-slug>/*.jpg  (raw downloads)

         ▼  scripts/gallery/process-and-upload.js  (sharp + supabase-js)

Supabase Storage bucket: gallery
  └─ <album-slug>/full/<media-id>.webp     (max 1600px, ~85% quality)
  └─ <album-slug>/thumb/<media-id>.webp    (400px square crop, ~80% quality)

Supabase DB:
  gallery_albums       (slug, title, description, event_date, cover_media_id, youtube_ids[], display_order)
  gallery_album_media  (album_id, media_id, display_order)  — junction
  media                (existing table — stores url, width, height, alt)

         ▼  scripts/gallery/build-static-pages.js  (reads DB, writes HTML)

/wedeepen/gallery/index.html              (album grid)
/wedeepen/gallery/<slug>/index.html       (per-album page)
sitemap.xml                                (updated with album URLs)
```

## Album mapping (Drive folder → site album)

| Drive folder | Slug | Title |
|---|---|---|
| `Aboutly Training Feb 2025` | `aboutly-training` | WeDeepen × Aboutly Training |
| `Biohacking Conference 2025` | `beyond-biohacking-2025` | Beyond Biohacking Conference 2025 |
| `Biohacking Love Events` | `biohacking-love` | Biohacking Love |
| `HEART FLOW` | `heart-flow` | Heart Flow |
| `JOURNEY TO CONNECTION` | `journey-to-connection` | Journey to Connection |
| `LOVE IMMERSIONS/Immersion I` | `love-immersion-i` | Love Immersion I |
| `LOVE IMMERSIONS/Immersion II` | `love-immersion-ii` | Love Immersion II |
| `LOVE IMMERSIONS/Immersion III` | `love-immersion-iii` | Love Immersion III |
| `LOVE IMMERSIONS/Immersion IV` | `love-immersion-iv` | Love Immersion IV |
| `LOVE IMMERSIONS/Immersion V` | `love-immersion-v` | Love Immersion V |
| `LOVE IMMERSIONS/Immersion VI` | `love-immersion-vi` | Love Immersion VI |
| `MediDating` | `medidating` | MediDating |
| `MIDNIGHTS WITH MARY` | `midnights-with-mary` | Midnights with Mary |
| `MINDFUL MINGLING` | `mindful-mingling` | Mindful Mingling |
| `Solar Punk 2025` | `solar-punk-2025` | Solar Punk Summit 2025 |
| `The Dating Dojo` | `dating-dojo` | The Dating Dojo |
| `WE PLAY RECESS` | `we-play-recess` | We Play Recess |

**Skipped Drive folders:** `Christina Media Photos`, `Christina's Phone`, `Creative Assets for Immersion`, `IG Videos`, `Logos`, `Love Guardian Images`, `Podcast Interviews`.

Album metadata (event_date, description, YouTube IDs, cover photo override) lives in `scripts/gallery/albums.json` — checked into git, edited by hand.

## Schema

```sql
-- Albums
create table gallery_albums (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  title           text not null,
  description     text,
  event_date      date,
  location        text,                          -- "Austin, TX"
  cover_media_id  uuid references media(id),    -- override; falls back to first media
  youtube_ids     text[] default '{}',           -- YouTube video IDs to embed
  event_page_slug text,                          -- e.g. "love-immersion" — for Approach B event-page integration
  display_order   int default 0,                 -- lower = earlier in grid
  is_published    boolean default true,
  is_archived     boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index on gallery_albums (display_order, event_date desc) where is_published = true and is_archived = false;

-- Junction: album ↔ media
create table gallery_album_media (
  album_id      uuid references gallery_albums(id) on delete cascade,
  media_id      uuid references media(id) on delete cascade,
  display_order int default 0,
  primary key (album_id, media_id)
);
create index on gallery_album_media (album_id, display_order);

-- RLS: public read, no public write
alter table gallery_albums enable row level security;
alter table gallery_album_media enable row level security;
create policy "public read albums" on gallery_albums for select using (is_published and not is_archived);
create policy "public read album_media" on gallery_album_media for select using (true);
```

The existing `media` table already has `url`, `width`, `height`, `caption`, `category`. We'll add `category = 'gallery'` rows. We'll set `caption` to alt text per photo.

## Storage

New Supabase Storage bucket: **`gallery`** (public read).
- Path: `<album-slug>/full/<uuid>.webp` and `<album-slug>/thumb/<uuid>.webp`
- CDN cache headers: `cache-control: public, max-age=31536000, immutable` (filenames are content-addressed by uuid).

Why a new bucket vs reusing `housephotos`? Separation of concerns — different access patterns, different lifecycles, easier to audit/move later.

## Image variants

| Variant | Long edge | Format | Quality | Use |
|---|---|---|---|---|
| `full` | 1600px max | WebP | 85 | Lightbox, OG image |
| `thumb` | 400px max | WebP | 80 | Grid card |

JPEG fallback? **No.** WebP support is universal in modern browsers (97%+). If we ever need JPEG, we generate at build time.

EXIF: stripped (privacy + smaller files).
Original aspect ratio: preserved (no center-crop).

## Pipeline scripts

All under `scripts/gallery/`:

```
scripts/gallery/
├── albums.json              # Album metadata (slug, title, drive_folder_id, event_date, ...)
├── download-drive.py        # gdown — pulls Drive folders to ./tmp/gallery-source/<slug>/
├── process-and-upload.js    # Per-album: sharp resize → Supabase upload → DB rows
├── build-static-pages.js    # Reads DB → writes /wedeepen/gallery/<slug>/index.html
└── README.md                # How to run
```

**Workflow when adding a new event:**
```bash
# 1. Add album entry to scripts/gallery/albums.json
# 2. Download from Drive
python scripts/gallery/download-drive.py --album love-immersion-vi
# 3. Process + upload
node scripts/gallery/process-and-upload.js --album love-immersion-vi
# 4. Generate static HTML
node scripts/gallery/build-static-pages.js
# 5. Commit + push
```

For the bulk initial load: `--album all` runs over every album in `albums.json`.

### Idempotency

- `process-and-upload.js` checks DB for existing media by source filename (e.g., `aboutly-training/5W8A1408.jpg`). If present, skips. Re-running is safe.
- `build-static-pages.js` always rewrites all HTML — no diff logic.
- New deps: `sharp`, `@supabase/supabase-js`, `dotenv`.

### Concurrency

- Process 4 images in parallel per album (sharp is CPU-bound; balance against Supabase upload throughput).
- One album at a time (less complexity, easier failure recovery).

## Pages

### `/wedeepen/gallery/index.html`
- Hero: "Photo Gallery" + 1-line tagline (final copy TBD by Christina; placeholder OK for v1)
- Album grid: responsive (1/2/3/4 cols by breakpoint), each card = cover image + title + event_date + photo count
- Uses `aap-*` Tailwind tokens (aap-cream, aap-charcoal, aap-amber) per `@theme` block
- Sorted by `display_order ASC, event_date DESC`
- Lazy-loaded thumbs

### `/wedeepen/gallery/<slug>/index.html`
- Hero: album title, date, location, description
- Photo grid: thumbs, click → lightbox (uses existing `openLightbox()` per CLAUDE.md)
- **Pagination: 100 photos initial render + "Load more" button.** Implementation: full media list rendered as data attributes, JS reveals next 100 on click. Keeps SEO (all images in DOM) + mobile-friendly initial paint.
- Videos section (if `youtube_ids[]` non-empty): grid of YouTube `<iframe>` embeds with `loading="lazy"`
- "Back to all galleries" link
- "Share this album" button (copies URL)
- **CTA at bottom: "Want to be in the next one?" → `/wedeepen/events/`** (per autoplan Decision D2, supports user journey)

### `/wedeepen/<event-slug>/` (existing event pages — Approach B integration)

After gallery is live, event pages auto-pull their associated album:
- `/wedeepen/love-immersion/` → pulls `love-immersion-vi` (most recent) inline
- `/wedeepen/events/` → links to gallery + most recent event's photos
- Mapping: `gallery_albums.event_page_slug` column links album to event page
- Event page renders 12-photo highlight grid + "See full album →" link to `/wedeepen/gallery/<slug>/`

This is **Approach B** per autoplan Decision 1 — photos surface on conversion pages, not just gallery silo.

### Generation strategy

**Static HTML, generated by Node script.** Each album page is a real `index.html` file checked into git (or built in CI before push). This is non-negotiable for "go hard on SEO" — JS-rendered content gets indexed slower and worse.

The build script is a one-off Node program (no SSG framework — keeps it consistent with the vanilla site's philosophy). Template is a JS template literal.

**Trade-off:** Adding a new photo = re-running build + git commit. Acceptable because we add events monthly, not daily.

## SEO

Per-album page includes:
- `<title>`: "<Album Title> — Photos | WeDeepen"
- `<meta name="description">`: First 150 chars of album description, or generated default
- `<link rel="canonical">`: Full album URL
- Open Graph: `og:image` = cover full, `og:title`, `og:description`, `og:type=article`
- Twitter Card: `summary_large_image`
- JSON-LD: `ImageGallery` schema with `image[]` array (full URLs + alt text)
- Every `<img>` has `alt` text (default: "<Album Title> — photo N", customizable in DB via `media.caption`)
- Every `<img>` has `width` + `height` attrs (prevents CLS, helps Core Web Vitals)

Sitemap update:
- `build-static-pages.js` rewrites `sitemap.xml` to include `/wedeepen/gallery/` + each album URL.

`robots.txt`: already permits all. No change.

## Performance

- Thumbs: ~30–60KB each. 100-image grid = ~5MB total but **lazy-loaded** so first paint is fast.
- Full images: ~200–400KB. Loaded on lightbox open.
- Supabase storage CDN serves with proper cache headers.
- LCP target: < 2.5s (cover image is hero, preloaded).

## Site link replacement

In [wedeepen/index.html:722](wedeepen/index.html:722):

```diff
-<a href="https://www.facebook.com/WeDeepen/photos_albums" target="_blank" rel="noopener" class="btn-outline">See More Photos on FB &rarr;</a>
+<a href="/wedeepen/gallery/" class="btn-outline">See Photo Galleries &rarr;</a>
```

The 8 hardcoded thumbnails above (lines ~688-718) stay as-is — they're a curated highlight reel, not a full gallery preview. Maybe we replace them with cover images from real albums in a follow-up.

## What we're explicitly *not* doing in v1

- Album cover image override UI — set via DB column for now, will manually update if needed
- Photo captions per-image — `media.caption` exists but we'll default-generate alt text and only customize if Christina wants
- Video uploads to Supabase — YouTube only
- Search / filter / tag UI — just album grid + per-album view
- Pagination within albums — we render all photos at once (lazy-loaded). Even 300 thumbs = ~15MB lazy = fine
- Photo-of-the-day or featured photo treatments
- Comments / social
- Gallery analytics beyond existing GA

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| gdown breaks on huge folders / rate limits | Fallback: ask Christina to download per-album zips from Drive UI; script ingests local zips |
| Supabase Storage egress cost balloons | All assets are CDN-cached with long max-age; egress is one-time per visitor per asset. At 1k visitors/mo × 100 photos × 200KB = 20GB/mo = ~$1.80 egress. Negligible. |
| Drive folder structure doesn't match `albums.json` | Script logs unknown folders + missing folders; Christina updates `albums.json` |
| Photo release / consent | All event attendees sign a photo release at registration. Confirmed by Christina 2026-05-05. No per-photo review needed. |
| Build script breaks Tailwind classes | Pages use the same global `tailwind.out.css` — verified during dev; run `npm run css:build` if new utility classes added |
| Image processing slow for 2000 photos | At ~1s per image with parallelism=4, ~500s total = 8 min. Acceptable for one-off run. |
| Drive folder structure has unexpected nesting (`/photos/` `/video/` subfolders) | Script walks recursively, picks up images by extension regardless of subfolder |

## Phased delivery

**Phase 1 — POC (1 album):** Aboutly Training (38 photos)
- Schema migration: create `gallery_albums` + `gallery_album_media` tables; add `gallery` storage bucket
- `scripts/gallery/` scaffolding (download-drive.py, process-and-upload.js, build-static-pages.js, smoke-test.js, escapeHtml + unit test)
- Process Aboutly end-to-end (download → resize → upload → DB → static HTML)
- Build `/wedeepen/gallery/` index + `/wedeepen/gallery/aboutly-training/` page with pagination + CTA
- Verify: Lighthouse SEO ≥95, Rich Results test (ImageGallery), OG card preview
- Replace FB link on homepage

**Phase 2 — Bulk:** All remaining 16 albums
- Run pipeline for each (idempotent; safe to re-run)
- Final commit + push

**Phase 3 — Approach B integration:** Event-page photo embedding
- Add `event_page_slug` mapping to existing albums in DB
- Update `/wedeepen/love-immersion/`, `/wedeepen/events/`, `/wedeepen/love-club/` etc. to auto-pull their album's 12 highlight photos + link to full gallery
- Verify Lighthouse on event pages still ≥95

**Phase 4 — Polish (optional):**
- Hero copy in Christina's voice for `/wedeepen/gallery/`
- Cover-image curation per album
- Album descriptions written by Christina
- YouTube videos added per album

Each phase ends with a commit + push (CI bumps version).

## Acceptance criteria

- [ ] `/wedeepen/gallery/` shows all 17 albums in a responsive grid
- [ ] Each album page lists all photos in a grid; lightbox works
- [ ] All images have alt text; no console errors; Lighthouse SEO ≥ 95
- [ ] Sitemap.xml includes new URLs
- [ ] Schema.org ImageGallery validates in Rich Results test
- [ ] `wedeepen.com` homepage "See More Photos" link points to new gallery
- [ ] No PII / attendee-name leaks (alt text generic by default)
- [ ] Pipeline scripts documented in `scripts/gallery/README.md` for future event additions
- [ ] Page weight: <500KB initial load on album page (lazy-loaded thumbs after)

---

# /autoplan REVIEW (CEO + Design + Eng)

Run on 2026-05-05. Codex CLI not installed → outside-voice via Codex skipped. Mode: SELECTIVE EXPANSION.

## Phase 1: CEO Review

### 0A. Premise Challenge
| # | Premise | Verdict |
|---|---|---|
| 1 | Self-host beats FB embed | ✓ Defensible — own the experience, no FB iframe ugliness |
| 2 | Photos public | ✓ Confirmed by user |
| 3 | SEO is the prize | **⚠ Partially right** — gallery silo pages rank for image searches but don't convert. SEO juice is highest when photos are *embedded in event pages* that already exist (`/wedeepen/love-immersion/`, `/wedeepen/events/`). |
| 4 | Static HTML for SEO | ✓ Right. JS-rendered = slower indexing |
| 5 | Supabase Storage | ✓ Existing infra |
| 6 | YouTube for video | ✓ Standard |

**Strategic finding (premise #3):** A standalone `/wedeepen/gallery/` silo is fine but not the highest-leverage move. Event pages drive conversion. Photos belong on those pages too.

### 0B. Existing Code Leverage

| Sub-problem | Existing code | Plan's choice |
|---|---|---|
| Image upload + DB row | `shared/media-service.js` `mediaService.uploadMedia()` | ✓ Reuses |
| Lightbox | `openLightbox()` per CLAUDE.md | ✓ Reuses |
| Tailwind tokens | `@theme` block (aap-amber, aap-cream, aap-charcoal, DM Sans, DM Serif Display) | ⚠ Plan doesn't explicitly call these out |
| SEO patterns + ImageGallery schema | `/gallery/index.html` (christinalweber.com gallery already has full schema.org JSON-LD) | ⚠ Plan doesn't reference — should copy patterns |
| Existing photo grid | `wedeepen/index.html:686-718` (8 hardcoded images) | ⚠ Plan keeps as-is; could become a "highlights" carousel pulling from real albums |

### 0C. Dream State

```
CURRENT                       THIS PLAN                      12-MONTH IDEAL
─────────────────             ─────────────────              ─────────────────
"See more on FB" link    →    /wedeepen/gallery/        →    Gallery + every event
Curated 8-photo grid          17 albums w/ static HTML       page auto-pulls its album.
on homepage                   Lightbox, video embeds         Homepage grid rotates from
No own photo store            Sitemap + schema markup        real albums. SEO compounds.
                                                             Photos drive event signups.
```

### 0C-bis. Implementation Alternatives

**APPROACH A — Standalone gallery silo (current plan)**
- Build `/wedeepen/gallery/` + per-album pages. Photos live there. Done.
- Effort: M (~4-6h CC) | Risk: Low
- Pros: Clean architecture, easy to maintain, full SEO on gallery URLs
- Cons: Disconnected from `/wedeepen/love-immersion/`, `/wedeepen/events/`. Users browsing event pages still see the curated 8-photo grid (or nothing). Two photo-discovery paths.

**APPROACH B — Photos as a system, surfaced everywhere**
- Same DB/storage backend
- Album pages exist (gallery)
- **Plus**: Event pages auto-pull from same album by slug (e.g., `/wedeepen/love-immersion/` shows Love Immersion VI photos inline). Homepage 8-photo grid pulls from a "highlights" tag on real album media.
- Effort: M-L (~6-8h CC) | Risk: Low (same infra)
- Pros: SEO juice flows to conversion pages. No duplication. Curate-once, surface-everywhere.
- Cons: Slightly more complex. Need event-slug ↔ album-slug mapping.

**APPROACH C — FB embed + photo highlight reel only**
- Pull 12 best photos per event onto event pages, link "see all on FB"
- No standalone gallery
- Effort: S (~2h) | Risk: Low
- Pros: Minimal scope
- Cons: Doesn't deliver "we own our photos." FB dependency continues.

**RECOMMENDATION**: Approach B. Marginal CC cost is small; SEO value lands where it converts. *This is a TASTE DECISION* — surfaced at gate.

### 0D. Selective Expansion candidates (cherry-pick at gate)

| # | Expansion | Effort (CC) | Value | Auto-decision |
|---|---|---|---|---|
| 1 | Event-page auto-pulls album (Approach B delta) | 1-2h | High (SEO + conversion) | **Add (P2 boil lake — same blast radius)** |
| 2 | Homepage 8-photo grid pulls from "highlights" tag | 30 min | Medium | **Defer to TODOS** (P5 explicit — separate decision) |
| 3 | Per-album OG share preview test | 15 min | Medium | **Add (P1 completeness — cheap)** |
| 4 | Album RSS feed | 30 min | Low | **Skip** |
| 5 | Album search UI | 1h | Low (17 albums) | **Skip** |
| 6 | Photo download button per image | 15 min | Low (privacy concern) | **Skip** |
| 7 | "Embed gallery widget" for partner sites | 2h | Future | **TODOS** |

### 0E. Temporal interrogation
- Hour 1: Schema migration + script scaffolding + Aboutly POC
- Hour 2-3: Bulk pipeline run (gdown + sharp + upload all 17 albums)
- Hour 4: Static HTML build script + sitemap + replace FB link
- Hour 5: QA + Lighthouse + OG card test + push
- Hour 6+ (if Approach B): Event page integration

### 0F. Mode: **SELECTIVE EXPANSION** ✓

## Phase 2: Design Review (7 passes)

| Pass | Initial | After fixes (proposed) | Gap |
|---|---|---|---|
| 1. Information Architecture | 7/10 | 9/10 | Hero copy for `/wedeepen/gallery/` is placeholder ("Photo Gallery + tagline") — needs Christina's voice |
| 2. Interaction State Coverage | 5/10 | 9/10 | Loading/empty/error states not specified |
| 3. User Journey & Emotional Arc | 5/10 | 8/10 | No CTA at end of album page — user closes tab. Should funnel to events/Love Club. Per memory: visitors should feel "inspired, curious, open, receptive, invited" |
| 4. AI Slop Risk | 6/10 | 9/10 | Plan generic ("responsive 1/2/3/4 cols"). Needs WeDeepen-specific design — wave logo divider? gold accent? DM Serif headers? |
| 5. Design System Alignment | 7/10 | 9/10 | Doesn't explicitly call out `aap-*` tokens or `@theme` block per CLAUDE.md |
| 6. Responsive & Accessibility | 5/10 | 9/10 | A11y: keyboard nav for grid + lightbox, focus indicators, screen reader, 44px touch targets — none specified |
| 7. Unresolved Design Decisions | 6 open | 0-2 open | See list below |

### Interaction State Table (to add to plan)

| Element | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Album grid (`/gallery/`) | Skeleton cards (8 placeholders) | "More events coming soon" + link to upcoming | Page renders empty + console log | Real cards |
| Album page grid | Skeleton tiles | (won't happen — script enforces ≥1 photo to publish) | If image 404s: `<img onerror>` swap to placeholder | Real thumbs |
| Lightbox | Inline spinner overlay during full-image fetch | n/a | If full fails: stay on thumb + show "couldn't load full size" toast | Full image |
| Video embed | YouTube's own loader | n/a | YouTube's own error | YouTube's own player |

### Unresolved design decisions (Pass 7)

| # | Decision | Default if deferred |
|---|---|---|
| D1 | Hero copy for `/wedeepen/gallery/` | "Photo Gallery" + generic tagline. Christina's voice should write it. |
| D2 | CTA at end of album page | None — user closes tab. **Recommend:** "Want to be in the next one?" → events page |
| D3 | Album sort order | event_date DESC (newest first) by default; Christina can override per-album |
| D4 | Album cover image | First photo by default; override via `cover_media_id` in DB |
| D5 | Hero treatment per album page | Full-bleed cover image with title overlay, or simple title + grid? |
| D6 | Pagination at threshold | None — render all (Eng review flags this) |

## Phase 3: Eng Review

### Architecture (Section 1)

| # | Issue | Severity | Confidence | Auto-decision |
|---|---|---|---|---|
| E1 | `cover_media_id` references `media(id)` but no constraint that it's also in `gallery_album_media` junction. Cover could be orphaned. | P2 | 8/10 | **Add CHECK constraint via trigger or set `cover_media_id` only after junction insert** |
| E2 | Build script needs Supabase credentials. Plan doesn't specify which key (anon vs service role). | P2 | 9/10 | **Use anon key** (data is public-readable; service role risks key leakage in scripts dir). Document in scripts/gallery/README.md |
| E3 | Python `gdown` introduces new runtime. `package.json` has no Python tooling. Need to document virtualenv setup or use `pipx`. | P3 | 9/10 | **Use `pipx run gdown` in script** to avoid global install. Document in README. |
| E4 | Build script runs locally. CI doesn't regenerate. If Christina adds a photo via direct DB insert, HTML is stale until next local build. | P3 | 9/10 | **Acceptable** — gallery updates are infrequent (monthly events). Document workflow. Future: GitHub Action to rebuild on DB webhook. (TODO) |

### Code Quality (Section 2)

| # | Issue | Severity | Confidence | Auto-decision |
|---|---|---|---|---|
| E5 | HTML generation via JS template literals. Album titles/descriptions could contain `<`, `>`, `&` — needs HTML escape function. XSS via DB content is the classic landmine. | P1 | 10/10 | **Add `escapeHtml()` helper, apply to all interpolated strings.** Required, not optional. |
| E6 | `albums.json` checked into git duplicates info that could live in DB. Two sources of truth. | P3 | 7/10 | **Accept** for v1 — JSON is human-edited config, DB is generated. Clear separation. Re-evaluate if it drifts. |
| E7 | No input validation on `albums.json` — typo in `drive_folder_id` silently does nothing. | P2 | 8/10 | **Validate on script start: each album entry has slug, title, drive_folder_id; fail fast with clear error.** |

### Test Review (Section 3)

The plan currently has **zero** test plan. For a static site with one-off scripts, full unit test infra is overkill, but **smoke testing must exist** before production.

```
CODE PATH COVERAGE
===================
[+] scripts/gallery/process-and-upload.js
    │
    ├── resize-and-format()
    │   ├── [GAP] Happy path (1600px WebP output) — needs unit test
    │   ├── [GAP] Already-small image (don't upscale) — NO TEST
    │   └── [GAP] Corrupt JPEG — NO TEST (sharp throws — what's the recovery?)
    │
    ├── upload-to-supabase()
    │   ├── [GAP] Happy path — NO TEST
    │   ├── [GAP] Network failure mid-batch — NO TEST (does script resume?)
    │   └── [GAP] Bucket permission denied — NO TEST
    │
    └── insert-db-rows()
        ├── [GAP] Idempotency (re-run = skip) — NO TEST
        └── [GAP] Junction integrity (cover_media_id must be in junction) — NO TEST

USER FLOW COVERAGE
===================
[+] Visitor browses gallery
    ├── [GAP] /wedeepen/gallery/ loads, shows all albums — NO TEST
    ├── [GAP] Click album → album page loads — NO TEST
    ├── [GAP] [→E2E] Click thumb → lightbox opens with correct image — NO TEST
    └── [GAP] Mobile responsive — NO TEST

[+] Search engine indexing
    ├── [GAP] Lighthouse SEO ≥95 — NO TEST (acceptance criterion, no automation)
    ├── [GAP] schema.org ImageGallery validates — NO TEST
    └── [GAP] sitemap.xml includes new URLs — NO TEST

GAPS: 14 paths need tests
```

**Recommendation (auto-decided, P1 completeness):**
- Add **smoke-test script** `scripts/gallery/smoke-test.js`: HTTP-fetches each album URL, checks 200 + `<img>` count matches DB
- Add **manual QA checklist** to plan acceptance criteria (Lighthouse, OG render, schema validator)
- Add **HTML escape unit test** — only piece of real logic worth unit-testing
- **Skip** Playwright/Cypress for now (overkill for static gallery)

### Performance (Section 4)

| # | Issue | Severity | Confidence | Auto-decision |
|---|---|---|---|---|
| E8 | 300-photo album = 300 `<img loading="lazy">` thumbs. ~15MB on full scroll. **Plan says "fine" — it's not** on mobile data. Even lazy, scrolling = paying. | P2 | 8/10 | **Add pagination/virtual scroll threshold at 100 photos.** Or load 50 with "Load more". *TASTE DECISION* — surface at gate. |
| E9 | LCP target 2.5s but no measurement plan. | P3 | 9/10 | **Add: Lighthouse run as acceptance gate.** |
| E10 | Static HTML page with 300 image tags + alt text = ~150KB HTML alone. | P3 | 7/10 | Accept — gzip will compress. Lazy-loading dominates payload. |

### Failure modes registry

| Failure | Test? | Error handled? | User sees? | Critical gap? |
|---|---|---|---|---|
| Drive download fails mid-album | No | Idempotency on rerun ✓ | Script log only | No |
| Supabase upload fails after resize | No | Skip DB row insert (transactional) | Script log | **Add explicit transaction**: only insert DB row if upload succeeds |
| Image processing OOM (40MB original) | No | sharp throws | Script aborts | Set `sharp({ limitInputPixels: 1e8 })` |
| Cover media not in junction | No | None | Build fails late | E1 above — add constraint |
| Photo release | Signed at event registration | All attendees consented | Public photos OK | **Resolved** — consent handled at event registration, not at publish time |

### Worktree parallelization
Sequential. All steps touch same scripts/ tree. No parallelization opportunity.

## Cross-phase themes

| Theme | Where | Resolution |
|---|---|---|
| **Plan undersells design intent** | CEO premise #3 + Design Pass 3 + Pass 4 | Without intentional emotional design + CTAs, gallery is a silo. Approach B (taste decision) addresses this. |
| **Test rigor underspec'd** | Eng Section 3 | Smoke test + HTML escape unit test + manual QA checklist added |
| **Privacy/PII workflow missing** | Eng Failure modes | Contact-sheet review pass added |

## NOT in scope

- Cross-project learnings enable (deferred)
- Album RSS feed
- Album search UI
- Photo download button
- Embed gallery widget for partner sites
- CMS for album metadata (use checked-in JSON for v1)
- Auto-rebuild via webhook on DB change (manual local rebuild for v1)
- Playwright/Cypress E2E (smoke test sufficient for v1)

## Decision Audit Trail

| # | Phase | Decision | Type | Principle | Rationale |
|---|---|---|---|---|---|
| 1 | CEO 0D | Add event-page integration (Approach B) | TASTE → user gate | P2 boil lake | Marginal CC cost, SEO + conversion value |
| 2 | CEO 0D | Add OG render test pass | Auto | P1 completeness | 15min, prevents broken FB/Twitter shares |
| 3 | CEO 0D | Defer homepage highlights pull | Auto | P5 explicit | Separate decision; not blocking |
| 4 | CEO 0D | Skip RSS, search, downloads, widget | Auto | P3 pragmatic | Low value for v1 |
| 5 | Design D2 | Add CTA at end of album pages | Auto | P1 completeness | Conversion + journey arc |
| 6 | Design Pass 2 | Add interaction state table to plan | Auto | P1 completeness | Cheap, prevents engineer guesses |
| 7 | Design Pass 6 | Add explicit a11y spec | Auto | P1 completeness | Required for "go hard on SEO" (Lighthouse a11y) |
| 8 | Eng E1 | Cover media constraint via insert order | Auto | P5 explicit | Trigger overkill; insert order is enforceable |
| 9 | Eng E2 | Use anon key in build script | Auto | P3 pragmatic | Public data, lower blast radius if leaked |
| 10 | Eng E3 | Use `pipx run gdown` | Auto | P3 pragmatic | No global Python pollution |
| 11 | Eng E5 | Add HTML escape helper | Auto | P1 completeness | XSS landmine, non-negotiable |
| 12 | Eng E7 | Validate albums.json on script start | Auto | P5 explicit | Fail fast |
| 13 | Eng E8 | Pagination at 100 photos | TASTE → user gate | P1 vs P3 tension | Mobile UX vs simpler v1 |
| 14 | Eng tests | Add smoke test + HTML escape unit test | Auto | P1 completeness | Minimal viable test coverage |
| 15 | Eng failure modes | ~~Add contact-sheet PII review step~~ — REMOVED | User correction 2026-05-05 | Photo release signed at event registration; no per-photo review needed |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_open | mode: SELECTIVE_EXPANSION, 7 expansion candidates (3 accepted, 4 deferred/skipped), 1 strategic taste decision |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | unavailable | Codex CLI not installed |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 10 issues, 1 critical gap (PII workflow), test plan added |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open | 7 passes scored 5-7 → proposed 8-9 with fixes; 6 unresolved decisions, 2 surface to user |

**UNRESOLVED:** 2 taste decisions surface to final approval gate.

**VERDICT:** AUTOPLAN COMPLETE — 2 taste decisions for user, 13 auto-decisions logged. Awaiting approval to integrate fixes into plan.
