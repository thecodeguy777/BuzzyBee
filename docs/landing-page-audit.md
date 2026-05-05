# BuzzyBee Landing Page — Audit

**Repo:** `C:\Users\mary\repos\BuzzyBee`
**Audit date:** 2026-04-30
**Purpose:** Source of truth for the Workstation design system. Read this before scaffolding `apps/workstation` so the brand carries forward without drift.

---

## 1. Stack

| Layer | Version | Notes |
|---|---|---|
| Vue | 3.5.30 | Composition API + `<script setup>` throughout |
| Vite | 8.0.3 | Two configs: main (`vite.config.ts`) + landing-only (`vite.config.landing.ts`) |
| TypeScript | 5.9.3 | Strict mode, `vue-tsc` build step |
| Tailwind CSS | **4.2.2 (v4)** | **No `tailwind.config.js`** — themes/tokens declared inline in `src/style.css` via `@plugin` directives. Plugin: `@tailwindcss/vite`. |
| DaisyUI | 5.5.19 | Theming layer (oklch). Light + dark themes already wired. |
| Pinia | 3.0.4 | Registered in `src/main.ts` |
| Vue Router | 4.6.4 | History mode; meta flags `requiresAuth`, `bareLayout` |
| Icons | lucide-vue-next 1.0.0 | Plus custom SVGs imported via `?raw` |

Path alias: `@` → `/src`. Dev ports: 5175 (main), 5176 (landing).

---

## 2. Design tokens

All tokens live in `src/style.css`, declared via DaisyUI `@plugin` blocks (oklch space). Hex columns are sRGB approximations for reference only — **the canonical values are oklch.**

### Brand & semantic colors

| Token | Light (oklch) | Dark (oklch) | Hex ≈ |
|---|---|---|---|
| **primary** (honey) | `oklch(78% 0.17 85)` | `oklch(80% 0.18 85)` | `#E8B84D` |
| **secondary** (mint) | `oklch(82% 0.07 175)` | — | `#A8D5BA` |
| **accent** (coral) | `oklch(72% 0.17 20)` | — | `#E67E50` |
| base-100 | `oklch(98% 0.018 80)` | — | near-white, warm |
| base-200 | `oklch(95% 0.028 80)` | — | light warm gray |
| base-300 | `oklch(91% 0.04 80)` | — | medium warm gray |
| neutral (dark) | `oklch(14% 0.005 285.823)` | — | near-black |
| neutral (light) | `oklch(92% 0.004 286.32)` | — | off-white |
| info | `oklch(74% 0.16 232.661)` | — | blue |
| success | `oklch(76% 0.177 163.223)` | — | green |
| warning | `oklch(82% 0.189 84.429)` | — | amber |
| error | `oklch(71% 0.194 13.428)` | — | red |

> ⚠️ The build plan doc cites `#b8860b` as primary honey. The deployed value is significantly warmer/brighter (≈ `#E8B84D`). Treat the repo as source of truth.

### Radii / borders

```
--radius-selector: 0.5rem
--radius-field:    0.25rem
--radius-box:      0.5rem
--border:          1px
```

No custom spacing scale; Tailwind defaults apply.

---

## 3. Typography

Loaded via Google Fonts at the top of `src/style.css`:

| Family | Weights | Class | Usage |
|---|---|---|---|
| **Playfair Display** | 400 / 600 / 700 (+ italics) | `.font-display` | All `h1`–`h3`, brand moments |
| **DM Sans** | 300 / 400 / 500 / 600 / 700 | (body default) | All UI body text; antialiased |
| **JetBrains Mono** | 400 / 500 | `.font-mono` | Sparingly for technical/code |

---

## 4. Animations & utilities

**Keyframes** (in `src/style.css`, lines ~75–132):

| Name | Effect | Duration | Used for |
|---|---|---|---|
| `reveal` / `reveal-up` / `reveal-down` / `reveal-left` / `reveal-right` | Fade + directional slide | 0.7s cubic-bezier | Scroll-triggered entrance |
| `drift` / `drift-rev` | Float + rotate | 7–8s | Decorative bee assets |
| `bob` | Vertical float | 4s | Subtle floating elements |
| `twinkle` | Opacity + scale pulse | 3.5s | Hero confetti sparkles |
| `shimmer` | Background-position slide | — | Gradient highlights |

**Utility classes:**
- `.bg-honeycomb` — radial-gradient pattern at 8% primary, 120×140px tile
- `.anim-drift`, `.anim-drift-rev`, `.anim-bob`, `.anim-twinkle`
- `.reveal`, `.reveal-up`, `.reveal-down`, `.reveal-left`, `.reveal-right`

**Directive:** `v-reveal` (registered globally in `src/main.ts`)
- File: `src/directives/reveal.ts`
- IntersectionObserver, threshold 0.12, rootMargin `-40px` bottom
- Modifiers: `.up` `.down` `.left` `.right`; delay via ms or config object
- Respects `prefers-reduced-motion`

---

## 5. Components

### `src/components/landing/`

| File | Purpose |
|---|---|
| `HeroSection.vue` | Hero with bee illustration, badge, dual CTA, stats grid; radial backdrop + confetti |
| `SectionWave.vue` | Wave divider between sections; props: variant (`amber-mint` / `mint-amber` / `cream`), height; 28s SVG drift |
| `HowItWorksSection.vue` | 5-step process flow; data-driven step cards; `v-reveal` |
| `WhyUsSection.vue` | 4 pillar cards (pay / platform / people / process) with stat badges |
| `PricingSection.vue` | 3 tiers (Starter / Professional / Specialist), feature list, highlight flag |
| `TestimonialsSection.vue` | 5 testimonial cards, avatar SVGs, quote + attribution |
| `FaqSection.vue` | 8-item Q&A accordion, controlled toggle state |
| `FinalCtaSection.vue` | Closing CTA on primary background, bob animation, honeycomb decoration |
| `BeeMark.vue` | Inline bee SVG renderer using raw import + ID prefixing |
| `ValleyScene.vue` | Decorative full-bleed parallax background (sun + 3 layers) |

### `src/components/shared/`

| File | Purpose |
|---|---|
| `AppLayout.vue` | Authenticated/admin layout wrapper (header + nav + slot) |
| `SvgCrop.vue` | SVG viewport cropper utility (viewBox extraction) |

---

## 6. Views & router

| Path | Purpose |
|---|---|
| `src/views/shared/LandingPage.vue` | Orchestrates all landing sections |
| `src/views/shared/AssetsPreview.vue` | Design-system preview page |
| `src/views/admin/Dashboard.vue` | **Admin dashboard stub already in place** |

Router meta keys in use: `requiresAuth: boolean`, `bareLayout: boolean`. Auth guard not yet implemented but the meta hook is ready.

---

## 7. Build & deploy

**`package.json` scripts:**

| Script | Command | Purpose |
|---|---|---|
| `dev` | `vite` | Main app dev server, port 5175 |
| `dev:landing` | `vite --config vite.config.landing.ts` | Landing-only dev, port 5176 |
| `build` | `vue-tsc -b && vite build` | Type-check + prod build → `dist/` |
| `build:landing` | `vite build --config vite.config.landing.ts` | Landing-only → `dist-landing/` |
| `preview` | `vite preview` | Local prod preview |

**Vite configs:** Both use `@tailwindcss/vite` + Vue plugin; main also includes Vue DevTools. Path alias `@` → `/src`.

**`netlify.toml`:**
```toml
[build]
  command = "npm run build"
  publish = "dist"
[build.environment]
  NODE_VERSION = "20"
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```
Standard SPA fallback for Vue Router history mode.

---

## 8. Reusable patterns for the Workstation

These are the bits worth carrying directly into `apps/workstation` (or wherever the workstation lives) without rebuilding:

- **SVG handling** — `?raw` query imports + `prefixSvgIds()` in `src/utils/svg.ts` to avoid ID collisions when rendering multiple instances.
- **`v-reveal` directive** — self-contained, copy `src/directives/reveal.ts` and register in workstation `main.ts`. Skip if the workstation is mostly dense data UI rather than scroll narratives.
- **`SectionWave` divider** — three variants ready to go for marketing-adjacent surfaces (login screen, onboarding).
- **Hero structure template** — useful for login screen and empty states.
- **Data-driven section components** — `HowItWorksSection`, `PricingSection`, etc. are good reference patterns for content-config-driven Vue.
- **DaisyUI theme** — workstation can inherit the existing themes and add a workstation-specific theme (cooler neutrals, denser spacing) rather than redefining tokens from scratch.
- **Bee + icon assets** — `src/assets/*.svg`, `src/assets/icons/*.svg`, `src/assets/avatars/*.svg` are ready to copy.

---

## 9. Notes for build-plan revision

Five mismatches between `buzzybee-build-plan.md` and the actual repo state. Worth reconciling before Phase 0 scaffolding:

1. **Tailwind v4, no JS config.** Build plan §"Build order for design system" step 2 says "extend `tailwind.config.js`." That file does not exist — Tailwind v4 declares tokens in CSS via `@theme` / `@plugin`. If we extract a shared `packages/design-tokens`, it should be a CSS module (or a thin TS module emitting CSS), not a Tailwind JS config.

2. **Primary honey hex is wrong in the plan.** Plan says `#b8860b`. Actual oklch primary is `oklch(78% 0.17 85)` ≈ `#E8B84D` — significantly warmer/brighter. Update the plan's "Brand carryover" section.

3. **DaisyUI already provides semantic tokens + dark mode.** Plan §"New tokens needed for Workstation" lists status colors, semantic tokens, and "dark mode pair for every token" as net-new. Most of that is already in place via DaisyUI. The workstation effort should be: add a workstation-specific DaisyUI theme variant with cooler neutrals + tighter density, not reinvent the token system.

4. **Admin shell already scaffolded.** `src/views/admin/Dashboard.vue` + `src/components/shared/AppLayout.vue` + router `requiresAuth` meta exist. The "Tauri-only desktop app vs. extend the existing Vite app under `apps/workstation/` (and wrap in Tauri later)" decision should weigh this. There's an argument for building the workstation as a Vue route group inside the same app first, then packaging it in Tauri, rather than starting a fresh shell.

5. **Dual-build precedent already exists.** `vite.config.landing.ts` runs a second Vite entrypoint from the same root (publishing to `dist-landing/`). That's a lighter-weight alternative to a pnpm-workspaces monorepo if the only goal is "one source tree, two deployable artifacts." Worth weighing against the full monorepo recommendation in the plan.

---

---

## 10. Open-questions answers (locked 2026-04-30)

Decisions captured from Jayson during audit handoff:

| Question | Decision |
|---|---|
| **Repo shape** | **Stay single repo.** Build Workstation as a Vue route group inside the existing Vite app, reusing `AppLayout.vue` + router `requiresAuth` meta. Wrap in Tauri later. Leverage the existing dual-build pattern (`vite.config.landing.ts`). No pnpm workspaces, no `apps/*` restructure. |
| **OS mix** | **Mixed (10–30% Mac).** macOS native audio capture is in scope for Phase 2 alongside Windows. Budget ~1–2 extra weeks for Apple privacy/permission handling. |
| **Asana sync** | **Two-way.** Read tasks AND mark-complete syncs back to Asana. Higher integration cost but right long-term — VAs should not bounce back to Asana to update status. |
| **Activity tracking default** | **Off by default, opt-in per client.** Wording: "Activity log," never "monitoring." Screenshot capture off regardless. Position privacy-first stance as a differentiator vs. NexusPoint/Cyberbacker. |
| **Supabase region** | **US-East (Virginia).** Optimizes for US client trust + finance/compliance comfort. PH latency (~200ms) is acceptable since real-time pieces (Deepgram transcription, Slack webhooks) sit outside Supabase. |
| **HiveMind consent disclosure** | **Deferred to Phase 2 prep.** Revisit Week 6–7 when HiveMind build starts. ⚠️ Hard gate: nothing records a real client call until VA consent script + MSA recording clause are drafted and legally reviewed. Flag this on the Phase 2 kickoff. |

---

**Status:** Audit complete; open questions resolved. Ready to proceed to Phase 0 scaffolding under the "single repo, workstation as route group" model.
