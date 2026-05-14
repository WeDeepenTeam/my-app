# christinalweber.com

The production website for **[christinalweber.com](https://christinalweber.com)** — Christina Weber's personal brand site (advisor, founder, host).

This repo also hosts the shared **Supabase Edge Functions** used by both christinalweber.com and [wedeepen.com](https://wedeepen.com).

---

## Sister repo

This is one of two repos in the Weber ecosystem. Strict separation:

| Repo | Site | What lives here |
|------|------|-----------------|
| **`WeDeepenTeam/my-app`** (this repo) | **christinalweber.com** | Personal brand site, shared Supabase Edge Functions, schema migrations for non-WeDeepen tables, AlpacApps platform infra |
| [`WeDeepenTeam/wedeepen-site`](https://github.com/WeDeepenTeam/wedeepen-site) | **wedeepen.com** | All WeDeepen pages (Love Club, Love Immersion, gallery, podcast, retreats), gallery build pipeline, WeDeepen-specific Supabase schema |

**WeDeepen-specific code, content, and assets do not belong here.** If you're working on WeDeepen, you're in the wrong repo.

---

## Quick facts

- **Live URL:** [christinalweber.com](https://christinalweber.com)
- **Tech:** Vanilla HTML/JS + Tailwind CSS v4
- **Hosting:** GitHub Pages, deploys automatically on push to `main`
- **DNS / CDN:** Cloudflare
- **Backend:** Supabase (database, auth, edge functions)
- **Repo origin:** Forked from the [AlpacApps Infra](https://github.com/rsonnad/alpacapps-infra) template

---

## Getting started

```bash
git clone https://github.com/WeDeepenTeam/my-app.git
cd my-app

# Preview locally
python3 -m http.server 8000
# → open http://localhost:8000
```

For development workflow, branch naming, commit style, and PR conventions, see **[CLAUDE.md](./CLAUDE.md)** (it doubles as the developer guide).

For full infrastructure documentation (auth, payments, smart home, etc. from the AlpacApps template), see **[docs/](./docs/)** and **[CUSTOMIZATION.md](./CUSTOMIZATION.md)**.

---

## Shared Supabase Edge Functions

This repo hosts edge functions called by both christinalweber.com and wedeepen.com:

| Function | Purpose | Used by |
|----------|---------|---------|
| `circle-events` | Pulls live events from Circle Admin API | wedeepen.com /events/ |
| `drop-a-line` | Homepage contact form → creates Circle member | wedeepen.com / |
| (others) | See `supabase/functions/` | varies |

Functions are deployed with `supabase functions deploy <name>`. Secrets are set via `supabase secrets set` (never committed).

---

## Deployment

Push to `main` → GitHub Pages auto-deploys in ~30 seconds. Check status:

```bash
gh run list --limit 5
```

---

## Platform infrastructure (AlpacApps template)

This repo was bootstrapped from the [AlpacApps Infra template](https://github.com/rsonnad/alpacapps-infra), which provides:

- Supabase database, auth, storage
- GitHub Pages hosting
- Role-based admin dashboard
- Communication (email/SMS/WhatsApp), payments (Stripe/Square/PayPal), e-signatures
- Smart home integrations (lighting, climate, cameras, locks, audio, vehicles)
- AI/voice (Claude API, ElevenLabs, AssemblyAI)

The full set of features Christina uses is documented in **[CUSTOMIZATION.md](./CUSTOMIZATION.md)** and the per-domain runbooks under **[docs/](./docs/)**.

For template upgrades from upstream, see **[infra/infra-upgrade-guide.md](./infra/infra-upgrade-guide.md)**.

---

## License

AGPL-3.0 — see [LICENSE](LICENSE).
