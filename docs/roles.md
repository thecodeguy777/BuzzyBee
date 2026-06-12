# Roles & access — the canonical matrix

> Source of truth for who can touch what. RLS enforces this server-side; the UI
> only mirrors it. When adding a table, scope it with the helpers below — do
> not invent a new pattern.

## The model (settled 2026-06-12)

A strict ladder — each tier contains everything below it:

| Role | Mental model | Workspace access |
|---|---|---|
| `superadmin` | Owns the company | everything + mints admins + dangerous settings |
| `admin` | Runs the company | everything PM has + staffing, clients, contracts, invites. *Operates as a PM day-to-day while the client base is small.* |
| `pm` | Runs the work (roaming QA/ops) | **every** client workspace — work, coach, reassign, report. People & money **read-only**. Emergency brake: may pause/resume an engagement. |
| `va` | Does the work | assigned workspaces only (1:1 typical, 1:many supported) |
| `sales` | Outbound staff | via assignments only (semantics TBD) |
| `client` | Watches their slice (Phase 1 — no users yet) | exactly one workspace (`profiles.client_id`) |

## Who clicks what

| Action | superadmin | admin | pm | va |
|---|---|---|---|---|
| Create / archive clients; set tier, rate, hours | ✓ | ✓ | — | — |
| Place a VA (engagement: hours, seat, supervising PM) | ✓ | ✓ | — | — |
| **Pause / resume** an engagement | ✓ | ✓ | ✓ (column-guarded) | — |
| End / resize / restaff an engagement | ✓ | ✓ | — | — |
| Invite staff / client users | ✓ | ✓ | — | — |
| Promote/demote roles, create admins | ✓ | — | — | — |
| Work inside any workspace (tasks, CRM, comms, time, reports) | ✓ | ✓ | ✓ | assigned only |
| Log CRM activities | ✓ | ✓ | ✓ | assigned clients |

## The helpers

- **`is_ops()`** — pm/admin/superadmin. The "runs the work" tier.
- **`accessible_client_ids()`** — ops → all clients; VA/sales → active
  assignments; client users → own `profiles.client_id`. Use as
  `client_id in (select buzzybee.accessible_client_ids())`.
- **`can_manage_client(client_id)`** — content-management rights (CRM
  structure, campaigns): currently `is_ops()`. Staffing/contracts are NOT this
  — they're table-level admin policies.
- **`is_staff()`** — any non-client role. Gates everything customers must
  never see (the entire CRM).
- **`is_client_pm(pid, cid)`** — *legacy name, redefined 20260612h*: now a
  roaming role check (ignores `cid`). Kept so the 20260430-era policies didn't
  need rewriting. Don't use in new code — prefer `is_ops()`.
- **`is_ticket_triager()`** — pm/admin/superadmin (tickets).

Derived tables (no `client_id`): scope through the parent and let the parent's
RLS filter the subquery (`exists (select 1 from crm_companies c where c.id =
company_id)`).

## Engagements (`assignments`)

The staffing record: `va_id + client_id + supervising pm_id + status
(active/paused/ended) + started_at/ended_at + hours_per_week + seat_title`.
- Created/resized/ended by **admin+** only.
- PMs may flip `active ↔ paused` (column guard `tg_assignments_guard_columns`
  blocks everything else).
- `hours_per_week` × time_entries = utilization; `seat_title` is the
  client-facing roster label; started/ended history = tenure.
- **`client_pms` is dormant** — PM access is role-based now. Don't extend it.

## Invariants

1. **Workspaces belong to different companies.** Nothing crosses client
   boundaries by default; sharing is an explicit feature (see 20260612c).
2. **The CRM is the agency's brain about clients, not for them.** `is_staff()`
   on every CRM read, forever.
3. **People & money are admin+.** Client records (rate/tier/status), staffing,
   invites, roles. PMs read, never write.
4. **Dollar values are internal** anywhere client-visible (the comms announcer
   already omits deal values).
5. **Before Phase 1 (client logins) ship:** `channels.client_visible`, comms +
   storage policy audit for the client role, time-summary shape. No client
   users until that audit passes.

## History

- `20260430*` — original task/project/client policies (assignment-scoped).
- `20260610g` — CRM writes scoped to pm/admin; reads left authenticated-wide.
- `20260612c` — email templates client-isolated (triggering decision).
- `20260612f` — tickets: triage roles, column guard, notifications.
- `20260612g` — Phase 0: unified helpers; CRM suite + campaigns + templates +
  task_statuses scoped; `client` role + `profiles.client_id` groundwork.
- `20260612h` — roaming PMs: `is_ops()`, `is_client_pm` redefined role-based,
  clients writes admin+, engagement pause guard, engagement enrichment
  (`hours_per_week`, `seat_title`), `client_pms` dormant.
