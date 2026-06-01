# HiveMind Dialer

Built-in softphone embedded in the HiveMind Electron app. Outbound-first, recording-enabled, Telnyx-backed. Designed to feed call audio into HiveMind's existing AI agents (Gemini/Groq) once the outbound MVP is solid.

---

## Why we built this instead of buying

We compared building vs RingCentral Advanced for a 10-seat sales team at ~50k mins/mo:

| | RingCentral Advanced | This (Telnyx + custom) |
|---|---|---|
| Per-seat fee | $35 × 10 = $350/mo | $0 |
| Outbound minutes | bundled | $0.007 × 50k ≈ $370/mo |
| Recording | extra add-on | $0.002 × 50k ≈ $100/mo |
| DIDs | included | $1 × 10 = $10/mo |
| **Monthly total** | **~$350-450** | **~$480** |

Cost is roughly tied. The justification is **strategic**, not financial:

1. **AI integration** — call audio lands in our pipeline, not behind a webhook bolted on top of someone else's product. HiveMind's coach/summary/action-items agents reuse the recording directly.
2. **CRM-tight call logging** — calls link to `clients` / `tickets` rows in Supabase via foreign keys, not via brittle integration layer.
3. **No per-seat tax at scale** — when sales team grows past 20 with uneven usage, RingCentral's flat fee becomes pure waste; carrier-rate billing only charges for what we use.
4. **Power-dialer friendly** — RingCentral throttles or upcharges for high-volume short calls. Carrier billing doesn't care.

---

## Stack

- **Carrier:** Telnyx (DIDs + SIP trunking + server-side recording)
- **WebRTC client:** [`@telnyx/webrtc`](https://github.com/team-telnyx/webrtc) running in the Electron renderer
- **Auth:** JWT issued by Electron main process. Telnyx API key lives in `process.env.TELNYX_API_KEY`, never reaches renderer.
- **Recording:** Telnyx-side (more reliable than browser `MediaRecorder` — survives Electron crash / network blip). Recording URL delivered via webhook → Supabase Edge Function → `dialer_calls.recording_url`.
- **Persistence:** Supabase tables `dialer_phone_numbers` and `dialer_calls` (RLS-protected).
- **Storage:** Telnyx hosts recordings short-term; we copy to Supabase Storage `dialer-recordings/` bucket on webhook receipt for long-term retention.

---

## Directory layout

```
electron/main/dialer/
  README.md                  ← this file
  telnyx-token.ts            ← JWT issuance for renderer (Phase 1)
  call-log-service.ts        ← writes call rows to Supabase (Phase 1)

electron/preload/dialer.ts   ← IPC bridge (Phase 1)

electron/renderer/components/dialer/
  DialerPanel.vue            ← container + dialpad (Phase 1)
  Dialpad.vue                ← numpad component (Phase 1)
  ActiveCall.vue             ← in-call view: mute, DTMF, hangup, duration (Phase 1)
  CallHistory.vue            ← past calls + recording playback (Phase 2)

electron/renderer/composables/
  useDialer.ts               ← wraps @telnyx/webrtc (Phase 1)

supabase/migrations/
  20260511_dialer_init.sql   ← tables + RLS (Phase 0, done)

supabase/functions/dialer-webhook/
  index.ts                   ← Telnyx webhook handler (Phase 2)
```

---

## IPC channels (to be added in Phase 1)

```ts
// renderer → main (invoke)
DIALER_GET_TOKEN: 'dialer:get-token'              // returns Telnyx JWT
DIALER_LOG_CALL: 'dialer:log-call'                // persists call row to Supabase
DIALER_LIST_CALLS: 'dialer:list-calls'            // history for current agent

// main → renderer (send)
DIALER_INCOMING_CALL: 'dialer:incoming-call'      // Phase 4 only
```

The actual SIP signaling and audio happen entirely in the renderer — main process only mediates auth + persistence. Keep IPC thin.

---

## Phased roadmap

### Phase 0 — Foundation (current)
- [x] README
- [x] Supabase migration (tables + RLS)
- [ ] Telnyx account, buy 1-2 test DIDs, capture API key in `.env`
- [ ] Verify schema applies cleanly to Supabase

### Phase 1 — Outbound MVP (~Week 1)
- [ ] `telnyx-token.ts` — JWT issuance in main process
- [ ] `useDialer.ts` composable wrapping `@telnyx/webrtc`
- [ ] `DialerPanel.vue` + `Dialpad.vue` + `ActiveCall.vue`
- [ ] `call-log-service.ts` — write `dialer_calls` row on call start/end
- [ ] DTMF, mute, hangup, call duration timer
- [ ] Manual test: dial PH and US numbers from a single dev seat

### Phase 2 — Recording + history (~Week 2)
- [ ] Enable Telnyx server-side recording on outbound trunk
- [ ] Supabase Edge Function `dialer-webhook` (verify Telnyx signature, update `recording_url`)
- [ ] Copy recording from Telnyx → Supabase Storage `dialer-recordings/`
- [ ] `CallHistory.vue` — list with date, duration, outcome, playback
- [ ] Pre-call recording disclosure modal (compliance — see below)

### Phase 3 — CRM tie-in (~Week 2-3)
- [ ] Custom protocol handler `hivemind://dial?number=...&clientId=...&ticketId=...`
- [ ] "Call" buttons on Clients/Tickets views in BuzzyBee SPA
- [ ] Auto-populate `client_id` / `ticket_id` on `dialer_calls` from deep-link params
- [ ] Per-agent DID assignment UI (admin)
- [ ] Post-call notes input → `dialer_calls.notes`

### Phase 4 — Inbound (deferred — must wait for Phase 1-3 to be solid)
**Do not start until outbound has been in daily use by ≥3 reps for ≥2 weeks without incident.** Inbound brings ring routing, presence, missed-call handling, and voicemail — all of which compound failure modes if outbound isn't rock-solid first.

- [ ] Inbound call event in `useDialer` (incoming-call ringer)
- [ ] Per-agent DID inbound routing (Telnyx call control: route to agent's SIP user)
- [ ] Presence/availability state (`dialer_agent_status` table: available/busy/offline)
- [ ] Missed-call notification + voicemail (Telnyx voicemail-to-email or store in Supabase)
- [ ] Reverse number lookup against `clients.phone` for caller-ID display
- [ ] Inbound recording (same pipeline as outbound)

### Phase 5 — AI integration (HiveMind core value)
- [ ] On call end, push recording URL to existing `summary-agent` (Gemini)
- [ ] Action items from call → auto-create rows in `tasks` (existing table)
- [ ] Coach prompts during live call via existing `coach-agent` (requires live transcription wired into the WebRTC stream)

---

## Compliance notes

- **PH (one-party consent):** Caller can record without other party's permission. Most sales calls are PH→PH or PH→US.
- **US (mixed):** Two-party consent in CA, FL, IL, MD, MA, MT, NV, NH, PA, WA. As a courtesy and to avoid grey areas, we play a "this call is being recorded" disclosure when the destination country code is `+1` (handled in `ActiveCall.vue` pre-dial).
- **DNC (Do Not Call):** Manual scrub for now — Phase 3 adds a `clients.do_not_call` flag check before allowing dial.
- **A2P 10DLC (US SMS):** Not required. Voice only.
- **GDPR:** Recordings retain 90 days then auto-purge from Supabase Storage (Phase 2 includes a cron via `pg_cron` or a scheduled Edge Function).

---

## Cost model (10 agents, ~50k mins/mo)

| Item | Rate | Monthly |
|---|---|---|
| DIDs | $1 × 10 | $10 |
| Outbound minutes | $0.007 × 50,000 | $350 |
| Recording (Telnyx) | $0.002 × 50,000 | $100 |
| Supabase Storage (recordings, ~10 GB/mo at ~12 KB/sec mono Opus) | $0.021/GB | ~$0.21 |
| **Total carrier+infra** | | **~$460/mo** |

Per-seat amortized: $46/seat/mo at 10 seats, drops to **$24/seat/mo at 20 seats** (vs RingCentral's flat $35/seat regardless of headcount).

---

## Open decisions to revisit

1. **Shared outbound caller ID vs per-agent DID** — start with one shared DID for MVP simplicity; assign per-agent in Phase 3 once we know inbound routing matters.
2. **Telnyx `Call Control API` vs WebRTC SDK only** — WebRTC SDK alone covers MVP. Call Control API unlocks server-side dial-out, conferencing, transfer (Phase 3+).
3. **Recording storage retention** — default 90 days, may need to extend for compliance/coaching review (TBD with sales leadership).
