---
name: deploy_backend
description: Deploy the Firebase Cloud Functions + Firestore rules/indexes backend (backend/) to the live snake-odyssey project, with the environment setup this machine needs and a required confirmation step. Use when asked to deploy the backend, ship backend changes, or make backend changes live.
---

# Deploy Backend

Deploys `backend/` (Cloud Functions, Firestore Security Rules, Firestore indexes) to the
live `snake-odyssey` Firebase project. This is a **production deploy** — unlike `/push`,
it must never run without the user explicitly confirming first, even if invoked directly.
A live deploy affects real players immediately and isn't easily undone (no `git revert`
for a deployed Cloud Function).

## Before deploying

1. Run `git status --short backend/` and `git diff backend/` to see what's actually
   changing. Read the diff — know what you're about to ship.
2. If `backend/functions/` source changed, sanity-check it loads cleanly first:
   ```bash
   cd backend/functions
   node -e "process.env.GCLOUD_PROJECT='snake-odyssey'; import('./index.js').then(m => console.log('OK', Object.keys(m))).catch(e => { console.error(e); process.exit(1); })"
   ```
3. **Ask the user to explicitly confirm the deploy** (e.g. via AskUserQuestion) before
   running the deploy command, unless they've already explicitly asked for it in the same
   turn (e.g. "make it live", "deploy the backend now"). Don't skip this — a prior
   confirmation for a *different* change doesn't carry forward to this one.

## Environment setup (this machine)

Firebase CLI calls fail with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` / `unable to verify the
first certificate` unless the Norton TLS-inspection proxy's root CA is trusted. Export it
for every `firebase`/`npm` command in this flow (session-scoped only — never persist this
as a global npm/system config, see backend/README.md's Gotchas section for why):

```bash
export NODE_EXTRA_CA_CERTS="C:/Users/bobt/AppData/Local/Temp/claude/C--BobsProjects-claude-elevera-health-workspace-snake-io/00626149-1fbd-48f4-862e-4f9eb5dfd9ab/scratchpad/norton-proxy-ca.pem"
```

If that PEM file doesn't exist (new session/scratchpad wiped), regenerate it:

```bash
powershell -NoProfile -Command "$cert = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match 'Norton' }; $pem = [Convert]::ToBase64String($cert.RawData, 'InsertLineBreaks'); \"-----BEGIN CERTIFICATE-----`n$pem`n-----END CERTIFICATE-----\" | Out-File -Encoding ascii '<scratchpad>/norton-proxy-ca.pem'"
```

Confirm the CLI is authenticated (`firebase login` requires a real interactive terminal —
it fails with "Cannot run login in non-interactive mode" from this session; if not logged
in, ask the user to run `firebase login` themselves from their own terminal in
`backend/`):

```bash
firebase login:list
```

## Deploy

```bash
export NODE_EXTRA_CA_CERTS="<path from above>"
cd backend
firebase deploy --only functions,firestore:rules,firestore:indexes --project snake-odyssey
```

Expect a few warnings that are safe to ignore: Node 20 deprecation notice, outdated
`firebase-functions` version notice, and (usually only on brand-new functions) a
"No cleanup policy detected for repositories" error at the end — the deploy itself still
succeeds despite that error; it's just Artifact Registry container image cleanup, not the
functions. Don't run `firebase functions:artifacts:setpolicy --force` to silence it
without asking first — same confirmation rule applies to that as to the deploy itself.

## After deploying

1. `firebase functions:list --project snake-odyssey` — confirm the expected functions are
   listed and `ACTIVE`.
2. **If `firestore.indexes.json` changed**, wait ~30-60s before relying on the new index —
   composite indexes build asynchronously after deploy, and a query that needs one will
   fail with `FAILED_PRECONDITION: The query requires an index...` until it's ready. This
   bit us on the first backend deploy (see backend/README.md Gotchas).
3. Run the `live_smoke_test` skill (or at minimum sign up a throwaway account and play one
   run) to confirm the deployed functions actually work end-to-end, not just that the
   deploy command exited 0 — a 500 error from a missing index or a typo won't show up in
   the deploy output itself.
4. Report back: what changed, what you verified, and any new throwaway test accounts
   created during verification (so the user can clean them up from the Firebase Console
   if they want to).
