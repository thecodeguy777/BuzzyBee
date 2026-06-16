// run-flow: the executor for the form-triggered automation engine
// ("level 2 — fire on submit").
//
// Flow of control:
//   form submitted -> DB trigger creates a buzzybee.flow_runs row (status
//   'pending') and pg_net POSTs { run_id } here. We load the flow's node graph
//   + the submission, execute each reachable node once in order, and write a
//   per-step log back onto the run (status -> succeeded | failed).
//
// Auth: the caller is the database, not a logged-in user, so JWT is disabled.
// Instead we compare an `x-flow-secret` header against
// buzzybee.integration_settings('flow_runner_secret') — the same value the
// trigger reads. Nothing to set in env beyond what Supabase injects.
//
// Node registry (v1): start, email, webhook, http, task, comms, status.
// Adding a node type later = adding one entry to EXECUTORS below.

import { createClient } from 'npm:@supabase/supabase-js@2'

const DEFAULT_FROM = 'onboarding@resend.dev' // until a sending domain is verified

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-flow-secret',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// ── {{token}} templating ──────────────────────────────────────────────────
// Resolves {{answers.<fieldId>}}, {{form.title}}, {{response.id}}, or a bare
// {{<fieldId>}}, against the run context. Missing values resolve to ''.
type Ctx = Record<string, any>
function resolvePath(path: string, ctx: Ctx): string {
  const key = path.trim()
  const out = (v: any) => (v == null ? null : (typeof v === 'string' ? v : JSON.stringify(v)))
  // 1) dotted path — {{answers.f24-fy3}}, {{form.title}}, {{source.x}}
  let cur: any = ctx
  for (const part of key.split('.')) { cur = cur?.[part]; if (cur == null) break }
  if (cur != null) return out(cur) ?? ''
  // 2) bare answer id — {{f24-fy3}}
  if (ctx.answers && ctx.answers[key] != null) return out(ctx.answers[key]) ?? ''
  // 3) human field name (case-insensitive) — {{First name}}, {{Email}}
  if (ctx.labels && typeof ctx.labels === 'object') {
    const hit = Object.keys(ctx.labels).find((l) => l.toLowerCase() === key.toLowerCase())
    if (hit && ctx.labels[hit] != null && ctx.labels[hit] !== '') return out(ctx.labels[hit]) ?? ''
  }
  return ''
}
function tmpl(input: unknown, ctx: Ctx): string {
  return String(input ?? '').replace(/\{\{([^}]+)\}\}/g, (_m, p) => resolvePath(p, ctx))
}

// ── node executors ──────────────────────────────────────────────────────────
type ExecResult = { output?: unknown; error?: string }
// deno-lint-ignore no-explicit-any
type Admin = any

async function execEmail(cfg: any, ctx: Ctx, admin: Admin): Promise<ExecResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return { error: 'RESEND_API_KEY not configured' }
  const to = tmpl(cfg.to, ctx).trim()
  if (!to || !to.includes('@')) return { error: `no valid recipient (resolved "${to}")` }

  // A picked Email Studio design (crm_email_templates) supplies the already-
  // compiled HTML + subject; otherwise we use the plain subject/body typed in.
  let subject = cfg.subject
  let bodyHtml = cfg.body ?? cfg.bodyHtml ?? ''
  if (cfg.templateId) {
    const { data: tpl } = await admin.from('crm_email_templates').select('subject, body_html').eq('id', cfg.templateId).maybeSingle()
    if (!tpl) return { error: 'email design not found' }
    subject = (cfg.subject && String(cfg.subject).trim()) ? cfg.subject : (tpl.subject ?? '')
    bodyHtml = tpl.body_html ?? ''
  }

  subject = tmpl(subject, ctx) || '(no subject)'
  // A design is already a complete email; a plain body gets a light wrapper.
  const html = cfg.templateId
    ? tmpl(bodyHtml, ctx)
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#33313a">${tmpl(bodyHtml, ctx)}</div>`
  const from = cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail || DEFAULT_FROM}>` : (cfg.fromEmail || DEFAULT_FROM)

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  })
  if (!resp.ok) return { error: `Resend ${resp.status}: ${(await resp.text()).slice(0, 200)}` }
  const data = await resp.json().catch(() => null)
  return { output: { to, id: data?.id ?? null, design: cfg.templateId ?? null } }
}

async function execHttp(cfg: any, ctx: Ctx, isWebhook: boolean): Promise<ExecResult> {
  const url = tmpl(cfg.url, ctx).trim()
  if (!/^https?:\/\//.test(url)) return { error: `invalid url "${url}"` }
  const method = String(cfg.method || (isWebhook ? 'POST' : 'GET')).toUpperCase()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(cfg.headers || {}) }
  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    body = cfg.body != null ? tmpl(cfg.body, ctx)
      : JSON.stringify({ form: ctx.form, answers: ctx.answers, response: ctx.response })
  }
  const resp = await fetch(url, { method, headers, body })
  const text = await resp.text().catch(() => '')
  if (!resp.ok) return { error: `HTTP ${resp.status}: ${text.slice(0, 200)}` }
  return { output: { status: resp.status, body: text.slice(0, 500) } }
}

async function execTask(cfg: any, ctx: Ctx, admin: Admin): Promise<ExecResult> {
  const client_id = cfg.client_id || ctx.form.client_id
  const project_id = cfg.project_id || ctx.form.project_id
  if (!client_id || !project_id) return { error: 'task needs client_id + project_id (set them on the form or the node)' }
  let status = cfg.status
  if (!status) {
    const { data: st } = await admin.from('task_statuses').select('key').eq('project_id', project_id).order('sort_order').limit(1).maybeSingle()
    status = st?.key || 'todo'
  }
  const priority = ({ urgent: 1, high: 2, normal: 3, low: 4 } as Record<string, number>)[String(cfg.priority || 'normal').toLowerCase()] || 3
  const { data, error } = await admin.from('tasks').insert({
    client_id, project_id,
    title: tmpl(cfg.title, ctx) || `From form: ${ctx.form.title}`,
    description: cfg.description ? tmpl(cfg.description, ctx) : null,
    status, priority,
    created_by: ctx.form.created_by,
  }).select('id').single()
  if (error) return { error: error.message }
  return { output: { task_id: data.id } }
}

async function execComms(cfg: any, ctx: Ctx, admin: Admin): Promise<ExecResult> {
  if (!cfg.channel_id) return { error: 'comms node needs a channel_id' }
  if (!ctx.form.created_by) return { error: 'no author (form has no created_by)' }
  const { data, error } = await admin.from('messages').insert({
    channel_id: cfg.channel_id,
    user_id: ctx.form.created_by,
    user_name: cfg.author_name || 'Automation',
    body: tmpl(cfg.text ?? cfg.body, ctx),
  }).select('id').single()
  if (error) return { error: error.message }
  return { output: { message_id: data.id } }
}

async function execStatus(cfg: any, ctx: Ctx, admin: Admin): Promise<ExecResult> {
  const taskId = ctx.response.created_task_id
  if (!taskId) return { error: 'no task to update (the form created none)' }
  if (!cfg.status) return { error: 'status node needs a status' }
  const { error } = await admin.from('tasks').update({ status: cfg.status }).eq('id', taskId)
  if (error) return { error: error.message }
  return { output: { task_id: taskId, status: cfg.status } }
}

const EXECUTORS: Record<string, (cfg: any, ctx: Ctx, admin: Admin) => Promise<ExecResult>> = {
  start: async () => ({ output: 'trigger' }),
  email: (cfg, ctx, admin) => execEmail(cfg, ctx, admin),
  webhook: (cfg, ctx) => execHttp(cfg, ctx, true),
  http: (cfg, ctx) => execHttp(cfg, ctx, false),
  task: (cfg, ctx, admin) => execTask(cfg, ctx, admin),
  comms: (cfg, ctx, admin) => execComms(cfg, ctx, admin),
  status: (cfg, ctx, admin) => execStatus(cfg, ctx, admin),
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'buzzybee' } })

    // ── custom auth: shared secret from integration_settings ──
    const { data: secretRow } = await admin.from('integration_settings').select('value').eq('key', 'flow_runner_secret').single()
    const expected = secretRow?.value
    if (!expected || req.headers.get('x-flow-secret') !== expected) return json({ error: 'unauthorized' }, 401)

    const { run_id } = await req.json()
    if (!run_id) return json({ error: 'run_id required' }, 400)

    const { data: run, error: runErr } = await admin.from('flow_runs').select('*').eq('id', run_id).single()
    if (runErr || !run) return json({ error: 'run not found' }, 404)
    if (run.status !== 'pending') return json({ skipped: true, status: run.status }) // idempotent: never double-run

    await admin.from('flow_runs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', run_id)

    const { data: flow } = await admin.from('flows').select('graph').eq('id', run.flow_id).single()
    const { data: response } = await admin.from('form_responses')
      .select('id, values, form_id, created_task_id, submitted_at').eq('id', run.form_response_id).single()
    const { data: form } = await admin.from('forms')
      .select('id, title, structure, client_id, project_id, created_by').eq('id', response?.form_id).single()

    // ── build the run context (answers + handy lookups, threaded to every node) ──
    const labels: Record<string, string> = {}
    for (const step of (form?.structure?.steps ?? [])) {
      for (const fld of (step.fields ?? [])) {
        if (fld?.props?.label != null) {
          const val = response?.values?.[fld.id]
          labels[fld.props.label] = val == null ? '' : String(val)
        }
      }
    }
    const ctx: Ctx = {
      answers: response?.values ?? {},
      labels,
      form: { id: form?.id, title: form?.title, client_id: form?.client_id, project_id: form?.project_id, created_by: form?.created_by },
      response: { id: response?.id, created_task_id: response?.created_task_id, submitted_at: response?.submitted_at },
      outputs: {},
    }

    // ── walk the graph: start → its successors → theirs … (each node once) ──
    const nodes: any[] = flow?.graph?.nodes ?? []
    const edges: any[] = flow?.graph?.edges ?? []
    const byId: Record<string, any> = Object.fromEntries(nodes.map((n) => [n.id, n]))
    const out: Record<string, string[]> = {}
    for (const e of edges) (out[e.source] ??= []).push(e.target)

    const startNodes = nodes.filter((n) => n.type === 'start' || n.type === 'trigger')
    const hasIncoming = new Set(edges.map((e) => e.target))
    const queue: string[] = startNodes.length
      ? startNodes.flatMap((n) => out[n.id] ?? [])
      : nodes.filter((n) => !hasIncoming.has(n.id) && n.type !== 'start').map((n) => n.id)

    const visited = new Set<string>()
    const steps: any[] = []
    let anyFailed = false

    while (queue.length) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const node = byId[id]
      if (!node) continue
      const exec = EXECUTORS[node.type]
      const at = new Date().toISOString()
      if (!exec) {
        steps.push({ node_id: id, type: node.type, status: 'skipped', error: `no executor for "${node.type}" yet`, at })
      } else {
        try {
          const r = await exec(node.config ?? {}, ctx, admin)
          if (r.error) { anyFailed = true; steps.push({ node_id: id, type: node.type, status: 'failed', error: r.error, at }) }
          else { ctx.outputs[id] = r.output; steps.push({ node_id: id, type: node.type, status: 'done', output: r.output, at }) }
        } catch (e) {
          anyFailed = true
          steps.push({ node_id: id, type: node.type, status: 'failed', error: (e as Error).message, at })
        }
      }
      for (const t of (out[id] ?? [])) if (!visited.has(t)) queue.push(t)
    }

    const status = anyFailed ? 'failed' : 'succeeded'
    await admin.from('flow_runs').update({
      status, steps, context: ctx, finished_at: new Date().toISOString(),
      error: anyFailed ? (steps.find((s) => s.status === 'failed')?.error ?? 'a step failed') : null,
    }).eq('id', run_id)

    return json({ run_id, status, steps: steps.length, log: steps })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
