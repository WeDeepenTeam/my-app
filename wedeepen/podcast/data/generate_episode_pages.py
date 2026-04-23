"""
Generate static HTML pages for every podcast episode.
Output: /wedeepen/deepen-with-christina/<slug>/index.html — one per episode.
URL structure matches the existing wedeepen.com pattern for SEO preservation.

Re-run this script any time episodes.json is refreshed.
"""
import json, re, os, html, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3] / "wedeepen"
EPISODES_FILE = Path(__file__).resolve().parent / "episodes.json"
OUTPUT_DIR = ROOT / "deepen-with-christina"

def slugify(title: str) -> str:
    s = title.lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")

def libsyn_embed_slug(link: str) -> str:
    """Extract the last path segment from the Libsyn link for embed URL construction."""
    return link.rstrip("/").split("/")[-1]

def render_episode_page(ep: dict, related: list) -> str:
    title_esc = html.escape(ep["title"])
    desc_esc = html.escape(ep.get("description", ""))[:400]
    desc_long = html.escape(ep.get("description", ""))
    slug = slugify(ep["title"])
    url_path = f"/wedeepen/deepen-with-christina/{slug}/"
    image = ep.get("image") or "/wedeepen/images/podcast-artwork.png"
    image_abs = image if image.startswith("http") else f"https://wedeepen.com{image}"
    duration = ep.get("duration", "")
    date_pretty = ep.get("date_pretty", "")
    date_iso = ep.get("date", "")
    ep_num = ep.get("episode", "")
    audio_url = ep.get("audio", "")

    # Libsyn embed for THIS specific episode
    libsyn_slug = libsyn_embed_slug(ep.get("link", ""))
    # Libsyn iframe pattern for single episodes
    libsyn_embed = f"//play.libsyn.com/embed/episode/id/{libsyn_slug}/height/192/theme/modern/size/large/thumbnail/yes/custom-color/1A1A1A/" if libsyn_slug else ""

    related_cards = "\n".join([f"""
          <a href="/wedeepen/deepen-with-christina/{slugify(r['title'])}/" class="flex gap-4 p-4 rounded-xl transition" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);">
            <div class="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-charcoal">
              <img src="{r.get('image') or '/wedeepen/images/podcast-artwork.png'}" alt="" class="w-full h-full object-cover" loading="lazy" onerror="this.src='/wedeepen/images/podcast-artwork.png'">
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-white/50 text-xs mb-1">{r.get('date_pretty','')}</p>
              <h4 class="text-white text-sm font-semibold leading-tight line-clamp-2">{html.escape(r['title'])}</h4>
            </div>
          </a>""" for r in related])

    json_ld = {
        "@context": "https://schema.org",
        "@type": "PodcastEpisode",
        "name": ep["title"],
        "description": ep.get("description", "")[:500],
        "datePublished": date_iso,
        "associatedMedia": {
            "@type": "MediaObject",
            "contentUrl": audio_url,
        } if audio_url else None,
        "partOfSeries": {
            "@type": "PodcastSeries",
            "name": "Deepen with Christina",
            "url": "https://wedeepen.com/podcast/",
        },
        "image": image_abs,
        "url": f"https://wedeepen.com{url_path}",
    }
    json_ld = {k: v for k, v in json_ld.items() if v is not None}

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title_esc} — Deepen with Christina</title>
  <meta name="description" content="{desc_esc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://wedeepen.com{url_path}">

  <meta property="og:type" content="music.song">
  <meta property="og:url" content="https://wedeepen.com{url_path}">
  <meta property="og:title" content="{title_esc}">
  <meta property="og:description" content="{desc_esc}">
  <meta property="og:image" content="{image_abs}">
  <meta property="og:site_name" content="Deepen with Christina">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title_esc}">
  <meta name="twitter:description" content="{desc_esc}">
  <meta name="twitter:image" content="{image_abs}">

  <script type="application/ld+json">
  {json.dumps(json_ld, indent=2)}
  </script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap" rel="stylesheet">

  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {{
      theme: {{
        extend: {{
          colors: {{
            rose:    {{ deep: '#A01B4A', light: '#C4577A' }},
            pink:    {{ hot: '#E8337A', bright: '#FF4F8C', glow: 'rgba(232,51,122,0.25)' }},
            teal:    {{ DEFAULT: '#C9A277', light: '#D4B78C', dark: '#A8855C' }},
            gold:    {{ DEFAULT: '#C9A277', light: '#D4B78C', dark: '#A8855C' }},
            charcoal: '#2D2D2D',
            cream:   '#F4EDE0',
            ink:     '#1A1A1A',
            black:   '#1A1A1A',
            softgray: '#F5F5F5',
          }},
          fontFamily: {{
            heading: ['"Playfair Display"', 'Georgia', 'serif'],
            body:    ['"DM Sans"', 'Inter', 'system-ui', 'sans-serif'],
          }},
          maxWidth: {{ site: '1200px' }},
        }},
      }},
    }}
  </script>

  <style>
    html {{ scroll-behavior: smooth; }}
    body {{ font-family: 'DM Sans', 'Inter', system-ui, sans-serif; }}
    .wd-header {{ backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); transition: background-color 0.3s ease, box-shadow 0.3s ease; }}
    .wd-header.scrolled {{ background-color: rgba(26,26,26,0.95); box-shadow: 0 2px 20px rgba(0,0,0,0.3); }}
    .btn-rose {{ background: #A01B4A; color: #fff; padding: 14px 32px; border-radius: 9999px; font-weight: 600; font-size: 0.95rem; transition: background 0.3s, transform 0.2s; display: inline-block; text-decoration: none; }}
    .btn-rose:hover {{ background: #851437; transform: translateY(-1px); }}
    .btn-outline {{ border: 1.5px solid #C9A277; color: #C9A277; padding: 14px 32px; border-radius: 9999px; font-weight: 600; font-size: 0.95rem; transition: background 0.3s, color 0.3s, transform 0.2s; display: inline-block; text-decoration: none; }}
    .btn-outline:hover {{ background: #C9A277; color: #1A1A1A; transform: translateY(-1px); }}
    .mobile-nav {{ transform: translateX(100%); transition: transform 0.35s ease; }}
    .mobile-nav.open {{ transform: translateX(0); }}
    .line-clamp-2 {{ display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }}
    .episode-body {{ white-space: pre-wrap; }}
    .episode-body p {{ margin-bottom: 1em; }}
  </style>
  <script src="https://catch.share.one/01954a1a-1897-7f53-bd40-a67ac4997dff.js" defer></script>
</head>
<body class="bg-ink text-white">

  <header id="wd-header" class="wd-header fixed top-0 left-0 right-0 z-50" style="background: rgba(20,16,18,0.92); border-bottom: 1px solid rgba(255,255,255,0.06);">
    <div class="max-w-site mx-auto flex items-center justify-between px-6 py-4">
      <a href="/wedeepen/" class="flex items-center">
        <img src="/wedeepen/images/deepen-logo-white.png" alt="DeePeN" class="h-7 w-auto">
      </a>
      <nav class="hidden lg:flex items-center gap-7 text-sm font-medium">
        <a href="/wedeepen/" class="text-white/80 hover:text-white transition">Home</a>
        <a href="/wedeepen/love-club/" class="text-white/80 hover:text-white transition">Love Club</a>
        <a href="/wedeepen/love-immersion/" class="text-white/80 hover:text-white transition">Love Immersion</a>
        <a href="/wedeepen/love-guides/" class="text-white/80 hover:text-white transition">Love Strategists</a>
        <a href="/wedeepen/events/" class="text-white/80 hover:text-white transition">Events</a>
        <a href="/wedeepen/reviews/" class="text-white/80 hover:text-white transition">Reviews</a>
        <a href="/wedeepen/about/" class="text-white/80 hover:text-white transition">About</a>
        <a href="/wedeepen/podcast/" class="text-white hover:text-white transition">Podcast</a>
      </nav>
      <div class="flex items-center gap-4">
        <a href="https://circle.wedeepenloveclub.com/" class="btn-rose text-sm !py-2.5 !px-6 hidden sm:inline-block">Login to Love Club</a>
        <button id="mobile-toggle" class="lg:hidden text-white p-2" aria-label="Open menu">
          <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
      </div>
    </div>
  </header>

  <div id="mobile-nav" class="mobile-nav fixed inset-0 z-[60] bg-ink/98 flex flex-col pt-20 px-8">
    <button id="mobile-close" class="absolute top-5 right-5 text-white p-2" aria-label="Close menu">
      <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <nav class="flex flex-col gap-6 text-lg font-medium">
      <a href="/wedeepen/" class="text-white hover:text-gold transition">Home</a>
      <a href="/wedeepen/love-club/" class="text-white hover:text-gold transition">Love Club</a>
      <a href="/wedeepen/love-immersion/" class="text-white hover:text-gold transition">Love Immersion</a>
      <a href="/wedeepen/love-guides/" class="text-white hover:text-gold transition">Love Strategists</a>
      <a href="/wedeepen/events/" class="text-white hover:text-gold transition">Events</a>
      <a href="/wedeepen/reviews/" class="text-white hover:text-gold transition">Reviews</a>
      <a href="/wedeepen/about/" class="text-white hover:text-gold transition">About</a>
      <a href="/wedeepen/podcast/" class="text-white hover:text-gold transition">Podcast</a>
      <a href="https://circle.wedeepenloveclub.com/" class="btn-rose text-center mt-4">Login to Love Club</a>
    </nav>
  </div>


  <!-- EPISODE HERO -->
  <section class="pt-32 md:pt-36 pb-12 md:pb-16 px-6">
    <div class="max-w-4xl mx-auto">
      <a href="/wedeepen/podcast/" class="text-gold text-sm hover:underline inline-flex items-center gap-2 mb-6">&larr; Back to all episodes</a>
      <div class="grid md:grid-cols-3 gap-8 md:gap-10 items-start">

        <div class="md:col-span-1">
          <div class="aspect-square rounded-2xl overflow-hidden shadow-2xl max-w-xs mx-auto md:max-w-full" style="box-shadow: 0 20px 60px rgba(0,0,0,0.6);">
            <img src="{image}" alt="{title_esc}" class="w-full h-full object-cover" loading="eager" onerror="this.src='/wedeepen/images/podcast-artwork.png'">
          </div>
        </div>

        <div class="md:col-span-2">
          <p class="text-gold text-xs tracking-[0.25em] uppercase font-semibold mb-3">Deepen with Christina</p>
          <h1 class="font-heading text-3xl md:text-4xl lg:text-5xl font-normal leading-tight mb-5">{title_esc}</h1>
          <div class="flex items-center gap-4 text-white/55 text-sm mb-6">
            <span>{date_pretty}</span>
            {"<span class='text-white/20'>·</span><span>" + duration + "</span>" if duration else ""}
          </div>
          <div class="flex flex-wrap gap-3">
            <a href="https://open.spotify.com/show/1Aq7R8l77roUrzY9q4DO1l" target="_blank" rel="noopener" class="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
              <svg class="w-4 h-4" fill="#1DB954" viewBox="0 0 24 24"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
              Spotify
            </a>
            <a href="https://podcasts.apple.com/us/podcast/deepen-with-christina/id1267527313" target="_blank" rel="noopener" class="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
              <svg class="w-4 h-4" fill="#A855F7" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 3.6c4.639 0 8.4 3.761 8.4 8.4s-3.761 8.4-8.4 8.4S3.6 16.639 3.6 12 7.361 3.6 12 3.6zm-.001 2.5a5.9 5.9 0 00-5.9 5.9 5.9 5.9 0 0011.8 0 5.9 5.9 0 00-5.9-5.9zm0 2.4a3.5 3.5 0 013.5 3.5 3.5 3.5 0 11-7 0 3.5 3.5 0 013.5-3.5z"/></svg>
              Apple Podcasts
            </a>
            <a href="{ep.get('link','')}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
              Listen on Libsyn &rarr;
            </a>
          </div>
        </div>

      </div>
    </div>
  </section>


  <!-- AUDIO PLAYER -->
  <section class="pb-12 md:pb-16 px-6">
    <div class="max-w-4xl mx-auto">
      <div class="rounded-xl overflow-hidden" style="box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
        <iframe title="Play this episode" src="{libsyn_embed}" height="192" width="100%" scrolling="no" allowfullscreen="" style="border: none;"></iframe>
      </div>
    </div>
  </section>


  <!-- SHOW NOTES -->
  <section class="py-16 md:py-20 px-6" style="background: linear-gradient(180deg, #1A1A1A 0%, #221618 100%);">
    <div class="max-w-3xl mx-auto">
      <p class="text-gold text-xs tracking-[0.25em] uppercase font-semibold mb-5">Show Notes</p>
      <div class="text-white/75 text-base leading-relaxed episode-body">{desc_long}</div>
    </div>
  </section>


  <!-- RELATED -->
  <section class="py-16 md:py-20 px-6 bg-ink">
    <div class="max-w-3xl mx-auto">
      <div class="mb-8">
        <p class="text-gold text-xs tracking-[0.25em] uppercase font-semibold mb-3">Also Listen</p>
        <h2 class="font-heading text-2xl md:text-3xl font-semibold">More Episodes</h2>
      </div>
      <div class="space-y-3">
        {related_cards}
      </div>
      <div class="text-center mt-10">
        <a href="/wedeepen/podcast/" class="btn-outline">Browse all episodes</a>
      </div>
    </div>
  </section>


  <!-- CTA -->
  <section class="py-16 md:py-20 px-6" style="background: linear-gradient(135deg, #1A1A1A 0%, #2a1620 100%);">
    <div class="max-w-2xl mx-auto text-center">
      <h2 class="font-heading text-3xl md:text-4xl font-normal mb-5 leading-tight">Love the podcast? <span class="italic" style="color:#C4577A;">Come practice it.</span></h2>
      <p class="text-white/60 mb-8 leading-relaxed">The conversations here become reality inside the Love Club.</p>
      <a href="/wedeepen/love-club/" class="btn-rose">Join Love Club</a>
    </div>
  </section>


  <footer class="bg-ink border-t border-white/10 py-12">
    <div class="max-w-site mx-auto px-6 text-center">
      <a href="/wedeepen/" class="inline-block mb-4">
        <img src="/wedeepen/images/deepen-logo-white.png" alt="DeePeN" class="h-6 w-auto mx-auto opacity-60">
      </a>
      <p class="text-white/30 text-xs">&copy; 2026 WeDeepen. All rights reserved.</p>
    </div>
  </footer>


  <script>
    const header = document.getElementById('wd-header');
    window.addEventListener('scroll', () => {{ header.classList.toggle('scrolled', window.scrollY > 50); }});
    const mobileToggle = document.getElementById('mobile-toggle');
    const mobileClose = document.getElementById('mobile-close');
    const mobileNav = document.getElementById('mobile-nav');
    mobileToggle.addEventListener('click', () => mobileNav.classList.add('open'));
    mobileClose.addEventListener('click', () => mobileNav.classList.remove('open'));
    mobileNav.querySelectorAll('a').forEach(l => l.addEventListener('click', () => mobileNav.classList.remove('open')));
  </script>

</body>
</html>
"""


def main():
    with open(EPISODES_FILE) as f:
        data = json.load(f)

    episodes = data["episodes"]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    generated = 0
    for i, ep in enumerate(episodes):
        if not ep.get("title"):
            continue
        slug = slugify(ep["title"])
        if not slug:
            continue

        # Get 3 related episodes (the 3 around this one, excluding itself)
        others = [e for j, e in enumerate(episodes) if j != i]
        related = others[:3] if i > 2 else others[3:6]

        page_html = render_episode_page(ep, related)
        out_dir = OUTPUT_DIR / slug
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(page_html, encoding="utf-8")
        generated += 1

    print(f"Generated {generated} episode pages into {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
