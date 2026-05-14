#!/usr/bin/env node
/**
 * build-static-pages.js — reads gallery_albums + gallery_media from Supabase,
 * writes /wedeepen/gallery/index.html and /wedeepen/gallery/<slug>/index.html.
 * Updates sitemap.xml to include new URLs.
 *
 * Idempotent: rewrites all gallery HTML on every run.
 *
 * Usage:
 *   node build-static-pages.js
 *   node build-static-pages.js --album <slug>   # single album
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabase } from './lib/supabase-admin.js';
import { renderGalleryIndex } from './lib/index-template.js';
import { renderAlbumPage } from './lib/album-template.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..');
// Where to write generated HTML. Default = cwdapp wedeepen/ (legacy);
// override with GALLERY_OUT_DIR env to deploy to wedeepen-site repo.
const GALLERY_DIR = process.env.GALLERY_OUT_DIR || path.join(ROOT, 'wedeepen', 'gallery');
const SITEMAP_PATH = process.env.SITEMAP_OUT_PATH || path.join(ROOT, 'sitemap.xml');
const ALBUMS_JSON = path.join(ROOT, 'scripts', 'gallery', 'albums.json');
// If building for wedeepen-site, paths shouldn't have /wedeepen/ prefix.
const URL_PREFIX = process.env.GALLERY_URL_PREFIX || '/wedeepen/gallery';

async function loadPhotographers() {
  const raw = await fs.readFile(ALBUMS_JSON, 'utf-8');
  const data = JSON.parse(raw);
  const map = {};
  for (const a of data.albums) {
    if (a.photographer) map[a.slug] = a.photographer;
  }
  return map;
}

function parseArgs() {
  const args = { album: null };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--album') args.album = process.argv[++i];
  }
  return args;
}

async function fetchAlbums(slugFilter) {
  let query = supabase
    .from('gallery_albums')
    .select('*, cover:cover_media_id(id, full_url, thumb_url, alt_text, width, height)')
    .eq('is_published', true)
    .eq('is_archived', false)
    .order('display_order', { ascending: true })
    .order('event_date', { ascending: false, nullsFirst: false });
  if (slugFilter) query = query.eq('slug', slugFilter);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function fetchAlbumPhotos(albumId) {
  const { data, error } = await supabase
    .from('gallery_media')
    .select('id, full_url, thumb_url, alt_text, width, height, display_order')
    .eq('album_id', albumId)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return data;
}

async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }

async function writeFile(p, content) {
  await fs.writeFile(p, content, 'utf-8');
  console.log(`  ✓ ${path.relative(ROOT, p)}`);
}

async function buildAlbumPage(album, photographers) {
  const photos = await fetchAlbumPhotos(album.id);
  if (photos.length === 0) {
    console.log(`  ⊘ ${album.slug}: 0 photos; skipping page`);
    return null;
  }
  const albumWithCover = {
    ...album,
    cover_full_url: album.cover?.full_url || photos[0].full_url,
    cover_thumb_url: album.cover?.thumb_url || photos[0].thumb_url,
    photographer: photographers[album.slug] || null,
  };
  const dir = path.join(GALLERY_DIR, album.slug);
  await ensureDir(dir);
  const html = renderAlbumPage(albumWithCover, photos);
  await writeFile(path.join(dir, 'index.html'), html);
  return { ...albumWithCover, photo_count: photos.length };
}

async function buildIndexPage(albumSummaries) {
  if (albumSummaries.length === 0) {
    console.log('  ⊘ No published albums; skipping gallery index');
    return;
  }
  await ensureDir(GALLERY_DIR);
  const html = renderGalleryIndex(albumSummaries);
  await writeFile(path.join(GALLERY_DIR, 'index.html'), html);
}

async function updateSitemap(albumSlugs) {
  let sitemap;
  try { sitemap = await fs.readFile(SITEMAP_PATH, 'utf-8'); }
  catch { console.log('  ⊘ No sitemap.xml; skip'); return; }

  const sitemapBase = URL_PREFIX.startsWith('/gallery') ? '' : URL_PREFIX.replace(/\/gallery$/, '');
  const galleryEntries = [
    `<url><loc>https://wedeepen.com${URL_PREFIX}/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
    ...albumSlugs.map(slug =>
      `<url><loc>https://wedeepen.com${URL_PREFIX}/${slug}/</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`
    ),
  ].join('\n  ');

  const marker = '<!-- gallery:autogen -->';
  const endMarker = '<!-- /gallery:autogen -->';
  const startIdx = sitemap.indexOf(marker);
  if (startIdx !== -1) {
    const endIdx = sitemap.indexOf(endMarker, startIdx);
    if (endIdx !== -1) sitemap = sitemap.slice(0, startIdx) + sitemap.slice(endIdx + endMarker.length);
  }
  const block = `\n  ${marker}\n  ${galleryEntries}\n  ${endMarker}\n`;
  sitemap = sitemap.replace('</urlset>', `${block}</urlset>`);

  await writeFile(SITEMAP_PATH, sitemap);
}

async function main() {
  const args = parseArgs();
  console.log(`Building static gallery pages${args.album ? ` for ${args.album}` : ''}`);
  const albums = await fetchAlbums(args.album);
  if (albums.length === 0) { console.log('No albums found.'); return; }

  const photographers = await loadPhotographers();
  const summaries = [];
  for (const album of albums) {
    const summary = await buildAlbumPage(album, photographers);
    if (summary) summaries.push(summary);
  }

  if (!args.album) {
    await buildIndexPage(summaries);
    await updateSitemap(summaries.map(s => s.slug));
  }

  console.log();
  console.log(`Done. ${summaries.length} album page(s) written.`);
}

main().catch(e => { console.error(e); process.exit(1); });
