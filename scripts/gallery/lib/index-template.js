import { escapeHtml } from './escape-html.js';
import { pageHead, pageNav, pageFooter, pageScripts } from './page-shell.js';

const SITE = 'https://wedeepen.com';

export function renderGalleryIndex(albums) {
  const ogImage = albums.find(a => a.cover_thumb_url || a.cover_full_url)?.cover_full_url
    || `${SITE}/wedeepen/images/og-image.jpg`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'WeDeepen Photo Galleries',
    description: 'Photos from WeDeepen events including Love Immersion, Biohacking Love, MediDating, The Dating Dojo, Midnights with Mary, and more.',
    url: `${SITE}/wedeepen/gallery/`,
    publisher: {
      '@type': 'Organization',
      name: 'WeDeepen',
      url: SITE,
    },
    hasPart: albums.map(a => ({
      '@type': 'ImageGallery',
      name: a.title,
      url: `${SITE}/wedeepen/gallery/${a.slug}/`,
      numberOfItems: a.photo_count,
    })),
  });

  return `${pageHead({
    title: 'Photo Galleries — WeDeepen',
    description: "Photos from WeDeepen events: Love Immersion, Biohacking Love, MediDating, The Dating Dojo, Midnights with Mary, and more. Every gathering, every practice, every moment we've held together.",
    canonical: `${SITE}/wedeepen/gallery/`,
    ogImage,
    jsonLd,
  })}
<body class="bg-ink text-white">
${pageNav()}

  <main id="main">
    <!-- Hero -->
    <section class="relative pt-32 md:pt-40 pb-16 md:pb-20 px-6">
      <div class="max-w-site mx-auto text-center reveal">
        <p class="text-[11px] md:text-xs uppercase tracking-[0.35em] text-white/50 font-medium mb-6">WeDeepen</p>
        <h1 class="font-heading text-[2.4rem] md:text-[3.4rem] lg:text-[4rem] font-normal leading-[1.12] mb-6">
          <span class="text-white">Photo</span>
          <span class="italic" style="color: #C4577A;">Albums</span>
        </h1>
        <p class="text-[15px] md:text-lg text-white/70 max-w-2xl mx-auto leading-relaxed font-light">
          Love Immersion, Biohacking Love, Dating Dojo, and more.
        </p>
      </div>
    </section>

    <!-- Album grid -->
    <section class="px-6 pb-24">
      <div class="max-w-site mx-auto">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          ${albums.map(a => renderAlbumCard(a)).join('\n          ')}
        </div>
      </div>
    </section>

    <!-- Bottom CTA -->
    <section class="bg-cream text-charcoal py-20 md:py-24 px-6">
      <div class="max-w-3xl mx-auto text-center reveal">
        <h2 class="font-heading text-3xl md:text-4xl font-normal mb-5">Want to be at the next one?</h2>
        <p class="text-charcoal/70 text-lg leading-relaxed mb-8 font-light">
          Our events fill fast. Browse what's coming up and find your next gathering.
        </p>
        <a href="/wedeepen/events/" class="btn-rose">View Upcoming Events &rarr;</a>
      </div>
    </section>
  </main>

${pageFooter()}
${pageScripts()}
</body>
</html>`;
}

function renderAlbumCard(album) {
  const cover = album.cover_thumb_url || album.cover_full_url || '/wedeepen/images/gallery/welcome.jpg';
  const count = album.photo_count;
  return `<a href="/wedeepen/gallery/${escapeHtml(album.slug)}/" class="album-card block bg-charcoal/40 rounded-xl overflow-hidden border border-white/5 hover:border-gold/30 transition">
            <div class="aspect-[4/3] overflow-hidden bg-ink">
              <img src="${escapeHtml(cover)}" alt="${escapeHtml(album.title)}" class="album-cover w-full h-full object-cover" loading="lazy" width="800" height="600">
            </div>
            <div class="p-5 md:p-6">
              <h2 class="font-heading text-xl md:text-2xl text-white mb-1 leading-tight">${escapeHtml(album.title)}</h2>
              <div class="flex items-center gap-3 text-white/50 text-sm">
                <span>${count} photo${count === 1 ? '' : 's'}</span>
              </div>
            </div>
          </a>`;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}
