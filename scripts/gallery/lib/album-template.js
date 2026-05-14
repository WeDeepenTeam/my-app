import { escapeHtml } from './escape-html.js';
import { pageHead, pageNav, pageFooter, pageScripts } from './page-shell.js';

const SITE = 'https://wedeepen.com';
const PAGE_SIZE = 100;

export function renderAlbumPage(album, photos) {
  const cover = album.cover_full_url || photos[0]?.full_url || `${SITE}/wedeepen/images/og-image.jpg`;
  const description = album.description
    || `Photos from ${album.title}${album.event_date ? ' on ' + formatDate(album.event_date) : ''}.`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: album.title,
    description,
    url: `${SITE}/wedeepen/gallery/${album.slug}/`,
    image: photos.slice(0, 30).map(p => ({
      '@type': 'ImageObject',
      contentUrl: p.full_url,
      thumbnailUrl: p.thumb_url,
      width: p.width,
      height: p.height,
      caption: p.alt_text,
    })),
    publisher: {
      '@type': 'Organization',
      name: 'WeDeepen',
      url: SITE,
    },
    ...(album.event_date ? { dateCreated: album.event_date } : {}),
    ...(album.location ? { contentLocation: { '@type': 'Place', name: album.location } } : {}),
  });

  const initialPhotos = photos.slice(0, PAGE_SIZE);
  const remainingPhotos = photos.slice(PAGE_SIZE);

  return `${pageHead({
    title: `${album.title} — Photos | WeDeepen`,
    description,
    canonical: `${SITE}/wedeepen/gallery/${album.slug}/`,
    ogImage: cover,
    jsonLd,
  })}
<body class="bg-ink text-white">
${pageNav()}

  <main id="main">
    <!-- Hero -->
    <section class="relative pt-32 md:pt-40 pb-12 md:pb-16 px-6">
      <div class="max-w-site mx-auto reveal">
        <a href="/wedeepen/gallery/" class="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-8 transition">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          All galleries
        </a>
        <p class="text-[11px] md:text-xs uppercase tracking-[0.35em] text-white/50 font-medium mb-4">WeDeepen &middot; Gallery</p>
        <h1 class="font-heading text-[2.2rem] md:text-[3rem] lg:text-[3.6rem] font-normal leading-[1.15] mb-5 max-w-4xl">
          ${escapeHtml(album.title)}
        </h1>
        <div class="flex flex-wrap items-center gap-3 text-white/55 text-sm mb-6">
          ${album.location ? `<span>${escapeHtml(album.location)}</span><span class="w-1 h-1 rounded-full bg-white/30"></span>` : ''}
          <span>${photos.length} photo${photos.length === 1 ? '' : 's'}</span>
          ${album.photographer ? `<span class="w-1 h-1 rounded-full bg-white/30"></span><span>Photos by ${escapeHtml(album.photographer)}</span>` : ''}
        </div>
        ${album.description ? `<p class="text-white/70 text-base md:text-lg leading-relaxed font-light max-w-3xl">${escapeHtml(album.description)}</p>` : ''}
      </div>
    </section>

    ${album.youtube_ids?.length ? renderVideos(album.youtube_ids) : ''}

    <!-- Photo grid -->
    <section class="px-4 md:px-6 pb-12">
      <div class="max-w-site mx-auto">
        <div id="photo-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
          ${initialPhotos.map((p, i) => renderTile(p, i)).join('\n          ')}
        </div>
        ${remainingPhotos.length ? `
        <div id="more-container" class="text-center mt-10">
          <button id="load-more" class="btn-outline" data-remaining="${remainingPhotos.length}">
            Load more &mdash; <span id="remaining-count">${remainingPhotos.length}</span> more
          </button>
        </div>
        <template id="more-photos">${remainingPhotos.map((p, i) => renderTile(p, PAGE_SIZE + i)).join('')}</template>
        ` : ''}
      </div>
    </section>

    <!-- Lightbox -->
    <div id="lightbox" class="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer">
      <button class="lightbox-btn lightbox-close" aria-label="Close">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <button class="lightbox-btn lightbox-prev" aria-label="Previous photo">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <button class="lightbox-btn lightbox-next" aria-label="Next photo">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <img class="lightbox-img" alt="" id="lightbox-img">
      <div class="lightbox-counter" id="lightbox-counter"></div>
    </div>

    <!-- Bottom CTA -->
    <section class="bg-cream text-charcoal py-20 md:py-24 px-6 mt-12">
      <div class="max-w-3xl mx-auto text-center reveal">
        <h2 class="font-heading text-3xl md:text-4xl font-normal mb-5">Want to be at the next one?</h2>
        <p class="text-charcoal/70 text-lg leading-relaxed mb-8 font-light">
          ${escapeHtml(album.title)} happened. The next gathering is forming.
        </p>
        <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href="/wedeepen/events/" class="btn-rose">View Upcoming Events &rarr;</a>
          <a href="/wedeepen/gallery/" class="text-charcoal/70 hover:text-charcoal transition font-medium">All Galleries &rarr;</a>
        </div>
      </div>
    </section>
  </main>

${pageFooter()}
${pageScripts()}

<script>
  // Lightbox + Load more
  (function() {
    const grid = document.getElementById('photo-grid');
    const lightbox = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightbox-img');
    const lbCounter = document.getElementById('lightbox-counter');
    const closeBtn = lightbox.querySelector('.lightbox-close');
    const prevBtn = lightbox.querySelector('.lightbox-prev');
    const nextBtn = lightbox.querySelector('.lightbox-next');
    let currentIndex = 0;

    function tiles() { return Array.from(grid.querySelectorAll('.photo-tile')); }

    function open(index) {
      const all = tiles();
      currentIndex = Math.max(0, Math.min(index, all.length - 1));
      const t = all[currentIndex];
      lbImg.src = t.dataset.full;
      lbImg.alt = t.dataset.alt || '';
      lbCounter.textContent = (currentIndex + 1) + ' / ' + all.length;
      lightbox.classList.add('open');
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
    }
    function close() {
      lightbox.classList.remove('open');
      lbImg.src = '';
      document.body.style.overflow = '';
    }
    function next() { open(currentIndex + 1 < tiles().length ? currentIndex + 1 : 0); }
    function prev() { open(currentIndex - 1 >= 0 ? currentIndex - 1 : tiles().length - 1); }

    grid.addEventListener('click', (e) => {
      const tile = e.target.closest('.photo-tile');
      if (!tile) return;
      e.preventDefault();
      const all = tiles();
      open(all.indexOf(tile));
    });
    grid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const tile = e.target.closest('.photo-tile');
        if (!tile) return;
        e.preventDefault();
        const all = tiles();
        open(all.indexOf(tile));
      }
    });
    closeBtn.addEventListener('click', close);
    nextBtn.addEventListener('click', next);
    prevBtn.addEventListener('click', prev);
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });
    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    });

    // Load more
    const loadMore = document.getElementById('load-more');
    if (loadMore) {
      loadMore.addEventListener('click', () => {
        const tpl = document.getElementById('more-photos');
        if (tpl) {
          grid.insertAdjacentHTML('beforeend', tpl.innerHTML);
          tpl.remove();
        }
        document.getElementById('more-container').remove();
      });
    }
  })();
</script>
</body>
</html>`;
}

function renderTile(p, i) {
  return `<a href="${escapeHtml(p.full_url)}" class="photo-tile block aspect-square overflow-hidden rounded-md bg-charcoal/40" data-full="${escapeHtml(p.full_url)}" data-alt="${escapeHtml(p.alt_text)}" aria-label="${escapeHtml(p.alt_text)} (open photo ${i + 1})">
            <img src="${escapeHtml(p.thumb_url)}" alt="${escapeHtml(p.alt_text)}" class="w-full h-full object-cover" loading="lazy" width="400" height="400">
          </a>`;
}

function renderVideos(youtubeIds) {
  return `<section class="px-6 pb-10">
      <div class="max-w-site mx-auto">
        <h2 class="font-heading text-2xl md:text-3xl text-white mb-6">Watch</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          ${youtubeIds.map(id => `<div class="aspect-video rounded-lg overflow-hidden bg-black">
            <iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(id)}" title="WeDeepen video" loading="lazy" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full h-full"></iframe>
          </div>`).join('\n          ')}
        </div>
      </div>
    </section>`;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
