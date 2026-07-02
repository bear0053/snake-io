# Backend (Firebase)

Snake Odyssey's Phase 3 cloud backend: Cloud Functions, Firestore security rules, and
Firebase project configuration. Deploys independently of the GitHub Pages frontend
(`firebase deploy` vs. a Pages push) — see the root README for the full Phase 3
architecture.

## Structure

```
.firebaserc              Project alias (snake-odyssey)
firebase.json             Emulator ports, functions/Firestore config paths
firestore.rules            Deny-by-default Security Rules - all trusted writes go
                            through Cloud Functions, never directly from the client
firestore.indexes.json      Composite indexes (gameSessions.playerId+startedAt, used by
                             the rate-limit check in startGameSession)
functions/
  package.json               Node 20, firebase-admin + firebase-functions
  index.js                   Re-exports every callable function
  src/
    admin.js                   Firebase Admin SDK init (Firestore handle)
    gameData.js                 Minimal server-side mirror of level/skin unlock rules
                                 from frontend/js/levels.js + snakes.js (keep in sync if
                                 those change) plus the achievement definitions (no
                                 frontend equivalent - see frontend/js/achievements.js
                                 for display-only metadata)
    validation.js                Heuristic score/session plausibility checks
    unlocks.js                    Computes newly-earned skin unlocks and achievements
                                    from profile state
    helpers.js                     requireAuth / profile-lookup / account-status guards
    audit.js                       Audit log + risk-score writes
    profile.js                      getOrCreatePlayerProfile, selectSnake
    session.js                       startGameSession, submitGameResult
    leaderboard.js                    getLeaderboard
    guestImport.js                     importGuestData
```

## Local development

Requires Node 20+ and a JDK 21+ (for the Firestore/Auth emulators).

```bash
cd backend/functions
npm install
cd ..
firebase emulators:start --only functions,firestore,auth --project snake-odyssey
```

The Emulator UI runs at `http://127.0.0.1:4000`. No real Firebase credentials or network
access are needed for local emulator testing.

## Deployment

```bash
cd backend
firebase deploy --only functions,firestore:rules,firestore:indexes
```

Requires `firebase login` once per machine - this opens a browser OAuth flow, so it must
be run from a real interactive terminal (it fails with "Cannot run login in
non-interactive mode" from a non-TTY shell). `firebase login:list` confirms who's logged
in without triggering the flow again.

Currently deployed to the single `snake-odyssey` Firebase project - there's no separate
staging/dev project. Use the local emulators (above) for development instead; a second
Firebase project is only worth the added setup/billing overhead if the emulators stop
being sufficient.

### Gotchas

- **Composite indexes take a minute to build after deploying.** Any query that combines
  an equality filter with a range/order filter on a different field (like
  `startGameSession`'s rate-limit check) needs an entry in `firestore.indexes.json`, or
  production Firestore rejects it with a `FAILED_PRECONDITION` error containing a direct
  link to auto-create the index. **The local emulator does not enforce this** - a query
  that works fine against `firebase emulators:start` can still fail in production, so
  exercise every Firestore query path against the real deployed backend at least once
  before trusting the emulator suite alone.
- `npm install` / `firebase deploy` may fail with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` on a
  machine running SSL-inspecting antivirus/proxy software (e.g. Norton) - Node doesn't
  trust the OS certificate store by default. Export the proxy's root CA from
  `Cert:\LocalMachine\Root` (Windows) to a `.pem` file and set
  `NODE_EXTRA_CA_CERTS=/path/to/that.pem` for the session; this is a local machine quirk,
  not something to fix in the repo.
- The Cloud Functions emulator can occasionally report
  `Cannot determine backend specification. Timeout after 10000ms` on a slow first load -
  set `FUNCTIONS_DISCOVERY_TIMEOUT=60000` (or higher) before starting the emulators.
