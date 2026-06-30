# CLAUDE.md — BuzzyBee / BuzzyHive

## What Is This

`buzzybee` is the repo/package (and the Postgres schema name — unchanged); the product is branded **"BuzzyHive"** (formerly "HiveMind") — a VA‑staffing + team‑workspace platform. One git repo, **three Vite builds** plus a Supabase backend:

1. **Web app** (`src/`) — the main Vue 3 SPA (workstation + admin).
2. **Landing** (`landing/` + `vite.config.landing.ts`) — marketing site.
3. **Electron desktop** (`electron/`) — separate desktop client: meeting intelligence (AI summaries/coach/action‑items) + SignalWire/SIP softphone. **Self‑contained npm project.**

Hosting: Netlify (SPA fallback). Backend: Supabase (Auth, Postgres via PostgREST, Realtime, Storage, Edge Functions).

## Tech Stack

- Vue 3 (`<script setup lang="ts">`) + TypeScript `~5.9` (**strict**)
- Vite 8 + `@vitejs/plugin-vue`; type‑checked builds via `vue-tsc`
- Tailwind CSS **v4** (CSS‑first — config lives in `src/style.css`, no `tailwind.config`) + DaisyUI v5
- Pinia (22 stores) + Vue Router 4 (history mode)
- Lucide icons
- Supabase (`@supabase/supabase-js`) — **all app tables live in the `buzzybee` Postgres schema, not `public`**
- Feature libs: TipTap 3 (rich text), Vue Flow (automation builder), Three.js + MediaPipe + noise‑suppressor (WebRTC huddles), SortableJS
- Electron build adds: SignalWire JS, sip.js (dialer), `@google/generative-ai`, `electron-store`

## Commands

**Package manager: npm.** Root and `electron/` are **separate npm projects** — install both:

```bash
npm install            # root
cd electron && npm install   # desktop client (separate lockfile/node_modules)
```

Root scripts:

```bash
npm run dev            # web app  → vite, port 5175 (host:true for LAN)
npm run dev:landing    # landing  → port 5176
npm run build          # vue-tsc -b && vite build  → dist/   (this IS the typecheck path)
npm run build:landing  # → dist-landing/
npm run preview        # preview production build
npm run buzzybee:setup # node scripts/buzzybee-setup.mjs (seed/setup helper)
```

Electron (run from `electron/`):

```bash
npm run dev            # concurrently: tsc main + electron . --dev + vite renderer (port 5177)
npm run build          # renderer + main
npm run dist           # electron-builder installer (Windows x64)
```

> **There is no lint, format, or test setup** (no eslint/prettier/biome, no test framework). "Typecheck" = `vue-tsc -b` at root, `tsc -p tsconfig.json` in `electron/`. If you add a linter/tests later, update this file and `.vscode/`.

## Environment

`.env.example` → `.env` (gitignored). The app **throws on startup** if Supabase vars are missing.

```
VITE_SUPABASE_URL=            # required
VITE_SUPABASE_ANON_KEY=       # required (or VITE_SUPABASE_PUBLISHABLE_KEY)
SUPABASE_DB_URL=              # node scripts only (server-side; never shipped to client)
VITE_GIPHY_KEY=              # optional — GIF picker hidden without it
VITE_TURN_URL=               # optional TURN relay for WebRTC (STUN-only without it)
VITE_TURN_USERNAME=
VITE_TURN_CREDENTIAL=
```

Electron has its **own** `electron/.env` (SignalWire/dialer creds).

> **Supabase gotcha:** the `buzzybee` schema must be listed under Project Settings → API → **Exposed schemas**, or every PostgREST call fails.

## Project Structure

```
src/
  main.ts            # entry: diagnostics → Pinia → v-reveal → authStore.init() → router ready → mount
  App.vue            # picks layout (workstation | admin | bare) from route.meta; hosts BuzzOverlay/Toasts/Tour
  views/
    workstation/     # 21 auth views: Tasks, Comms, CRM, Forms, Flow builder, Tickets, Nectar, Team, Time…
    admin/           # Dashboard
    shared/          # public: LandingPage, IndustryPage, MeetingRoom, PublicForm, PublicVaProfile
  components/        # by domain: comms/ crm/ flows/ forms/ landing/ nectar/ vaprofile/ workstation/ shared/
  stores/            # 22 Pinia stores (auth, tasks, crm, channels, flows, forms, tickets, time…)
  composables/       # 24 useX.ts (realtime, presence, huddle, theme, tour, notifications)
  lib/               # supabase.ts (client), realtime.ts, iceServers.ts, email/crm/form/flow helpers
  router/index.ts    # requiresAuth guard → /login; /app/* workstation, /admin admin, public = bareLayout
  style.css          # Tailwind v4 + DaisyUI config (@plugin "daisyui")
electron/            # self-contained desktop client: main/ renderer/(control+overlay+dialer) preload/ shared/
supabase/
  migrations/        # 85 timestamped .sql (YYYYMMDD[letter]_name.sql) — applied via Supabase CLI/dashboard
  functions/         # Edge Functions: invite-user, resend-webhook, run-flow, send-campaign
  seeds/
scripts/             # node .mjs utilities
```

## Conventions

- **TS strict everywhere**: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`. Don't introduce unused vars/params.
- **Import alias**: `@/*` → `src/*` (tsconfig paths + Vite alias). Electron: `@shared/*` → `electron/shared/*`, `@electron` → `electron/`.
- **Style is by convention (no formatter)**: 2‑space indent, **single quotes, no semicolons**, explanatory comments. Match surrounding code — do **not** reformat files wholesale (no Prettier is configured, so a reformat = noisy diff).
- **Naming**: Vue components/views PascalCase (`TasksView.vue`); stores/composables/lib camelCase; composables prefixed `use` (`useRealtime.ts`); SQL migrations `YYYYMMDD[letter]_name.sql`.
- **Commits**: Conventional Commits with scopes — `feat(workstation): …`, `fix(landing): …`, `feat(meet): …`.

## Architecture Notes

- **Boot order matters**: `main.ts` restores the Supabase session (`authStore.init()`) and awaits `router.isReady()` **before** mounting, to avoid a layout flash. Preserve that ordering.
- **RLS is the source of truth for roles** (`docs/roles.md`): ladder `superadmin > admin > pm > va > sales > client`. SQL helpers: `is_ops()`, `accessible_client_ids()`, `can_manage_client()`, `is_staff()`. People/money are admin+; PMs read‑only there. Engagements live in `assignments`.
- **Supabase client** (`src/lib/supabase.ts`) targets the `buzzybee` schema with realtime tuned for backgrounded tabs (Web Worker heartbeat + auto‑reconnect).
- **Mixed naming**: package/schema `buzzybee`, UI brand "BuzzyHive" (was "HiveMind"), Electron appId `co.hivemind.ai` (internal id, intentionally unchanged). The `buzzybee` Postgres schema and the `hivemind_enabled` column are internal identifiers — never rename them as part of brand work.
- **Ports**: app 5175 · landing 5176 · electron renderer 5177. `dist/` + `dist-landing/` are gitignored build outputs.

## Working Agreements (for Claude Code)

- Prefer small, scoped edits; **do not reformat** untouched code.
- When touching the DB, add a new timestamped migration in `supabase/migrations/` — don't edit applied ones.
- Use the `@/` alias for `src` imports, not long relative paths.
- After non‑trivial changes, sanity‑check types with `npm run build` (root) — that's the only typecheck gate.
- Treat RLS/roles as authoritative; don't bypass auth guards client‑side.
