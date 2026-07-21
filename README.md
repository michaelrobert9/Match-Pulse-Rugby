# Match Pulse Rugby

Live scoring, fixtures, logs and player records for South African school and
club **rugby**. A fully standalone sibling of Match Pulse Hockey: same design
system, app shell and architecture, adapted end-to-end for rugby's rules,
scoring structure and terminology. The two products share **no** code,
dependencies, backend services or deployment pipeline.

## Stack

- **Frontend:** React 18 + Vite 5 + Tailwind CSS 3, react-router 6, lucide-react
- **Backend:** Firebase — Firestore (offline-persistent), Auth, Storage, FCM push;
  optional Cloud Functions for stats recompute, scheduled fixture sweeps and email
- **PWA:** installable, offline-capable live scoring (see `public/manifest.json`)
- **CI/CD:** GitHub Actions → Firebase Hosting (`.github/workflows/firebase-deploy.yml`)

## Getting started

```bash
npm ci
cp .env.example .env        # fill in your Firebase web config (optional for a first look)
npm run dev
```

Without Firebase configured the app runs read-only against bundled rugby
sample data (`src/lib/sampleData.js`) — enough to explore every public view.

Tests (pure-logic suites, no Firebase needed):

```bash
node scripts/test-standings.mjs          # rugby log: points, bonus points, tie-breakers
node scripts/test-competition-logic.mjs  # pools, knockouts, kick-competition deciders
node scripts/test-display-and-nav.mjs
```

Build: `npm run build` (output in `dist/`).

## Rugby domain model

The heart of the adaptation from the hockey codebase:

- **Scoring events** (`match.scores[]`): every score is typed at capture —
  try **5**, conversion **2**, penalty **3**, drop goal **3**, penalty try
  **7** — and the running score is incremented by the event's point value in
  the same atomic write. Conversions link to the try they convert.
  `src/lib/rugbyScoring.js` is the single source of truth (mirrored for the
  Admin-SDK stats engine in `functions/statsEngine.js`).
- **Tries** are tallied per side (`homeTries`/`awayTries`) because standings
  need the count for bonus points. An *unknown* count (a bare submitted
  result) is `null`, never zero — it can neither earn nor deny a try bonus.
- **Standings** (`src/lib/standings.js`): 4/2/0 match points plus
  configurable **try bonus** (default 4+ tries) and **losing bonus** (default
  within 7), with PF/PA/PD, tries-for and bonus-point columns and a rugby
  tie-breaker chain (points → head-to-head → points difference → tries → …).
  Awarded walkovers (default 28–0) never earn bonuses.
- **Match clock** (`src/lib/matchClock.js`): two halves counting **up**, with
  added time shown rugby-style (`40'+`) and the hooter at the nominal half
  length. Fixtures default to 2×35 (school fifteens); sevens fixtures default
  to 2×7; 3–4 periods model knockout extra time.
- **Cards:** yellow (sin-bin — 10 min fifteens / 2 min sevens) and red.
- **Knockout deciders:** a drawn knockout is settled by a **place-kick
  competition** (`kickCompHome`/`kickCompAway`), shown as `20–20 (4–3 kicks)`.
- **Player stats:** caps, tries, conversions, penalties, drop goals, points
  and cards — per competition slice and as career totals.

## Deployment

The rugby platform deploys to its **own** Firebase project and (eventually)
its own domain — neither exists yet, and nothing in this repo hardcodes
either. See `DEPLOYMENT.md` for the full runbook. In short:

1. Create a Firebase project on the **Blaze** plan (Firestore, Auth, Storage,
   Hosting, Functions — 2nd-gen functions need Blaze).
2. Put its id in `.firebaserc` and the `FIREBASE_PROJECT_ID` GitHub secret.
3. Add the `VITE_FIREBASE_*` web-config secrets (names in `.env.example`) and
   the `FIREBASE_SERVICE_ACCOUNT` deploy credential (IAM roles in `DEPLOYMENT.md`).
4. When the public domain is decided, set the `PUBLIC_BASE_URL` GitHub secret
   (drives canonical URLs, OG tags and the sitemap), the same variable in
   `functions/.env`, and the absolute `Sitemap:` line in `public/robots.txt`.
5. Configure the server-side email/billing settings in `functions/.env`
   (template: `functions/.env.example`).

Pushes to `main` build and deploy via the GitHub Actions workflow: the site
(Hosting + Firestore rules/indexes + Storage) deploys in one step, then Cloud
Functions deploy in a separate **optional, non-blocking** step. The site is a
plain static SPA (`firebase.json` rewrites `** -> /index.html`) — no Cloud
Function sits in the page-request path, so it loads on its own. Functions add
automatic stats recompute, scheduled fixture sweeps, and email; deploy them once
the project is on Blaze (see `DEPLOYMENT.md`).

> **Use classic Firebase Hosting, not Firebase App Hosting.** This is a static
> SPA served from `dist/`; it does not run a web server. App Hosting expects a
> container that listens on `$PORT` and will fail its rollout ("container failed
> to start … on the port"). If an App Hosting backend was created for this repo,
> delete it (Firebase console → App Hosting → Delete backend). See `DEPLOYMENT.md`.

## Deliberate deviations from the hockey product

Beyond the sport itself, these are conscious differences, not accidents:

- **No hardcoded deployment target.** Hockey hardcodes its domain and
  Firebase project throughout; here every occurrence is environment-driven
  (`VITE_PUBLIC_BASE_URL` / `PUBLIC_BASE_URL`, `FIREBASE_PROJECT_ID`), with
  sensible request-host/`<project>.web.app` fallbacks in the SSR renderer.
- **Billing is unconfigured by design.** The hockey repo embeds its real bank
  account, PayFast payment links and billing/contact inboxes. None of that
  was ported: all billing/contact values are per-deployment environment
  configuration, the PayFast CTA falls back to the EFT-invoice flow while
  unset, and the contact Cloud Function refuses loudly if its inbox is not
  configured.
- **Assists are gone.** Hockey tracked goal assists; rugby attribution is the
  try scorer or the kicker. There is no assist field anywhere.
- **Result entry captures try counts.** Because bonus points depend on tries,
  the enter-result and admin result-queue forms take optional per-side try
  counts (blank = unknown) alongside the score — hockey's forms had no
  equivalent concept.
- **Scorer console is three buttons per side** (TRY / KICK / CARD) instead of
  hockey's two (GOAL / CARD): a rugby score's type *is* its point value, so
  the type is captured up front instead of as optional enrichment.
- **Shared logo, no sport mark.** `public/icon.svg` is the generic Match
  Pulse logo, byte-identical to hockey's, per the brand plan. Sport-specific
  marks are a separate, later work stream.

## Repository notes

- `src/legal/content/` and `src/support/content/` are the markdown sources;
  regenerate the bundled JSON with `node scripts/build-support-content.mjs`
  and `node scripts/build-legal-content.mjs` after editing.
- `public/og-default.svg` is the source for the OG share image; re-export
  `og-default.png` (1200×630) after any change.
- Backfill/migration scripts under `scripts/` are inherited platform tooling
  for schema evolutions; none need to run on a fresh deployment.
