#!/usr/bin/env node
/**
 * process-and-upload.js — resize + upload one album's photos to Supabase.
 *
 * Walks ./tmp/gallery-source/<slug>/ recursively, picks up image files,
 * resizes to:
 *   full:  max 1600px long edge, WebP q=85
 *   thumb: max 400px long edge,  WebP q=80
 * uploads both to Supabase Storage bucket `gallery/<slug>/{full,thumb}/<hash>.webp`,
 * inserts gallery_albums + gallery_media rows.
 *
 * Idempotent: re-running with same source files skips already-uploaded items
 * by checking gallery_media.content_hash matching the deterministic source hash.
 *
 * Usage:
 *   node scripts/gallery/process-and-upload.js --album aboutly-training
 *   node scripts/gallery/process-and-upload.js --album all
 *   node scripts/gallery/process-and-upload.js --album <slug> --dry-run
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { supabase, STORAGE_BUCKET, SUPABASE_URL } from './lib/supabase-admin.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..');
const ALBUMS_JSON = path.join(ROOT, 'scripts', 'gallery', 'albums.json');
const SOURCE_DIR = path.join(ROOT, 'tmp', 'gallery-source');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);
const PARALLELISM = 4;

sharp.cache(false);
sharp.concurrency(PARALLELISM);

function parseArgs() {
  const args = { album: null, dryRun: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--album') args.album = process.argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
  }
  if (!args.album) {
    console.error('Usage: --album <slug|all> [--dry-run]');
    process.exit(2);
  }
  return args;
}

async function loadAlbums() {
  const raw = await fs.readFile(ALBUMS_JSON, 'utf-8');
  return JSON.parse(raw).albums;
}

async function walkImages(dir) {
  const out = [];
  async function recurse(d) {
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await recurse(full);
      else if (e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase())) {
        out.push(full);
      }
    }
  }
  await recurse(dir);
  out.sort();
  return out;
}

async function fileBytesHash(sourcePath) {
  const buf = await fs.readFile(sourcePath);
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
}

async function ensureAlbum(meta) {
  const { data: existing, error: selErr } = await supabase
    .from('gallery_albums')
    .select('id, slug')
    .eq('slug', meta.slug)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) {
    const { error: updErr } = await supabase
      .from('gallery_albums')
      .update({
        title: meta.title,
        description: meta.description,
        event_date: meta.event_date,
        location: meta.location,
        youtube_ids: meta.youtube_ids ?? [],
        event_page_slug: meta.event_page_slug,
        display_order: meta.display_order ?? 0,
      })
      .eq('id', existing.id);
    if (updErr) throw updErr;
    return existing.id;
  }
  const { data, error } = await supabase
    .from('gallery_albums')
    .insert({
      slug: meta.slug,
      title: meta.title,
      description: meta.description,
      event_date: meta.event_date,
      location: meta.location,
      youtube_ids: meta.youtube_ids ?? [],
      event_page_slug: meta.event_page_slug,
      display_order: meta.display_order ?? 0,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function findExistingMedia(albumId, contentHash) {
  const { data, error } = await supabase
    .from('gallery_media')
    .select('id, full_url, thumb_url, width, height')
    .eq('album_id', albumId)
    .eq('content_hash', contentHash)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function uploadBuffer(storagePath, buffer, contentType) {
  const { error } = await supabase
    .storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
      cacheControl: '31536000',
    });
  if (error) throw error;
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
}

async function processOne(albumId, slug, sourcePath, indexInAlbum, album, dryRun) {
  const hash = await fileBytesHash(sourcePath);
  const fullPath = `${slug}/full/${hash}.webp`;
  const thumbPath = `${slug}/thumb/${hash}.webp`;

  // Idempotency
  const existing = await findExistingMedia(albumId, hash);
  if (existing) {
    return { mediaId: existing.id, skipped: true };
  }

  if (dryRun) {
    return { mediaId: null, skipped: false, dryRun: true };
  }

  const input = sharp(sourcePath, { limitInputPixels: 268402689 }).rotate();

  const fullBuf = await input
    .clone()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });

  const thumbBuf = await input
    .clone()
    .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  const fullUrl = await uploadBuffer(fullPath, fullBuf.data, 'image/webp');
  const thumbUrl = await uploadBuffer(thumbPath, thumbBuf.data, 'image/webp');

  const altText = `${album.title} — photo ${indexInAlbum + 1}`;
  const { data: media, error: mErr } = await supabase
    .from('gallery_media')
    .insert({
      album_id: albumId,
      storage_path: fullPath,
      full_url: fullUrl,
      thumb_url: thumbUrl,
      width: fullBuf.info.width,
      height: fullBuf.info.height,
      alt_text: altText,
      display_order: indexInAlbum,
      source_filename: path.basename(sourcePath),
      content_hash: hash,
    })
    .select('id')
    .single();
  if (mErr) throw mErr;

  return { mediaId: media.id, skipped: false };
}

async function setCoverIfMissing(albumId, mediaId) {
  const { data, error } = await supabase
    .from('gallery_albums')
    .select('cover_media_id')
    .eq('id', albumId)
    .single();
  if (error) throw error;
  if (data.cover_media_id) return;
  const { error: updErr } = await supabase
    .from('gallery_albums')
    .update({ cover_media_id: mediaId })
    .eq('id', albumId);
  if (updErr) throw updErr;
}

async function processAlbum(album, dryRun) {
  if (!album.drive_folder_id) {
    console.log(`  ⊘ ${album.slug}: no drive_folder_id; skip`);
    return { skipped: true };
  }
  const dir = path.join(SOURCE_DIR, album.slug);
  const images = await walkImages(dir);
  if (images.length === 0) {
    console.log(`  ⊘ ${album.slug}: no images found at ${dir}; run download-drive.py first`);
    return { skipped: true };
  }
  console.log(`  → ${album.slug}: ${images.length} images`);

  const albumId = dryRun ? null : await ensureAlbum(album);
  let firstMediaId = null;
  let processed = 0;
  let skippedCount = 0;
  let failed = 0;

  for (let i = 0; i < images.length; i += PARALLELISM) {
    const chunk = images.slice(i, i + PARALLELISM);
    const results = await Promise.allSettled(
      chunk.map((src, j) => processOne(albumId, album.slug, src, i + j, album, dryRun))
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const src = chunk[j];
      if (r.status === 'rejected') {
        failed++;
        console.error(`    ✗ ${path.basename(src)}: ${r.reason?.message || r.reason}`);
        continue;
      }
      const { mediaId, skipped } = r.value;
      if (skipped) skippedCount++;
      processed++;
      if (mediaId && !firstMediaId) firstMediaId = mediaId;
    }
    if ((i + PARALLELISM) % 40 < PARALLELISM) {
      console.log(`    ... ${processed}/${images.length} (${skippedCount} cached)`);
    }
  }

  if (!dryRun && firstMediaId) {
    await setCoverIfMissing(albumId, firstMediaId);
  }

  console.log(`  ✓ ${album.slug}: ${processed} processed (${skippedCount} cached, ${failed} failed)`);
  return { processed, skipped: skippedCount, failed };
}

async function main() {
  const args = parseArgs();
  const albums = await loadAlbums();
  const targets = args.album === 'all' ? albums : albums.filter(a => a.slug === args.album);
  if (targets.length === 0) {
    console.error(`No album matching '${args.album}'`);
    process.exit(2);
  }
  console.log(`Processing ${targets.length} album(s)${args.dryRun ? ' [DRY RUN]' : ''}`);
  let totalFailed = 0;
  for (const album of targets) {
    try {
      const res = await processAlbum(album, args.dryRun);
      totalFailed += res.failed || 0;
    } catch (e) {
      console.error(`  ✗ ${album.slug}: aborted — ${e.message}`);
      totalFailed++;
    }
  }
  console.log();
  console.log(totalFailed > 0 ? `Done with ${totalFailed} errors.` : 'Done.');
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
