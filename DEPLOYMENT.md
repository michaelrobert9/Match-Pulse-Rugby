# Deployment Guide

MatchPulse Rugby is a Vite SPA on **classic Firebase Hosting**, fronted by **Cloud
Functions** (an SSR/bot renderer that every page request is routed through, plus a
sitemap and a PayFast webhook), with **Cloud Firestore** rules/indexes and **Cloud
Storage** rules. This guide covers both automated (CI) and manual deployment, and the
**IAM permissions** the CI service account needs.

- **Firebase project:** created per deployment — the rugby platform runs on its
  OWN Firebase project (not decided yet). Everywhere below, `<project-id>` means
  that project's id, configured via the `FIREBASE_PROJECT_ID` GitHub secret and
  `.firebaserc`.
- **CI workflow:** `.github/workflows/firebase-deploy.yml` (runs on push to `main`)

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

| Artifact | Source | Deploy target |
|---|---|---|
| Static site | `dist/` (from `npm run build`) | Firebase Hosting |
| Cloud Functions (renderer, sitemap, payfastITN, email, scheduled jobs, stats) | `functions/` | Cloud Functions (2nd gen) |
| Firestore security rules | `firestore.rules` | Cloud Firestore |
| Firestore composite indexes | `firestore.indexes.json` | Cloud Firestore |
| Storage rules | `storage.rules` | Cloud Storage |

**Functions are not optional.** `firebase.json` rewrites every page request (`**`),
plus `/sitemap.xml` and `/payfast/itn`, to Cloud Functions. If Hosting is deployed
without Functions, the site returns 500 on every page. The CI workflow therefore runs
a single `firebase deploy` covering hosting + functions + firestore + storage together.

Server-side secrets (Resend API key, Turnstile secret, `PUBLIC_BASE_URL`, contact
inbox) are read from `functions/.env` (see `functions/.env.example`). They are
deliberately **not** declared as Secret Manager secrets, so a fresh pre-launch deploy
succeeds before any of them exist — the relevant handlers no-op gracefully until the
values are provided.

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
