# Deployment Guide

MatchPulse Rugby is a Vite SPA on **classic Firebase Hosting**, fronted by **Cloud
Functions** (an SSR/bot renderer that every page request is routed through, plus a
sitemap and a PayFast webhook), with **Cloud Firestore** rules/indexes and **Cloud
Storage** rules. This guide covers both automated (CI) and manual deployment, and the
**IAM permissions** the CI service account needs.

- **Firebase project:** `match-pulse-4560e` — the consolidated project shared by
  all four MatchPulse sites for unified authentication. Pinned in `.firebaserc`
  and in the deploy workflow, so no `FIREBASE_PROJECT_ID` secret is needed.
  (`<project-id>` below means `match-pulse-4560e`.) Rugby's own Hosting site
  within that project is `match-pulse-4560e-ff0fe`, pinned as `hosting.site` in
  `firebase.json`; its live URL is `https://match-pulse-4560e-ff0fe.web.app`.
- **Firestore database:** rugby uses a **named** Firestore database, `rugby`,
  inside the shared project — hockey (and the other MatchPulse sites) use the
  project's `(default)` database. One project keeps authentication unified; a
  separate database keeps each sport's data fully isolated. The id is set in
  three places that must agree: the client `VITE_FIREBASE_DATABASE_ID` secret,
  the functions `FIRESTORE_DATABASE_ID` env, and `firebase.json`'s
  `firestore.database` (all default to `rugby`). **This database must be created
  in the Firebase console before the app works** — Firestore → the database
  picker → *Add database* → id `rugby`, same location as hockey's default
  (`africa-south1`). Because `firebase.json` scopes `firestore.database` to
  `rugby`, the CI rules/indexes deploy targets rugby's database and never
  overwrites hockey's `(default)` rules.
- **CI workflow:** `.github/workflows/firebase-deploy.yml` (runs on push to `main`)
- **Required GitHub secrets:** `FIREBASE_SERVICE_ACCOUNT` (deploy credential) and
  the six `VITE_FIREBASE_*` web-config values (see `.env.example`). Optional:
  `PUBLIC_BASE_URL`. This mirrors the hockey repo's secrets, with this project's
  values.

> ### ⚠️ Do NOT use Firebase App Hosting
>
> This app is built for **classic Firebase Hosting** (`firebase deploy`). It is a
> static SPA that is served from `dist/` — it does **not** run a web server.
> **Firebase App Hosting** is a different product: it builds your repo and then runs
> a container that must listen on `$PORT` (8080). Pointing App Hosting at this repo
> produces a rollout that fails with *"container failed to start and listen on the
> port … within the allocated timeout"*, because nothing here ever listens on a port.
>
> If an App Hosting backend was created for this repo (e.g. one named `rugby`),
> **delete it**: Firebase console → **App Hosting** → the backend → **⋮ → Delete
> backend** (or `firebase apphosting:backends:delete <name>`). Deploy via classic
> Hosting instead, as described below.

---

## What gets deployed

| Artifact | Source | Deploy target | Required? |
|---|---|---|---|
| Static site | `dist/` (from `npm run build`) | Firebase Hosting | **Yes** — this is the site |
| Firestore security rules | `firestore.rules` | Cloud Firestore | **Yes** |
| Firestore composite indexes | `firestore.indexes.json` | Cloud Firestore | **Yes** |
| Storage rules | `storage.rules` | Cloud Storage | **Yes** |
| Cloud Functions (email, scheduled fixture sweeps, automatic stats recompute, PayFast webhook) | `functions/` | Cloud Functions (2nd gen) | Optional |

**The site is a plain static SPA.** `firebase.json` serves `dist/` and rewrites
unknown paths to `/index.html` (`** -> /index.html`) — no Cloud Function sits in the
page-request path, so Hosting works entirely on its own. The CI workflow deploys the
site + rules in one step, then deploys Functions in a separate **non-blocking** step.

**Cloud Functions are optional.** They add automatic stats recompute on result
finalisation, scheduled fixture sweeps (auto-flip to live, retire abandoned matches),
invite/contact email, and the PayFast payment webhook. The website loads and is fully
browsable without them; deploy them once the project is on the Blaze plan and the CI
service account has the functions roles below. Their keys (Resend, Turnstile,
`PUBLIC_BASE_URL`, contact inbox) come from `functions/.env` (see
`functions/.env.example`) and are deliberately **not** Secret Manager secrets, so a
pre-launch functions deploy succeeds before any of them exist — the handlers no-op
gracefully until the values are provided.

---

## CI service account — required IAM roles

The CI deploy uses the `FIREBASE_SERVICE_ACCOUNT` GitHub secret (a Google service-account
JSON key). Deploying **Firestore rules and indexes** requires more than Hosting alone,
because the Firebase CLI calls `serviceusage.googleapis.com` to verify that
`firestore.googleapis.com` is enabled on the project before releasing rules.

If the service account lacks these roles you will see an error like:

```
Error: Failed to make request to https://serviceusage.googleapis.com/v1/projects/.../services/firestore.googleapis.com
... Permission denied to access serviceusage.googleapis.com for firestore.googleapis.com
```

This is an **IAM / deployment-permission issue, not an application-code issue.**

### Grant the service account these roles

| Role | ID | Why it is needed |
|---|---|---|
| **Firebase Admin** | `roles/firebase.admin` | Deploy Hosting, manage Firebase resources, release Firestore rules. |
| **Cloud Datastore Owner** | `roles/datastore.owner` | Write Firestore security rules and create/update composite indexes. |
| **Cloud Functions Admin** | `roles/cloudfunctions.admin` | Deploy the renderer/sitemap/webhook/scheduled/stats Cloud Functions (2nd gen). |
| **Service Account User** | `roles/iam.serviceAccountUser` | Let the deploy act as the Functions runtime service account (2nd-gen functions run on Cloud Run). |
| **Service Usage Viewer** | `roles/serviceusage.serviceUsageViewer` | Allow the CLI to check that required APIs (Firestore, Cloud Functions, Cloud Run, Cloud Build) are enabled. |

### How to grant them

**Console:**
IAM & Admin → IAM → find the service account (e.g.
`github-deployer@<project-id>.iam.gserviceaccount.com`) → **Edit** → **Add another
role** → add each of the three roles above → **Save**.

**gcloud CLI:**
```bash
PROJECT_ID=<project-id>
SA_EMAIL=github-deployer@<project-id>.iam.gserviceaccount.com   # adjust to your SA

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" --role="roles/firebase.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" --role="roles/datastore.owner"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" --role="roles/cloudfunctions.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" --role="roles/serviceusage.serviceUsageViewer"
```

After granting, re-run the workflow (push to `main` or **Actions → Deploy to Firebase →
Run workflow**). IAM changes can take a minute or two to propagate.

> **Billing:** 2nd-gen Cloud Functions require the **Blaze** (pay-as-you-go) plan. Enable
> it before the first deploy or the functions step fails.
>
> Also ensure the **Cloud Firestore**, **Cloud Functions**, **Cloud Run**, **Cloud Build**
> and **Service Usage** APIs are enabled on the project (APIs & Services → Enabled APIs).
> Service Usage Viewer lets the CLI *check* these; it does not *enable* them.

---

## Manual deployment (from a local machine)

Use this when CI permissions are not yet in place, or to deploy rules out of band.

### Prerequisites
- Firebase CLI: `npm install -g firebase-tools`
- Signed in as a user with deploy rights on `<project-id>`: `firebase login`

### Deploy Firestore rules only (the common case)
```bash
git pull origin <your-branch>
firebase deploy --only firestore:rules --project <project-id>
```

Expected output:
```
✔  firestore: rules file firestore.rules compiled successfully
✔  firestore: released rules firestore.rules to cloud.firestore
✔  Deploy complete!
```

### Full deploy (what CI does)
```bash
npm ci && npm run build
firebase deploy \
  --only hosting,functions,firestore:rules,firestore:indexes,storage \
  --project <project-id>
```
Deploy everything together so the Hosting rewrites and their Cloud Function targets go
live in step — Hosting alone (without Functions) 500s on every page.

### Other manual targets
```bash
# Rules + indexes together
firebase deploy --only firestore:rules,firestore:indexes --project <project-id>

# Storage rules
firebase deploy --only storage --project <project-id>

# Functions only (e.g. after changing the renderer)
firebase deploy --only functions --project <project-id>

# Hosting only (after npm run build) — only safe once Functions already exist
npm run build
firebase deploy --only hosting --project <project-id>

# Everything
firebase deploy --project <project-id>
```

> A signed-in **human user** with the Owner/Editor role on the project does not hit the
> Service Usage error, because their account already carries the necessary permissions.
> The three roles above are specifically for the **CI service account**.

---

## Post-deploy verification

After deploying Firestore rules, confirm:

1. Public pages load **logged out**: `/`, `/competitions`, `/schools`, `/clubs` — no
   "missing or insufficient permissions" errors in the browser console.
2. A signed-in user can self-create an organisation at `/manage/new-org` and becomes its
   **owner** (check `organizations/{id}/staff/{uid}` has `role: "owner"`).
3. An organisation member can create a competition, team and fixture under
   `/manage/orgs/:id`, and score the fixture from `/score`.

Use the **Firestore → Rules → Rules Playground** in the console to debug any specific
`permission-denied` by simulating the exact operation and user UID.
