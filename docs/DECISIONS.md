# Sonora — Architecture Decision Records

Concise records of decisions that constrain later work. Detail lives in [`../ARCHITECTURE.md`](../ARCHITECTURE.md); roadmap in [`../PLAN.md`](../PLAN.md).
Statuses: **Accepted** (in force), **Proposed** (agreed direction, not implemented), **Amended**, **Superseded**, **Open**.

---

## Carried over from the original Phase 0 specification

| ADR | Decision | Status after code inspection |
| :-- | :-- | :-- |
| ADR-01 | Vanilla ES modules, no bundler, no build step | **Accepted.** Still true. A `package.json` (scripts, dev-only tools) may be added in Phase A1 without changing this; it must not introduce a build step for the frontend. |
| ADR-02 | One `<video>` element for audio and video | **Superseded by the code.** The implementation uses a separate `<audio>` and `<video>` element (`media-engine.js`). Keep two elements; consequence for the visualiser is tracked as an open question (ARCHITECTURE §6.9). |
| ADR-03 | Key-based pub/sub store in `state.js` | **Accepted.** Keep. Known caveats: shallow identity compare, in-place item mutation by the engine (PLAN D-17). |
| ADR-04 | Central object-URL registry with `beforeunload` revoke | **Amended.** The registry exists but is bypassed/leaky in duplicate and relink paths (D-05, D-13). Rule stays; Phase A2 makes all creation/revocation go through `bindFile()`/`importFiles()`, never revoking a live URL. |
| ADR-05 | Canvas 2D for the visualiser | **Accepted, deferred.** No visualiser code exists. Revisit in Phase C5. |

---

## ADR-06 — Native-file persistence: IndexedDB metadata + runtime file binding, handles as an enhancement
- **Status:** Proposed (Phase B). Builds on the existing IndexedDB store.
- **Context:** Verified: after reload the `File` is gone and tracks come back "Offline" (PLAN §2.E). Browsers cannot guarantee permanent file access; the File System Access API (Chromium-only for pickers **[U: confirm support table]**) can persist handles but permission can lapse or be revoked.
- **Decision:**
  1. IndexedDB (already used) is the system of record for metadata, playlists, favourites, queue, history, artwork Blobs and (optionally) file handles. `localStorage` holds only small preferences. Never audio in either; never audio in MongoDB.
  2. A library record is **metadata + a runtime-only file binding**. Availability (`available | needs-permission | missing | unplayable`) is derived at runtime and never persisted.
  3. Track identity is a portable `trackKey` (name|size|mtime, optionally content-hash of head+tail). Reconnecting binds a file to the **existing** record, so playlists/favourites survive.
  4. The baseline path (`<input multiple>`, `webkitdirectory`, drag-drop) must be complete on its own. Handle-based reconnect is feature-detected and confined to `file-access.js`.
  5. Playlists/favourites keep references to unavailable tracks; playback skips them with a summary notice; nothing is auto-deleted.
  6. Storage returns `Result` objects; failures surface through a visible `storageStatus`; read failures never trigger seeding or destructive rewrites; metadata backup/restore is provided.
- **Alternatives rejected:** audio copies in IndexedDB/OPFS by default (quota/eviction, duplicates user data); localStorage for library data (size, sync API); File System Access as the only path (excludes Firefox/Safari **[U]**).
- **Consequences:** users must sometimes reconnect files; UI must make that one click. Library data is safe across reloads; file access is not promised.

## ADR-07 — Frontend/backend boundary: local-first static frontend, optional account backend
- **Status:** Proposed (Phase D).
- **Context:** The product must work without an account and without uploading audio. Playlists/favourites that include local tracks reference device-specific ids today.
- **Decision:** The frontend stays a static, no-build app and remains fully functional offline/signed-out. An Express + Mongoose + MongoDB API (same-origin `/api`) is optional and handles accounts, preferences, playlists, favourites and Studio layouts. Sync is local-first with an outbox, per-record `rev`/`updatedAt`, tombstones, last-write-wins with conflict copies. Synced playlists/favourites reference `trackKey` + a metadata snapshot, not local ids. Sessions are DB-backed `HttpOnly; Secure; SameSite=Lax` cookies. Express is exported separately from `listen()` so it runs unchanged on Vercel or in Docker.
- **Alternatives rejected:** mandatory login (breaks local-first); storing local library index server-side by default (device-specific, privacy surface); in-memory sessions (fail on serverless); JWT in `localStorage` (XSS exposure).
- **Consequences:** `trackKey`/`TrackRef` must exist before Phase D (Phase B5). Rate limiting and sessions can't rely on process memory.

## ADR-08 — Sonora Studio: registry + layout document + services boundary
- **Status:** Proposed (Phase C). Prerequisite C0 refactor.
- **Context:** `app.js` hard-wires ~70 DOM ids and renders by `innerHTML`; Studio requires movable, restylable, multi-instance components without endangering playback.
- **Decision:** (1) Extract services exposing commands + selectors; UI regions become components `mount(el, ctx) → {update, destroy}`. (2) A **component registry** defines id/type, defaults, props schema, style slots, constraints, `requires`, `validate`. (3) A **layout document** (versioned JSON: grid-unit `rect`, `z`, `visible`, `locked`, `props`, `style{tokens,radius,shadow,customCss}`, per-breakpoint `responsive`) is the single model for beginner and advanced editing. (4) The layout engine and editor never import the media engine, storage or library; they see only `ctx`. (5) Media elements live outside the layout root; global shortcuts are layout-independent. (6) Layouts persist in a **separate** IndexedDB (`sonora_studio`). (7) Undo/redo = bounded immutable snapshot history with gesture coalescing. (8) Recovery ladder: migrate → validate/repair per component → last-known-good → built-in default; Safe Mode always available.
- **Alternatives rejected:** a UI framework/Next.js migration (no concrete requirement found); Shadow DOM per component (breaks shared tokens/global CSS, heavier); free absolute-pixel canvas as the only mode (poor responsiveness); storing layouts alongside the library DB (a layout schema bug could endanger library data).
- **Consequences:** C0 is a real cost and must be behaviour-preserving, protected by Phase A's regression suite. Custom-CSS scoping technique is **[U]** until a support check in C5.

## ADR-09 — Deployment: Vercel-first, Docker for local parity and as an escape hatch
- **Status:** Proposed.
- **Context (verified against Vercel docs, Phase 0.5):** no Docker Compose deployment target on Vercel; Express deploys zero-config as a single Function; `express.static()` is ignored (static files go in `public/**`); Functions are request-bound (Hobby max 300 s), stateless, 4.5 MB body limit, 1,024 shared file descriptors; container images and `services` are **Beta**; Python Functions exist (500 MB bundle).
- **Decision:** Frontend as a static Vercel site; API as an Express Vercel Function; MongoDB on Atlas. Docker Compose is introduced at D0 for **local** parity (Mongo, later the Python service). A plain `Dockerfile` for the API is introduced at D1 as an escape hatch for container hosts. External container hosting is chosen **only if** the Phase E spike shows the Python/provider service can't run acceptably on Vercel. Do not depend on beta Vercel features. No Docker/Vercel files are created before they have a job; a static smoke deploy (A6) settles root-vs-`public/` and HTTPS/ES-module behaviour first.
- **Alternatives rejected:** Docker-first everywhere (more ops, second platform, CORS/routing, cost **[U]** for no current benefit); assuming a Compose stack deploys to Vercel (false per docs).
- **Consequences:** Express code must stay host-agnostic and stateless; long-running/background work is explicitly out of the Vercel path.

## ADR-10 — Music-provider abstraction; local files are provider #1
- **Status:** Proposed (groundwork in Phase B5; implementation Phase E after spike E0).
- **Context:** ytmusicapi is unofficial ("not supported nor endorsed by Google"), emulates browser requests, needs Python ≥ 3.10; it is a metadata/library tool, not a sanctioned streaming API.
- **Decision:** Core code depends on a `MusicProvider` interface with separate capabilities (`search`, `browse`, `library`, `playlists`, `playback: 'local-file' | 'embed' | 'authorised-stream' | 'none'`) and a `PlaybackBackend` in the engine. Tracks are namespaced `TrackRef`s (`local:…`, `ytmusic:…`). Local files are served by a `LocalProvider`. Online playback is considered only through a path the provider sanctions (e.g. an official embed API) as determined by E0; no stream extraction or restriction bypass. Provider credentials never live in the browser. Removing all online providers leaves the player fully functional.
- **Alternatives rejected:** coupling the player to ytmusicapi; scraping/stream-URL extraction.
- **Consequences:** Phase E begins with a gating spike (ToS/legal, playback path, auth, rate limits, hosting, contract) — see ARCHITECTURE §8.4.
