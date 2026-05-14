# christinalweber.com (my-app) — Project Directives

This repo deploys **christinalweber.com** (Christina Weber's personal brand site) and hosts shared **Supabase Edge Functions** used by both christinalweber.com and wedeepen.com.

## Repo identity (critical)

There is a sister repo: [`WeDeepenTeam/wedeepen-site`](https://github.com/WeDeepenTeam/wedeepen-site) which deploys **wedeepen.com**. The two repos are strictly separated.

| If you're working on… | Repo |
|----------------------|------|
| christinalweber.com (Christina's personal brand) | **This repo (`my-app`)** |
| Shared Supabase Edge Functions | **This repo** (`supabase/functions/`) |
| wedeepen.com pages, copy, gallery, podcast | [`wedeepen-site`](https://github.com/WeDeepenTeam/wedeepen-site) |
| WeDeepen-specific Supabase tables (gallery_albums, etc.) | `wedeepen-site` |

**Never mirror WeDeepen content into this repo.** WeDeepen has its own home. Default to asking before mixing concerns.

> **On-demand docs — load when the task matches:**
> - `docs/CREDENTIALS.md` — **load for:** SQL queries, deploying functions, SSH, API calls
> - `docs/SCHEMA.md` — **load for:** writing queries, modifying tables, debugging data
> - `docs/PATTERNS.md` — **load for:** writing UI code, Tailwind styling, code review, testing
> - `docs/KEY-FILES.md` — **load for:** finding files, understanding project structure
> - `docs/DEPLOY.md` — **load for:** pushing, deploying, version questions
> - `docs/INTEGRATIONS.md` — **load for:** external APIs, vendor setup, pricing
> - `docs/CHANGELOG.md` — **load for:** understanding recent changes, migration context
> - `docs/SECRETS-BITWARDEN.md` — **load for:** Bitwarden CLI, secrets management, vault organization, sharing credentials
> - `docs/OPEN-BRAIN-SETUP.md` — **load for:** Open Brain session dashboard, AI memory, embeddings

> **Upgrading from the AlpacApps template?**
> Read `infra/infra-upgrade-guide.md` for step-by-step instructions to sync new features from
> the alpacapps-infra template repo. Machine-readable feature index: `infra/updates.json`

## Mandatory Behaviors

1. After code changes: end response with `vYYMMDD.NN H:MMa [model]` + affected URLs (read `version.json`)
2. Push immediately — GitHub Pages deploys on push to main. See `docs/DEPLOY.md`
3. CI bumps version — never bump locally
4. Run SQL migrations directly — never ask the user to run SQL manually
5. **Stop and clarify before adding WeDeepen-specific code, content, or assets here.** If it belongs in `wedeepen-site`, put it there.

## Code Guards

- Filter archived items: `.filter(s => !s.is_archived)` client-side
- No personal info in consumer/public views
- `showToast()` not `alert()` in admin
- `openLightbox(url)` for images
- Tailwind: use design tokens from `@theme` block (see `docs/PATTERNS.md`). Run `npm run css:build` after new classes.

## Quick Refs

- **Tech:** Vanilla HTML/JS + Tailwind v4 | Supabase | GitHub Pages
- **Live:** https://christinalweber.com
- **Architecture:** Browser → GitHub Pages → Supabase (no server-side code)
- **Sister repo:** https://github.com/WeDeepenTeam/wedeepen-site (wedeepen.com)
- **Template repo:** https://github.com/rsonnad/alpacapps-infra
- **Upgrade guide:** `infra/infra-upgrade-guide.md`
