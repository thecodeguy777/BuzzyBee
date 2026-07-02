# Email Blasting — Launch Checklist & Roadmap

_Last updated: 2026-07-02. State of the CRM email-campaign pipeline and what's
left before/after the LLC + domain exist._

## Where it stands

The pipeline (composer → `send-campaign` → Resend → `resend-webhook` → report)
is compliance-ready as of 2026-07-02:

- Per-recipient **unsubscribe links** (HMAC-signed tokens → public `unsubscribe`
  edge function; GET = confirm page, POST = one-click/RFC 8058) and
  `List-Unsubscribe` headers on every email.
- **Suppression**: spam complaints auto-unsubscribe the contact; non-transient
  bounces set `crm_contacts.email_bounced_at`. Audience builder AND sender both
  exclude unsubscribed/complained/bounced/invalid (recipients marked `skipped`
  with a reason).
- **Send hardening**: atomic claim (no double-send), stale `sending` takeover
  after 15 min (crashed sends are resumable), plain-text part, subject
  personalization, per-recipient email validation.
- **RLS**: campaigns/recipients readable by staff within accessible clients
  only (was: any authenticated user).

## One-time setup still required (dashboard, not code)

- [ ] **Supabase → Edge Functions → Secrets**: add `UNSUBSCRIBE_SECRET`
      (any long random string; shared by `send-campaign` + `unsubscribe`).
      Campaign sends hard-fail without it — intentional.
- [ ] **Resend dashboard → Webhooks**: add the `email.complained` event to the
      existing webhook (currently opened/clicked/bounced only).

## After the LLC exists

- [ ] Set `SENDER_POSTAL_ADDRESS` edge-function secret (physical address in
      every footer — CAN-SPAM requires it).

## After the domain exists

- [ ] Verify the domain in Resend (Domains → Add).
- [ ] DNS: **SPF** + **DKIM** records Resend gives you; **DMARC** starting at
      `p=none`, tighten to `quarantine` once reports look clean.
- [ ] Send blasts from a **subdomain** (e.g. `mail.buzzyhive.com`), not the
      root — protects the main domain's reputation.
- [ ] Replace `onboarding@resend.dev` default: set real `from_email` in
      campaigns; add a monitored reply-to.
- [ ] Enable open/click tracking for the domain in Resend (the report tab is
      already wired to the webhook).
- [ ] **Warm up**: hundreds/day at first, ramp over 2–4 weeks. Watch the
      complaint rate — Gmail junks bulk senders above ~0.3%.

## Standing policy

- **The ~6.3k dialer-import leads are cold contacts.** Resend's terms allow
  opted-in mail only — blasting that list risks account suspension and instant
  domain-reputation damage. Cold outreach = separate channel (the
  `crm_campaigns.transport = 'gmail'` value was reserved for connected-mailbox
  sequences later). Blasts = warm/opted-in contacts only.

## Nice-to-haves (not blocking)

- Per-recipient delivery detail view in the campaign report (statuses/reasons
  exist on `crm_campaign_recipients`, UI shows aggregates only).
- Manual "mark unsubscribed" toggle on the contact drawer (for reply-based
  opt-outs).
- Segment-level suppression list UI (view/manage all opted-out contacts).
- `email.delivered` webhook event → true delivered counts (vs. accepted).
- Global suppression across client workspaces (same address unsubscribed under
  one client is still mailable from another).
