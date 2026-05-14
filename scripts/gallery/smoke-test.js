#!/usr/bin/env node
/**
 * smoke-test.js — verifies generated gallery HTML is sound before push.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabase } from './lib/supabase-admin.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..');
const GALLERY_DIR = path.join(ROOT, 'wedeepen', 'gallery');

let passed = 0;
let failed = 0;
const failures = [];

function check(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; failures.push(`${label}: ${detail || 'failed'}`); console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  const indexPath = path.join(GALLERY_DIR, 'index.html');
  let indexHtml;
  try { indexHtml = await fs.readFile(indexPath, 'utf-8'); }
  catch { console.error(`Index not found at ${indexPath}. Run build-static-pages.js first.`); process.exit(2); }

  console.log('Gallery index page');
  check('index.html exists', !!indexHtml, indexPath);
  check('has <title> with Photo Galler', /<title>[^<]*Photo Galler/i.test(indexHtml));
  check('has canonical', /rel="canonical"\s+href="https:\/\/wedeepen\.com\/wedeepen\/gallery\/"/.test(indexHtml));
  check('has og:image', /og:image"\s+content="[^"]+"/.test(indexHtml));
  check('has CollectionPage JSON-LD', /"@type":\s*"CollectionPage"/.test(indexHtml));

  const { data: albums, error } = await supabase
    .from('gallery_albums')
    .select('id, slug, title')
    .eq('is_published', true)
    .eq('is_archived', false);
  if (error) throw error;

  console.log(`\nAlbum pages (${albums.length} albums)`);
  for (const album of albums) {
    const albumPath = path.join(GALLERY_DIR, album.slug, 'index.html');
    let html;
    try { html = await fs.readFile(albumPath, 'utf-8'); }
    catch { check(`${album.slug}: index.html exists`, false, albumPath); continue; }

    check(`${album.slug}: title contains album name`, html.includes(album.title));
    check(`${album.slug}: canonical URL`, html.includes(`https://wedeepen.com/wedeepen/gallery/${album.slug}/`));
    check(`${album.slug}: ImageGallery JSON-LD`, /"@type":\s*"ImageGallery"/.test(html));
    check(`${album.slug}: lightbox markup`, html.includes('id="lightbox"'));

    const imgCount = (html.match(/<img\s/g) || []).length;
    const { count: dbCount } = await supabase
      .from('gallery_media')
      .select('id', { count: 'exact', head: true })
      .eq('album_id', album.id);
    check(`${album.slug}: img count >= photo count (${imgCount} >= ${dbCount})`, imgCount >= dbCount);
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
