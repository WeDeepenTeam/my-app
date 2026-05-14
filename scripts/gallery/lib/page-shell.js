/**
 * Shared HTML shell for gallery pages — mirrors wedeepen.com's nav, footer, and styles.
 * Pulled from /wedeepen/index.html as of 2026-05-06. If the site nav changes, regenerate.
 */
import { escapeHtml } from './escape-html.js';

export function pageHead({ title, description, canonical, ogImage, jsonLd }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-BY3F2GQXR8"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-BY3F2GQXR8');
  </script>
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${escapeHtml(canonical)}">

  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:width" content="1600">
  <meta property="og:image:height" content="1067">
  <meta property="og:site_name" content="WeDeepen">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">

  ${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap" rel="stylesheet">

  <!-- Tailwind CDN (matches wedeepen.com pages) -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            rose:    { deep: '#A01B4A', light: '#C4577A' },
            pink:    { hot: '#E8337A', bright: '#FF4F8C' },
            teal:    { DEFAULT: '#C9A277', light: '#D4B78C', dark: '#A8855C' },
            gold:    { DEFAULT: '#C9A277', light: '#D4B78C', dark: '#A8855C' },
            charcoal: '#2D2D2D',
            cream:   '#F4EDE0',
            ink:     '#1A1A1A',
            black:   '#1A1A1A',
            softgray: '#F5F5F5',
          },
          fontFamily: {
            heading: ['"Playfair Display"', 'Georgia', 'serif'],
            body:    ['"DM Sans"', 'Inter', 'system-ui', 'sans-serif'],
          },
          maxWidth: { site: '1200px' },
        },
      },
    }
  </script>

  <style>
    html { scroll-behavior: smooth; }
    body { font-family: 'DM Sans', 'Inter', system-ui, sans-serif; }

    .btn-rose {
      display: inline-block; padding: 0.875rem 2rem; border-radius: 9999px;
      background: linear-gradient(135deg, #E8337A 0%, #A01B4A 100%);
      color: white; font-weight: 600; transition: all 200ms ease;
      box-shadow: 0 4px 16px rgba(232, 51, 122, 0.25);
    }
    .btn-rose:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(232, 51, 122, 0.35); }

    .btn-outline {
      display: inline-block; padding: 0.875rem 2rem; border-radius: 9999px;
      border: 1.5px solid rgba(255,255,255,0.3); color: white; font-weight: 500;
      transition: all 200ms ease;
    }
    .btn-outline:hover { background: rgba(255,255,255,0.1); border-color: white; }

    /* Mobile nav */
    .mobile-nav { transform: translateX(100%); transition: transform 0.35s ease; }
    .mobile-nav.open { transform: translateX(0); }

    /* Reveal animation */
    .reveal { opacity: 0; transform: translateY(20px); transition: all 600ms ease; }
    .reveal.visible { opacity: 1; transform: translateY(0); }

    /* Album card hover */
    .album-card { transition: transform 300ms ease, box-shadow 300ms ease; }
    .album-card:hover { transform: translateY(-4px); }
    .album-card .album-cover { transition: transform 700ms ease; }
    .album-card:hover .album-cover { transform: scale(1.04); }

    /* Photo grid tile hover */
    .photo-tile { transition: transform 300ms ease, opacity 300ms ease; cursor: zoom-in; }
    .photo-tile:hover { transform: scale(1.02); }
    .photo-tile img { transition: opacity 200ms ease; }

    /* Lightbox */
    .lightbox {
      position: fixed; inset: 0; background: rgba(0,0,0,0.95);
      display: none; align-items: center; justify-content: center;
      z-index: 100; padding: 2rem;
    }
    .lightbox.open { display: flex; }
    .lightbox-img {
      max-width: 100%; max-height: 100%; object-fit: contain;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    .lightbox-btn {
      position: absolute; background: rgba(255,255,255,0.1); color: white;
      border: 1px solid rgba(255,255,255,0.2); border-radius: 9999px;
      width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: background 200ms ease;
    }
    .lightbox-btn:hover { background: rgba(255,255,255,0.2); }
    .lightbox-btn:focus-visible { outline: 2px solid #C4577A; outline-offset: 2px; }
    .lightbox-close { top: 1.5rem; right: 1.5rem; }
    .lightbox-prev { left: 1.5rem; top: 50%; transform: translateY(-50%); }
    .lightbox-next { right: 1.5rem; top: 50%; transform: translateY(-50%); }
    .lightbox-counter {
      position: absolute; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
      color: rgba(255,255,255,0.7); font-size: 0.875rem; letter-spacing: 0.05em;
    }
    @media (max-width: 640px) {
      .lightbox-prev, .lightbox-next { width: 40px; height: 40px; }
      .lightbox-prev { left: 0.5rem; } .lightbox-next { right: 0.5rem; }
    }

    /* Skip-to-content for screen readers + keyboard */
    .skip-link {
      position: absolute; top: -40px; left: 0; background: white; color: #1A1A1A;
      padding: 0.5rem 1rem; z-index: 200; transition: top 0.2s ease;
    }
    .skip-link:focus { top: 0; }

    /* Focus rings */
    a:focus-visible, button:focus-visible {
      outline: 2px solid #C4577A; outline-offset: 2px; border-radius: 4px;
    }
  </style>
</head>`;
}

export function pageNav() {
  return `<a href="#main" class="skip-link">Skip to content</a>

  <header id="wd-header" class="wd-header fixed top-0 left-0 right-0 z-50" style="background: rgba(20,16,18,0.92); border-bottom: 1px solid rgba(255,255,255,0.06);">
    <div class="max-w-site mx-auto flex items-center justify-between px-6 py-4">
      <a href="/wedeepen/" class="flex items-center" aria-label="WeDeepen home">
        <img src="/wedeepen/images/deepen-logo-white.png" alt="DeePeN" class="h-7 w-auto">
      </a>
      <nav class="hidden lg:flex items-center gap-7 text-sm font-medium" aria-label="Primary">
        <a href="/wedeepen/" class="text-white/80 hover:text-white transition">Home</a>
        <a href="/wedeepen/love-club/" class="text-white/80 hover:text-white transition">Love Club</a>
        <a href="/wedeepen/love-immersion/" class="text-white/80 hover:text-white transition">Love Immersion</a>
        <a href="/wedeepen/love-guides/" class="text-white/80 hover:text-white transition">Love Strategists</a>
        <a href="/wedeepen/events/" class="text-white/80 hover:text-white transition">Events</a>
        <a href="/wedeepen/gallery/" class="text-white hover:text-white transition" aria-current="page">Gallery</a>
        <a href="/wedeepen/reviews/" class="text-white/80 hover:text-white transition">Reviews</a>
        <a href="/wedeepen/about/" class="text-white/80 hover:text-white transition">About</a>
        <a href="/wedeepen/podcast/" class="text-white/80 hover:text-white transition">Podcast</a>
      </nav>
      <div class="flex items-center gap-4">
        <a href="https://circle.wedeepenloveclub.com/" class="btn-rose text-sm !py-2.5 !px-6 hidden sm:inline-block">Login to Love Club</a>
        <button id="mobile-toggle" class="lg:hidden text-white p-2" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-nav">
          <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
      </div>
    </div>
  </header>

  <div id="mobile-nav" class="mobile-nav fixed inset-0 z-[60] bg-ink/98 flex flex-col pt-20 px-8" aria-hidden="true">
    <button id="mobile-close" class="absolute top-5 right-5 text-white p-2" aria-label="Close menu">
      <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <nav class="flex flex-col gap-6 text-lg font-medium" aria-label="Mobile">
      <a href="/wedeepen/" class="text-white hover:text-gold transition">Home</a>
      <a href="/wedeepen/love-club/" class="text-white hover:text-gold transition">Love Club</a>
      <a href="/wedeepen/love-immersion/" class="text-white hover:text-gold transition">Love Immersion</a>
      <a href="/wedeepen/love-guides/" class="text-white hover:text-gold transition">Love Strategists</a>
      <a href="/wedeepen/events/" class="text-white hover:text-gold transition">Events</a>
      <a href="/wedeepen/gallery/" class="text-white hover:text-gold transition">Gallery</a>
      <a href="/wedeepen/reviews/" class="text-white hover:text-gold transition">Reviews</a>
      <a href="/wedeepen/about/" class="text-white hover:text-gold transition">About</a>
      <a href="/wedeepen/podcast/" class="text-white hover:text-gold transition">Podcast</a>
      <a href="https://circle.wedeepenloveclub.com/" class="btn-rose text-center mt-4">Login to Love Club</a>
    </nav>
  </div>`;
}

export function pageFooter() {
  return `<footer class="bg-ink border-t border-white/10 py-14">
    <div class="max-w-site mx-auto px-6">
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 mb-10">
        <div>
          <img src="/wedeepen/images/deepen-logo-white.png" alt="DeePeN" class="h-7 w-auto">
          <p class="text-white/40 text-sm mt-3 leading-relaxed max-w-xs">Your intimacy journey is your life story.</p>
        </div>
        <div class="flex gap-5">
          <a href="https://www.facebook.com/WeDeepen/" target="_blank" rel="noopener" class="text-white/40 hover:text-gold transition" aria-label="Facebook">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          </a>
          <a href="https://www.instagram.com/wedeepen/" target="_blank" rel="noopener" class="text-white/40 hover:text-gold transition" aria-label="Instagram">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
          </a>
          <a href="https://www.youtube.com/@wedeepen" target="_blank" rel="noopener" class="text-white/40 hover:text-gold transition" aria-label="YouTube">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path fill="#1A1A1A" d="M9.545 15.568V8.432L15.818 12z"/></svg>
          </a>
        </div>
      </div>
      <div class="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-white/40 text-xs">
        <p>&copy; ${new Date().getFullYear()} WeDeepen. All rights reserved.</p>
        <div class="flex flex-wrap gap-x-6 gap-y-2 items-center justify-center">
          <a href="https://christinalweber.com" class="hover:text-gold transition">christinalweber.com</a>
          <a href="/wedeepen/about/" class="hover:text-gold transition">About</a>
          <a href="/wedeepen/events/" class="hover:text-gold transition">Events</a>
        </div>
      </div>
    </div>
  </footer>`;
}

export function pageScripts() {
  return `<script>
    // Sticky header scroll effect
    const header = document.getElementById('wd-header');
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 50);
    });
    // Mobile nav toggle
    const mobileToggle = document.getElementById('mobile-toggle');
    const mobileClose = document.getElementById('mobile-close');
    const mobileNav = document.getElementById('mobile-nav');
    function setMobileNav(open) {
      mobileNav.classList.toggle('open', open);
      mobileToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      mobileNav.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    mobileToggle.addEventListener('click', () => setMobileNav(true));
    mobileClose.addEventListener('click', () => setMobileNav(false));
    mobileNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => setMobileNav(false));
    });
    // Scroll reveal
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
  </script>`;
}
