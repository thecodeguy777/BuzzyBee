<script setup lang="ts">
// Scroll-pinned platform showcase: "your VA's workspace."
// A sticky stage holds a faithful DARK recreation of the real workstation
// (persistent sidebar rail + topbar; the <main> content swaps per tab). On the
// left, a VA-forward feature list with "Replaces:" badges; the active feature
// expands. Scroll advances the active tab; clicking a feature jumps to it.
// Only REAL, demo-ready views are shown (Tasks, Comms, CRM, Time, Command
// center) — no fabricated screens. Static stack under prefers-reduced-motion.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import HexClipDef from '@/components/shared/HexClipDef.vue'
import {
  Home, Inbox, LayoutGrid, MessagesSquare, Handshake, Clock, Settings,
  Search, Bell, ChevronDown, Hash, CheckSquare, ListChecks, CalendarDays,
  Trophy, Sparkles, AlertTriangle, Hexagon, Headphones, Download,
  StickyNote, Smile, MessageSquare, Pin, ArrowRight, Flag, Target,
  Briefcase, ZoomOut,
} from 'lucide-vue-next'

type Key = 'command' | 'tasks' | 'chat' | 'crm' | 'time'

const features = [
  {
    key: 'tasks' as Key,
    name: 'HiveFlow',
    type: 'Task board',
    replaces: ['Asana', 'Monday', 'ClickUp'],
    desc: "Your VA's work lives on a board you both see. Every request becomes a tracked task — assigned, prioritized, and moving in real time.",
    nav: 'tasks' as Key,
  },
  {
    key: 'chat' as Key,
    name: 'HiveChat',
    type: 'Team chat',
    replaces: ['Slack', 'Teams'],
    desc: 'Message your VA like a teammate. Turn any message into a tracked task with one click — nothing slips through.',
    nav: 'chat' as Key,
  },
  {
    key: 'crm' as Key,
    name: 'HiveDeals',
    type: 'CRM & pipeline',
    replaces: ['Follow Up Boss', 'HubSpot'],
    desc: 'Your VA works your leads and deals. You watch them move from first touch to closed-won — no spreadsheet handoffs.',
    nav: 'crm' as Key,
  },
  {
    key: 'time' as Key,
    name: 'HiveTrack',
    type: 'Time & activity',
    replaces: ['Time Doctor', 'Hubstaff'],
    desc: 'See exactly what your VA worked on, by the minute. Honest timestamps and notes — no creepy screenshots or keylogging.',
    nav: 'time' as Key,
  },
  {
    key: 'command' as Key,
    name: 'HiveReview',
    type: 'Command center',
    replaces: ['Spreadsheets', 'QPRs'],
    desc: "One screen for the whole hive: who's online, what's overdue, hours logged, and what needs you today.",
    nav: 'command' as Key,
  },
]

const N = features.length
const SCROLL_VH = 72
const sectionEl = ref<HTMLElement | null>(null)
const active = ref(0)
const reduced = ref(false)

const sectionStyle = computed(() => ({
  height: reduced.value ? 'auto' : `calc(100vh + ${(N - 1) * SCROLL_VH}vh)`,
}))

let raf = 0
function onScroll() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    const el = sectionEl.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const total = el.offsetHeight - window.innerHeight
    const p = total > 0 ? Math.min(Math.max(-rect.top / total, 0), 1) : 0
    active.value = Math.round(p * (N - 1))
  })
}

function goTo(i: number) {
  const el = sectionEl.value
  if (!el || reduced.value) return
  const total = el.offsetHeight - window.innerHeight
  const top = el.offsetTop + (total * i) / (N - 1)
  window.scrollTo({ top, behavior: 'smooth' })
}

onMounted(() => {
  reduced.value = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  if (reduced.value) return
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  onScroll()
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
  if (raf) cancelAnimationFrame(raf)
})

const activeKey = computed<Key>(() => features[active.value].key)
const navActive = computed<Key>(() => features[active.value].nav)

const topTitle = computed(() => {
  switch (activeKey.value) {
    case 'tasks': return 'Spring Campaign'
    case 'chat': return '#general'
    case 'crm': return 'Pipeline'
    case 'time': return 'Time'
    default: return 'Home'
  }
})
</script>

<template>
  <section id="platform" ref="sectionEl" class="ps" :class="{ 'is-reduced': reduced }" :style="sectionStyle">
    <HexClipDef />
    <div class="ps-stage">
      <!-- ambient plum glow -->
      <div class="ps-aura" aria-hidden="true"><span /><span /></div>

      <div class="ps-grid">
        <!-- ── LEFT: feature list ── -->
        <div class="ps-rail">
          <div class="ps-eyebrow">The workspace</div>
          <h2 class="ps-h2">Everything your VA does.<br />All in one place.</h2>
          <p class="ps-lede">
            Every plan includes the full platform your assistant works in — and that you watch them through.
            One hive instead of a $200-a-month pile of software.
          </p>

          <ul class="ps-feats">
            <li
              v-for="(f, i) in features"
              :key="f.key"
              class="ps-feat"
              :class="{ 'is-active': active === i }"
              @click="goTo(i)"
            >
              <div class="ps-feat-bar" />
              <div class="ps-feat-main">
                <div class="ps-feat-head">
                  <span class="ps-feat-name">{{ f.name }}</span>
                  <span class="ps-feat-type">{{ f.type }}</span>
                </div>
                <div class="ps-feat-body">
                  <div class="ps-replaces">
                    <span class="ps-rep-label">Replaces</span>
                    <span v-for="r in f.replaces" :key="r" class="ps-rep">{{ r }}</span>
                  </div>
                  <p class="ps-feat-desc">{{ f.desc }}</p>
                </div>
              </div>
            </li>
          </ul>

          <a href="#contact" class="ps-cta">
            Book a platform demo
            <ArrowRight :size="15" :stroke-width="2.5" />
          </a>
        </div>

        <!-- ── RIGHT: the app window ── -->
        <div class="ps-window">
          <!-- app sidebar rail -->
          <aside class="ps-side">
            <div class="ps-side-mark">
              <svg viewBox="0 0 24 24" class="ps-side-hex"><path d="M13.34 1.91 20.05 5.78 Q21.4 6.56 21.4 8.11 L21.4 15.85 Q21.4 17.4 20.05 18.18 L13.34 22.05 Q12 22.83 10.66 22.05 L3.95 18.18 Q2.6 17.4 2.6 15.85 L2.6 8.11 Q2.6 6.56 3.95 5.78 L10.66 1.91 Q12 1.13 13.34 1.91 Z" /></svg>
            </div>
            <button class="ps-side-i" :class="{ 'is-on': navActive === 'command' }"><Home :size="18" :stroke-width="1.9" /></button>
            <button class="ps-side-i"><Inbox :size="18" :stroke-width="1.9" /><span class="ps-side-dot" /></button>
            <button class="ps-side-i" :class="{ 'is-on': navActive === 'tasks' }"><LayoutGrid :size="18" :stroke-width="1.9" /></button>
            <button class="ps-side-i"><Target :size="18" :stroke-width="1.9" /></button>
            <div class="ps-side-sep" />
            <button class="ps-side-i" :class="{ 'is-on': navActive === 'chat' }"><MessagesSquare :size="18" :stroke-width="1.9" /></button>
            <button class="ps-side-i" :class="{ 'is-on': navActive === 'crm' }"><Handshake :size="18" :stroke-width="1.9" /></button>
            <button class="ps-side-i" :class="{ 'is-on': navActive === 'time' }"><Clock :size="18" :stroke-width="1.9" /></button>
            <div class="ps-side-grow" />
            <button class="ps-side-i"><Settings :size="18" :stroke-width="1.9" /></button>
          </aside>

          <!-- app body -->
          <div class="ps-app">
            <!-- topbar -->
            <header class="ps-top">
              <button class="ps-client">
                <span class="ps-sq" style="background:#7c3fd1">N</span>
                Northstar <span class="ps-client-tag">Demo</span>
                <ChevronDown :size="13" :stroke-width="2.2" />
              </button>
              <span class="ps-crumb">▸ {{ topTitle }}</span>
              <div class="ps-top-search"><Search :size="13" :stroke-width="2" /> Search</div>
              <div class="ps-top-grow" />
              <!-- running timer chip (Time story) -->
              <span v-if="activeKey === 'time'" class="ps-timer"><span class="ps-ping" /> Northstar · 04:11:47</span>
              <span class="ps-online"><span class="ps-online-dot" /> 8 online</span>
              <button class="ps-top-i"><Bell :size="15" :stroke-width="1.9" /></button>
              <span class="ps-hx ps-hx--sm" style="background:#8E4EC6">JR</span>
            </header>

            <!-- swapping content -->
            <main class="ps-main">
              <!-- ─────────── TASKS (HiveFlow) ─────────── -->
              <div class="ps-panel ps-pad" :class="{ 'is-on': activeKey === 'tasks' }">
                <div class="ps-panel-head">
                  <div><div class="ps-panel-title">Spring Campaign</div><div class="ps-panel-sub">11 tasks · 4 assignees</div></div>
                  <span class="ps-ghost"><ZoomOut :size="13" :stroke-width="2" /> Zoom: Default</span>
                </div>
                <div class="ps-board">
                  <div class="ps-col">
                    <div class="ps-colh ps-h-neutral"><span class="ps-d" style="background:#b9b7c0" /> To do <b>5</b></div>
                    <div class="ps-tcard">
                      <div class="ps-tt">Write launch email sequence</div>
                      <div class="ps-tmeta"><span class="ps-ref">TASK-0004</span><Flag :size="11" :stroke-width="2.4" class="ps-flag-hi" /><span class="ps-mi"><ListChecks :size="11" :stroke-width="2" /> 0/3</span><span class="ps-grow" /><span class="ps-hx ps-hx--xs" style="background:#8E4EC6">MK</span></div>
                    </div>
                    <div class="ps-tcard"><div class="ps-tt">Update pricing sheet</div><div class="ps-tmeta"><span class="ps-ref">TASK-0002</span><span class="ps-mi"><CalendarDays :size="11" :stroke-width="2" /> Apr 20</span><span class="ps-grow" /><span class="ps-hx ps-hx--xs" style="background:#3E63DD">DN</span></div></div>
                    <div class="ps-tcard ps-dim"><div class="ps-tt">Audit current landing page</div><div class="ps-tmeta"><span class="ps-ref">TASK-0009</span></div></div>
                  </div>
                  <div class="ps-col">
                    <div class="ps-colh ps-h-info"><span class="ps-d" style="background:#8fb0f7" /> In progress <b>4</b></div>
                    <div class="ps-tcard ps-hot">
                      <div class="ps-tt">Draft spring-campaign quote</div>
                      <div class="ps-tmeta"><span class="ps-ref">TASK-0001</span><Flag :size="11" :stroke-width="2.4" class="ps-flag-med" /><span class="ps-mi"><ListChecks :size="11" :stroke-width="2" /> 1/3</span><span class="ps-mi ps-mi-amber"><CalendarDays :size="11" :stroke-width="2" /> Tomorrow</span><span class="ps-grow" /><span class="ps-hx ps-hx--xs" style="background:#8E4EC6">MK</span></div>
                    </div>
                    <div class="ps-tcard"><div class="ps-tt">Design new landing hero</div><div class="ps-tmeta"><span class="ps-ref">TASK-0003</span><span class="ps-mi"><ListChecks :size="11" :stroke-width="2" /> 2/4</span><span class="ps-grow" /><span class="ps-hx ps-hx--xs" style="background:#46A758">PG</span></div></div>
                  </div>
                  <div class="ps-col">
                    <div class="ps-colh ps-h-warn"><span class="ps-d" style="background:#e3a24a" /> Blocked <b>2</b></div>
                    <div class="ps-tcard"><div class="ps-tt">Finalize budget approval</div><div class="ps-tmeta"><span class="ps-ref">TASK-0006</span><Flag :size="11" :stroke-width="2.4" class="ps-flag-hi" /><span class="ps-mi ps-mi-amber"><CalendarDays :size="11" :stroke-width="2" /> Today</span></div></div>
                  </div>
                  <div class="ps-col ps-col-peek">
                    <div class="ps-colh ps-h-done"><span class="ps-d" style="background:#6cc788" /> Done <b>2</b></div>
                    <div class="ps-tcard ps-dim"><div class="ps-tt ps-strike">Onboard Acme Co</div><div class="ps-tmeta"><span class="ps-ref">TASK-0007</span><span class="ps-mi"><ListChecks :size="11" :stroke-width="2" /> 3/3</span></div></div>
                  </div>
                </div>
              </div>

              <!-- ─────────── COMMS (HiveChat) ─────────── -->
              <div class="ps-panel ps-comms" :class="{ 'is-on': activeKey === 'chat' }">
                <div class="ps-chrail">
                  <div class="ps-ws"><span class="ps-online-dot" /><div><div class="ps-ws-name">HiveMind</div><div class="ps-ws-on">8 online</div></div></div>
                  <div class="ps-chlabel">Channels</div>
                  <div class="ps-ch is-on"><Hash :size="13" :stroke-width="2.2" /> general</div>
                  <div class="ps-ch ps-ch-unread"><Hash :size="13" :stroke-width="2.2" /> ops-floor <span class="ps-ch-badge">3</span></div>
                  <div class="ps-ch"><Hash :size="13" :stroke-width="2.2" /> listings</div>
                  <div class="ps-ch"><Hash :size="13" :stroke-width="2.2" /> client-acme <span class="ps-ch-badge ps-ch-at">@2</span></div>
                  <div class="ps-ch"><Hash :size="13" :stroke-width="2.2" /> dialer-room <Headphones :size="12" :stroke-width="2.2" class="ps-huddle" /> 4</div>
                  <div class="ps-ch"><Hash :size="13" :stroke-width="2.2" /> wins</div>
                </div>
                <div class="ps-chmain">
                  <div class="ps-chhead"><Hash :size="14" :stroke-width="2.2" class="ps-mut" /><span class="ps-chhead-name">general</span><span class="ps-grow" /><span class="ps-huddle-btn"><Headphones :size="13" :stroke-width="2" /> Huddle</span></div>
                  <div class="ps-chlist">
                    <div class="ps-div"><span>Today · June 15</span></div>
                    <div class="ps-msg">
                      <span class="ps-hx" style="background:#12A594">MS</span>
                      <div class="ps-msg-b"><div class="ps-msg-h"><span class="ps-name" style="color:#3ec9b6">Maria Santos</span><span class="ps-time">9:02 AM</span></div><div class="ps-text">Morning team 🐝 pulling the new Acme listings into the CRM now — done before the US reps log on.</div></div>
                    </div>
                    <div class="ps-msg ps-msg-group"><span class="ps-gutter">9:03</span><div class="ps-msg-b"><div class="ps-text">Found 6 dupes, merging by dialer_lead_id.</div></div></div>
                    <div class="ps-msg ps-msg-hover">
                      <span class="ps-hx" style="background:#8E4EC6">JR</span>
                      <div class="ps-msg-b"><div class="ps-msg-h"><span class="ps-name" style="color:#b48ce0">Jayson Remigio</span><span class="ps-time">9:14 AM</span></div><div class="ps-text"><span class="ps-mention">@Maria Santos</span> nice. Once that's in, flag the 3 hot deals so the reps see them first?</div><div class="ps-react"><span class="ps-rpill is-mine">🐝 3</span><span class="ps-thread">2 replies · last 9:21 AM</span></div></div>
                      <div class="ps-toolbar"><span class="ps-tbi"><Smile :size="14" :stroke-width="1.9" /></span><span class="ps-tbi"><MessageSquare :size="14" :stroke-width="1.9" /></span><span class="ps-tbi ps-tbi-pri"><CheckSquare :size="14" :stroke-width="1.9" /></span><span class="ps-tbi"><Pin :size="14" :stroke-width="1.9" /></span></div>
                    </div>
                    <div class="ps-msg">
                      <span class="ps-hx" style="background:#0090FF">DP</span>
                      <div class="ps-msg-b"><div class="ps-msg-h"><span class="ps-name" style="color:#5bb0ff">Dwayne Pereda</span><span class="ps-time">9:18 AM</span></div><div class="ps-text">Reps are dialing the Riverside batch — 42 connected, 5 callbacks booked so far.</div><div class="ps-react"><span class="ps-rpill">🔥 4</span><span class="ps-rpill">🚀 2</span></div></div>
                    </div>
                  </div>
                  <div class="ps-composer"><span class="ps-comp-ph">Message #general — type / for commands</span><span class="ps-send"><ArrowRight :size="14" :stroke-width="2.4" /></span></div>
                </div>
              </div>

              <!-- ─────────── CRM (HiveDeals) ─────────── -->
              <div class="ps-panel ps-pad" :class="{ 'is-on': activeKey === 'crm' }">
                <div class="ps-panel-head"><div><div class="ps-panel-title">Pipeline</div><div class="ps-panel-sub">$58,500 open · 14 deals</div></div><span class="ps-ghost">Board · Table</span></div>
                <div class="ps-board">
                  <div class="ps-col">
                    <div class="ps-colh" style="background:rgba(143,176,247,0.13)"><span class="ps-d" style="background:#2f6fed" /> Contacted <b>3</b></div>
                    <div class="ps-dcard"><div class="ps-dtop"><span class="ps-sq" style="background:#3E63DD">RV</span><span class="ps-co">Riverside Homes</span></div><div class="ps-dt">Buyer rep agreement</div><div class="ps-dfoot"><b class="ps-val">$6,200</b><span class="ps-date"><CalendarDays :size="11" :stroke-width="2" /> Jun 22</span></div></div>
                  </div>
                  <div class="ps-col">
                    <div class="ps-colh" style="background:rgba(227,162,74,0.13)"><span class="ps-d" style="background:#c2700c" /> Proposal <b>4</b></div>
                    <div class="ps-dcard ps-hot"><div class="ps-dtop"><span class="ps-sq" style="background:#46A758">SM</span><span class="ps-co">Summit Lending</span></div><div class="ps-dt">Refi package — 12 units</div><div class="ps-dfoot"><b class="ps-val">$18,400</b><span class="ps-date"><CalendarDays :size="11" :stroke-width="2" /> Jun 27</span></div></div>
                  </div>
                  <div class="ps-col">
                    <div class="ps-colh" style="background:rgba(178,102,187,0.15)"><span class="ps-d" style="background:#a24fae" /> Negotiation <b>2</b></div>
                    <div class="ps-dcard"><div class="ps-dtop"><span class="ps-sq" style="background:#E5484D">GX</span><span class="ps-co">Globex Realty</span></div><div class="ps-dt">Annual contract</div><div class="ps-dfoot"><b class="ps-val">$12,000</b><span class="ps-date"><CalendarDays :size="11" :stroke-width="2" /> Jun 30</span></div></div>
                  </div>
                  <div class="ps-col ps-col-peek">
                    <div class="ps-colh" style="background:rgba(34,163,90,0.15)"><span class="ps-d" style="background:#22a35a" /> Won <b>1</b></div>
                    <div class="ps-dcard ps-dwon"><div class="ps-dtop"><span class="ps-sq" style="background:#12A594">AC</span><span class="ps-co">Acme Co</span><span class="ps-won"><Trophy :size="11" :stroke-width="2" /> Won</span></div><div class="ps-dt">Full-service retainer</div><div class="ps-dfoot"><b class="ps-val ps-val-won">$9,500</b></div></div>
                  </div>
                </div>
              </div>

              <!-- ─────────── TIME (HiveTrack) ─────────── -->
              <div class="ps-panel ps-pad" :class="{ 'is-on': activeKey === 'time' }">
                <div class="ps-panel-head"><div><div class="ps-panel-title">Time</div><div class="ps-panel-sub">Honest activity log. Timestamps only — no screenshots, no keystrokes.</div></div><span class="ps-ghost"><Download :size="13" :stroke-width="2" /> CSV</span></div>
                <div class="ps-range"><span class="is-on">Today</span><span>This week</span><span>Last week</span><span>This month</span></div>
                <div class="ps-stats2">
                  <div class="ps-stat"><div class="ps-stat-l">Today total</div><div class="ps-stat-v">06:42:18</div><div class="ps-stat-s">4 sessions</div></div>
                  <div class="ps-stat"><div class="ps-stat-l">By client</div>
                    <div class="ps-byc"><span>Coastal Realty</span><b>3h 12m</b></div>
                    <div class="ps-byc"><span>Bridgepoint Mortgage</span><b>1h 48m</b></div>
                    <div class="ps-byc"><span>Summit Property</span><b>1h 02m</b></div>
                  </div>
                </div>
                <div class="ps-sess-h">Sessions</div>
                <div class="ps-sess">
                  <div class="ps-sess-l"><div class="ps-sess-c">HiveMind · Daily wrap-up + tomorrow prep</div><div class="ps-sess-t">Jun 15, 4:40 PM → running</div></div>
                  <div class="ps-sess-r"><span class="ps-dur">00:39:18</span><span class="ps-badge-run">Running</span></div>
                </div>
                <div class="ps-sess">
                  <div class="ps-sess-l"><div class="ps-sess-c">Coastal Realty <StickyNote :size="11" :stroke-width="2" class="ps-mut" /> Skip-traced 60 leads, updated dispositions</div><div class="ps-sess-t">Jun 15, 9:02 AM → 1:14 PM</div></div>
                  <div class="ps-sess-r"><span class="ps-dur">04:12:03</span></div>
                </div>
                <div class="ps-sess">
                  <div class="ps-sess-l"><div class="ps-sess-c">Bridgepoint Mortgage <StickyNote :size="11" :stroke-width="2" class="ps-mut" /> Follow-up sequence + booked 2 callbacks</div><div class="ps-sess-t">Jun 15, 1:30 PM → 3:18 PM</div></div>
                  <div class="ps-sess-r"><span class="ps-dur">01:48:11</span></div>
                </div>
              </div>

              <!-- ─────────── COMMAND CENTER (HiveReview) ─────────── -->
              <div class="ps-panel ps-pad" :class="{ 'is-on': activeKey === 'command' }">
                <div class="ps-hero">
                  <div class="ps-hero-eye">MONDAY, JUNE 15</div>
                  <div class="ps-hero-h">Good morning, <span class="ps-hero-name">Jayson.</span> <span class="ps-hero-tail">3 things are overdue.</span></div>
                  <span class="ps-hero-btn"><Sparkles :size="13" :stroke-width="2" /> Plan my week</span>
                </div>
                <div class="ps-hive">
                  <div class="ps-hive-h"><Hexagon :size="14" :stroke-width="2" class="ps-acc" /> The Hive <span class="ps-ping ps-ping-g" /> <span class="ps-hive-c"><b>6</b> in the hive · <i class="ps-blue">2 on calls</i> · <i class="ps-green">1 free</i></span></div>
                  <div class="ps-hive-row">
                    <div class="ps-person"><span class="ps-hx" style="background:#0090FF">MC</span><span class="ps-pstat-dot ps-blue-dot" /><div class="ps-pn">Marwin</div><div class="ps-ps ps-blue"><Headphones :size="10" :stroke-width="2" /> on a call</div></div>
                    <div class="ps-person"><span class="ps-hx" style="background:#8E4EC6">JR</span><span class="ps-pstat-dot ps-violet-dot" /><div class="ps-pn">Jana</div><div class="ps-ps ps-violet"><Clock :size="10" :stroke-width="2" /> 1h 24m</div></div>
                    <div class="ps-person"><span class="ps-hx" style="background:#46A758">RS</span><span class="ps-pstat-dot ps-green-dot" /><div class="ps-pn">Rhea</div><div class="ps-ps ps-green">free to grab</div></div>
                    <div class="ps-person"><span class="ps-hx" style="background:#F76B15">CM</span><span class="ps-pstat-dot ps-violet-dot" /><div class="ps-pn">Carlo</div><div class="ps-ps ps-violet"><Clock :size="10" :stroke-width="2" /> 47m</div></div>
                    <div class="ps-person ps-off"><span class="ps-hx" style="background:#6E56CF">ME</span><span class="ps-pstat-dot ps-off-dot" /><div class="ps-pn">Mei</div><div class="ps-ps ps-mut2">clocked out</div></div>
                  </div>
                </div>
                <div class="ps-pulse">
                  <div class="ps-stat ps-pc"><div class="ps-pc-l"><Briefcase :size="12" :stroke-width="1.9" /> Active clients</div><div class="ps-pc-v">5</div><div class="ps-pc-s">across 7 total</div></div>
                  <div class="ps-stat ps-pc"><div class="ps-pc-l"><Clock :size="12" :stroke-width="1.9" /> Hours this week</div><div class="ps-pc-v">142h</div><div class="ps-spark"><i style="height:40%" /><i style="height:65%" /><i style="height:50%" /><i style="height:80%" /><i style="height:60%" /><i style="height:90%" /><i style="height:72%" /></div></div>
                  <div class="ps-stat ps-pc ps-pc-err"><div class="ps-pc-l"><AlertTriangle :size="12" :stroke-width="1.9" /> Overdue</div><div class="ps-pc-v">3</div><div class="ps-pc-s">needs attention</div></div>
                </div>
                <div class="ps-attn">
                  <div class="ps-attn-h"><AlertTriangle :size="13" :stroke-width="2" class="ps-mut" /> Needs attention <span class="ps-grow" /><span class="ps-attn-n">4 items</span></div>
                  <div class="ps-attn-row"><span class="ps-attn-i ps-attn-err"><AlertTriangle :size="13" :stroke-width="2" /></span><div><div class="ps-attn-t">Update buyer comps deck</div><div class="ps-attn-s">Overdue · Marwin · Coastal Realty</div></div><ArrowRight :size="14" :stroke-width="2" class="ps-mut3" /></div>
                  <div class="ps-attn-row"><span class="ps-attn-i ps-attn-warn"><ListChecks :size="13" :stroke-width="2" /></span><div><div class="ps-attn-t">Draft listing description</div><div class="ps-attn-s">Unassigned · Summit Lending</div></div><ArrowRight :size="14" :stroke-width="2" class="ps-mut3" /></div>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>

      <!-- progress comb -->
      <div class="ps-comb" aria-hidden="true">
        <span v-for="(f, i) in features" :key="f.key" class="ps-comb-c" :class="{ 'is-on': active >= i, 'is-now': active === i }" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.ps {
  position: relative; background: #0d0a12; color: #f3ecfa;
  --b100: #16181d; --b200: #1e2127; --b300: #2b2e36; --ink: #eef0f2;
  --pri: #b266bb; --acc: #8a3a93; --amber: #e3a24a; --green: #6cc788;
  --blue: #8fb0f7; --coral: #ef8497; --hex: url(#hc-hex-clip);
}
.ps-stage { position: sticky; top: 0; height: 100vh; overflow: hidden; display: flex; align-items: center; }
.ps-aura { position: absolute; inset: 0; pointer-events: none; }
.ps-aura span { position: absolute; border-radius: 9999px; filter: blur(100px); opacity: 0.4; }
.ps-aura span:nth-child(1) { width: 42vw; height: 42vw; left: -10vw; top: -8vw; background: #5b2bb0; }
.ps-aura span:nth-child(2) { width: 36vw; height: 36vw; right: -8vw; bottom: -10vw; background: #7c3fd1; opacity: 0.3; }

.ps-grid { position: relative; width: 100%; max-width: 84rem; margin: 0 auto; padding: 0 2rem; display: grid; grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr); gap: 3rem; align-items: center; }
@media (max-width: 1024px) { .ps-grid { grid-template-columns: 1fr; gap: 1.5rem; } }

/* ── left feature rail ── */
.ps-eyebrow { font-size: 0.72rem; letter-spacing: 0.2em; text-transform: uppercase; color: #c79bef; font-weight: 600; }
.ps-h2 { font-family: 'Clash Display','Hanken Grotesk',system-ui,sans-serif; font-weight: 600; font-size: clamp(1.9rem, 3.2vw, 3rem); line-height: 1.02; letter-spacing: -0.02em; margin-top: 0.7rem; }
.ps-lede { margin-top: 1rem; max-width: 30rem; font-size: 0.98rem; line-height: 1.55; color: rgba(243,236,250,0.62); }
.ps-feats { margin-top: 1.6rem; display: flex; flex-direction: column; }
.ps-feat { position: relative; display: flex; gap: 0.9rem; padding: 0.85rem 0; cursor: pointer; border-top: 1px solid rgba(255,255,255,0.08); }
.ps-feat:last-child { border-bottom: 1px solid rgba(255,255,255,0.08); }
.ps-feat-bar { width: 2px; border-radius: 2px; background: transparent; transition: background 0.3s; }
.ps-feat.is-active .ps-feat-bar { background: linear-gradient(180deg, #b25cff, #7c3fd1); }
.ps-feat-head { display: flex; align-items: baseline; gap: 0.6rem; }
.ps-feat-name { font-family: 'Clash Display','Hanken Grotesk',system-ui,sans-serif; font-weight: 600; font-size: 1.12rem; color: rgba(243,236,250,0.55); transition: color 0.25s; }
.ps-feat.is-active .ps-feat-name { color: #fff; }
.ps-feat-type { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(243,236,250,0.4); }
.ps-feat-body { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 0.4s ease, opacity 0.35s ease; }
.ps-feat.is-active .ps-feat-body { grid-template-rows: 1fr; opacity: 1; margin-top: 0.55rem; }
.ps-feat-body > * { overflow: hidden; }
.ps-replaces { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.ps-rep-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(243,236,250,0.4); }
.ps-rep { font-size: 0.68rem; font-weight: 500; color: rgba(243,236,250,0.7); padding: 0.1rem 0.5rem; border-radius: 5px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); }
.ps-feat-desc { font-size: 0.88rem; line-height: 1.5; color: rgba(243,236,250,0.66); max-width: 28rem; }
.ps-cta { display: inline-flex; align-items: center; gap: 0.5rem; margin-top: 1.6rem; padding: 0.7rem 1.3rem; border-radius: 0.7rem; font-weight: 600; font-size: 0.92rem; color: #fff; background: linear-gradient(135deg, #a85be0, #7c3fd1); box-shadow: 0 10px 30px -12px rgba(168,91,224,0.8); transition: transform 0.15s, filter 0.15s; align-self: flex-start; }
.ps-cta:hover { transform: translateY(-1px); filter: brightness(1.08); }

/* ── app window ── */
.ps-window {
  position: relative; display: flex; height: min(74vh, 620px); border-radius: 14px; overflow: hidden;
  background: var(--b100); color: var(--ink); border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 50px 110px -36px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.03), 0 0 70px -18px rgba(168,91,224,0.32);
}
.ps-side { width: 52px; flex: none; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 0; background: linear-gradient(180deg, #1e2a6e 0%, #211a52 50%, #14102f 100%); }
.ps-side-mark { width: 30px; height: 30px; margin-bottom: 6px; }
.ps-side-hex { width: 100%; height: 100%; fill: #a5b4fc; }
.ps-side-i { position: relative; width: 36px; height: 36px; border-radius: 9px; display: grid; place-items: center; color: rgba(255,255,255,0.6); transition: all 0.2s; }
.ps-side-i:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.9); }
.ps-side-i.is-on { background: rgba(255,255,255,0.14); color: #fff; }
.ps-side-dot { position: absolute; top: 6px; right: 6px; width: 6px; height: 6px; border-radius: 9999px; background: #ef8497; box-shadow: 0 0 0 2px #211a52; }
.ps-side-sep { width: 20px; height: 1px; background: rgba(255,255,255,0.14); margin: 4px 0; }
.ps-side-grow { flex: 1; }

.ps-app { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ps-top { height: 46px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 14px; background: var(--b100); border-bottom: 1px solid var(--b300); }
.ps-client { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; font-weight: 600; color: var(--ink); }
.ps-client-tag { font-size: 0.56rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #c79bef; background: rgba(178,102,187,0.16); padding: 0.05rem 0.32rem; border-radius: 4px; }
.ps-crumb { font-size: 0.74rem; color: rgba(238,240,242,0.45); }
.ps-top-search { display: inline-flex; align-items: center; gap: 5px; font-size: 0.72rem; color: rgba(238,240,242,0.4); padding: 0.28rem 0.7rem; border-radius: 7px; border: 1px solid var(--b300); margin-left: 6px; }
.ps-top-grow { flex: 1; }
.ps-timer { display: inline-flex; align-items: center; gap: 6px; font-size: 0.7rem; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--green); padding: 0.22rem 0.6rem; border-radius: 9999px; background: rgba(108,199,136,0.1); border: 1px solid rgba(108,199,136,0.35); }
.ps-online { display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; color: rgba(238,240,242,0.55); }
.ps-online-dot { width: 7px; height: 7px; border-radius: 9999px; background: var(--green); }
.ps-top-i { width: 30px; height: 30px; border-radius: 9999px; display: grid; place-items: center; color: rgba(238,240,242,0.55); }

.ps-main { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.ps-panel { position: absolute; inset: 0; opacity: 0; transform: translateY(10px) scale(0.995); transition: opacity 0.45s ease, transform 0.45s cubic-bezier(0.22,1,0.36,1); pointer-events: none; overflow: hidden; }
.ps-panel.is-on { opacity: 1; transform: none; pointer-events: auto; }
.ps-pad { padding: 1rem 1.1rem; }

/* ── shared primitives ── */
.ps-hx { width: 30px; height: 30px; flex: none; display: grid; place-items: center; color: #fff; font-size: 0.62rem; font-weight: 700; clip-path: var(--hex); -webkit-clip-path: var(--hex); }
.ps-hx--sm { width: 26px; height: 26px; font-size: 0.56rem; }
.ps-hx--xs { width: 18px; height: 18px; font-size: 0.44rem; }
.ps-sq { width: 22px; height: 22px; flex: none; display: grid; place-items: center; color: #fff; font-size: 0.55rem; font-weight: 700; border-radius: 6px; }
.ps-grow { flex: 1; }
.ps-mut { color: rgba(238,240,242,0.5); }
.ps-mut3 { color: rgba(238,240,242,0.3); }

.ps-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 0.85rem; }
.ps-panel-title { font-family: 'Hanken Grotesk',system-ui,sans-serif; font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; }
.ps-panel-sub { font-size: 0.72rem; color: rgba(238,240,242,0.5); margin-top: 0.15rem; }
.ps-ghost { display: inline-flex; align-items: center; gap: 5px; font-size: 0.68rem; font-weight: 600; color: rgba(238,240,242,0.6); padding: 0.28rem 0.6rem; border-radius: 7px; border: 1px solid var(--b300); white-space: nowrap; }

/* board / pipeline */
.ps-board { display: flex; gap: 0.65rem; align-items: flex-start; }
.ps-col { flex: 1; min-width: 0; background: var(--b200); border: 1px solid var(--b300); border-radius: 12px; padding: 0.5rem; }
.ps-col-peek { opacity: 0.92; }
.ps-colh { display: flex; align-items: center; gap: 6px; font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: rgba(238,240,242,0.72); margin: -0.5rem -0.5rem 0.5rem; padding: 0.5rem 0.55rem; border-bottom: 1px solid var(--b300); border-radius: 12px 12px 0 0; }
.ps-colh b { margin-left: auto; color: rgba(238,240,242,0.45); }
.ps-h-neutral { background: rgba(255,255,255,0.04); }
.ps-h-info { background: rgba(143,176,247,0.13); }
.ps-h-warn { background: rgba(227,162,74,0.13); }
.ps-h-done { background: rgba(108,199,136,0.13); }
.ps-d { width: 7px; height: 7px; border-radius: 9999px; flex: none; }
.ps-tcard, .ps-dcard { background: var(--b100); border: 1px solid var(--b300); border-radius: 8px; padding: 0.5rem 0.55rem; box-shadow: 0 1px 2px rgba(0,0,0,0.25); }
.ps-tcard + .ps-tcard, .ps-dcard + .ps-dcard { margin-top: 0.45rem; }
.ps-dcard { border-radius: 11px; }
.ps-tt { font-size: 0.78rem; font-weight: 600; line-height: 1.3; }
.ps-strike { text-decoration: line-through; }
.ps-dim { opacity: 0.62; }
.ps-tmeta { display: flex; align-items: center; gap: 6px; margin-top: 0.45rem; font-size: 0.6rem; color: rgba(238,240,242,0.45); }
.ps-ref { font-family: 'Geist Mono','JetBrains Mono',ui-monospace,monospace; font-size: 0.56rem; }
.ps-mi { display: inline-flex; align-items: center; gap: 3px; }
.ps-mi-amber { color: var(--amber); }
.ps-flag-hi { color: var(--coral); }
.ps-flag-med { color: var(--amber); }
.ps-hot { border-color: rgba(178,102,187,0.5); box-shadow: 0 6px 18px -8px rgba(178,102,187,0.4); }
.ps-dtop { display: flex; align-items: center; gap: 0.4rem; }
.ps-co { font-size: 0.64rem; font-weight: 700; color: rgba(238,240,242,0.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ps-dt { font-size: 0.8rem; font-weight: 600; margin-top: 0.4rem; }
.ps-dfoot { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 0.45rem; }
.ps-val { font-size: 0.86rem; font-weight: 800; letter-spacing: -0.01em; }
.ps-val-won { color: var(--green); }
.ps-date { display: inline-flex; align-items: center; gap: 3px; font-size: 0.6rem; color: rgba(238,240,242,0.4); }
.ps-won { display: inline-flex; align-items: center; gap: 3px; margin-left: auto; padding: 0.1rem 0.4rem; border-radius: 9999px; font-size: 0.56rem; font-weight: 700; color: var(--green); background: rgba(34,163,90,0.16); }
.ps-dwon { border-color: rgba(34,163,90,0.35); }

/* comms */
.ps-comms { display: flex; }
.ps-chrail { width: 168px; flex: none; background: var(--b100); border-right: 1px solid var(--b300); padding: 0.7rem 0.6rem; overflow: hidden; }
.ps-ws { display: flex; align-items: center; gap: 7px; margin-bottom: 0.9rem; }
.ps-ws-name { font-family: 'Hanken Grotesk',system-ui,sans-serif; font-size: 0.82rem; font-weight: 700; }
.ps-ws-on { font-size: 0.62rem; color: var(--green); }
.ps-chlabel { font-size: 0.58rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(238,240,242,0.4); margin-bottom: 0.35rem; }
.ps-ch { display: flex; align-items: center; gap: 6px; font-size: 0.76rem; color: rgba(238,240,242,0.6); padding: 0.3rem 0.4rem; border-radius: 7px; }
.ps-ch.is-on { background: rgba(178,102,187,0.12); color: var(--pri); font-weight: 600; }
.ps-ch-unread { color: var(--ink); font-weight: 600; }
.ps-ch-badge { margin-left: auto; font-size: 0.58rem; font-weight: 700; color: #fff; background: var(--pri); border-radius: 9999px; min-width: 1.05rem; text-align: center; padding: 0.02rem 0.3rem; }
.ps-ch-at { background: var(--coral); }
.ps-huddle { color: var(--green); margin-left: auto; }
.ps-chmain { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ps-chhead { display: flex; align-items: center; gap: 6px; padding: 0.6rem 0.9rem; border-bottom: 1px solid var(--b300); }
.ps-chhead-name { font-family: 'Hanken Grotesk',system-ui,sans-serif; font-weight: 800; font-size: 0.92rem; }
.ps-huddle-btn { display: inline-flex; align-items: center; gap: 5px; font-size: 0.68rem; font-weight: 600; color: #fff; background: var(--pri); padding: 0.25rem 0.6rem; border-radius: 7px; }
.ps-chlist { flex: 1; min-height: 0; overflow: hidden; padding: 0.5rem 0.9rem; }
.ps-div { display: flex; align-items: center; justify-content: center; margin: 0.4rem 0 0.7rem; }
.ps-div span { font-size: 0.6rem; font-weight: 700; color: rgba(238,240,242,0.5); background: var(--b100); border: 1px solid var(--b300); border-radius: 9999px; padding: 0.12rem 0.6rem; }
.ps-msg { display: flex; gap: 0.6rem; padding: 0.28rem 0; position: relative; }
.ps-msg-hover { background: rgba(30,33,39,0.5); border-radius: 8px; margin: 0 -0.5rem; padding: 0.3rem 0.5rem; }
.ps-msg-group { padding-top: 0; }
.ps-gutter { width: 30px; flex: none; text-align: center; font-size: 0.56rem; color: rgba(238,240,242,0.3); padding-top: 0.1rem; }
.ps-msg-b { min-width: 0; }
.ps-msg-h { display: flex; align-items: baseline; gap: 0.4rem; margin-bottom: 0.1rem; }
.ps-name { font-size: 0.8rem; font-weight: 700; }
.ps-time { font-size: 0.62rem; color: rgba(238,240,242,0.4); }
.ps-text { font-size: 0.82rem; line-height: 1.45; color: rgba(238,240,242,0.9); }
.ps-mention { color: #e6c85a; background: #3a3115; border-radius: 4px; padding: 0 0.2rem; }
.ps-react { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.4rem; flex-wrap: wrap; }
.ps-rpill { font-size: 0.64rem; font-weight: 600; color: rgba(238,240,242,0.7); background: var(--b200); border: 1px solid transparent; border-radius: 9999px; padding: 0.08rem 0.45rem; }
.ps-rpill.is-mine { color: var(--pri); background: rgba(178,102,187,0.12); border-color: rgba(178,102,187,0.3); }
.ps-thread { font-size: 0.64rem; font-weight: 600; color: var(--pri); }
.ps-toolbar { position: absolute; top: -10px; right: 8px; display: flex; gap: 2px; background: var(--b100); border: 1px solid var(--b300); border-radius: 8px; padding: 2px; box-shadow: 0 6px 16px -6px rgba(0,0,0,0.6); }
.ps-tbi { width: 24px; height: 24px; border-radius: 6px; display: grid; place-items: center; color: rgba(238,240,242,0.6); }
.ps-tbi-pri { color: var(--pri); background: rgba(178,102,187,0.12); }
.ps-composer { display: flex; align-items: center; margin: 0.5rem 0.9rem 0.7rem; padding: 0.55rem 0.7rem; border: 1px solid var(--b300); border-radius: 14px; }
.ps-comp-ph { flex: 1; font-size: 0.76rem; color: rgba(238,240,242,0.4); }
.ps-send { width: 26px; height: 26px; border-radius: 9999px; display: grid; place-items: center; color: #fff; background: var(--pri); }

/* time */
.ps-range { display: inline-flex; border: 1px solid var(--b300); border-radius: 8px; overflow: hidden; margin-bottom: 0.8rem; }
.ps-range span { font-size: 0.68rem; font-weight: 600; color: rgba(238,240,242,0.55); padding: 0.3rem 0.7rem; border-right: 1px solid var(--b300); }
.ps-range span:last-child { border-right: 0; }
.ps-range span.is-on { background: var(--pri); color: #fff; }
.ps-stats2 { display: grid; grid-template-columns: 1fr 1.2fr; gap: 0.7rem; margin-bottom: 0.85rem; }
.ps-stat { background: var(--b100); border: 1px solid var(--b300); border-radius: 12px; padding: 0.7rem 0.8rem; }
.ps-stat-l { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(238,240,242,0.55); }
.ps-stat-v { font-family: 'Hanken Grotesk',system-ui,sans-serif; font-size: 1.4rem; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 0.2rem; }
.ps-stat-s { font-size: 0.64rem; color: rgba(238,240,242,0.45); margin-top: 0.1rem; }
.ps-byc { display: flex; align-items: center; justify-content: space-between; font-size: 0.74rem; margin-top: 0.35rem; color: rgba(238,240,242,0.8); }
.ps-byc b { font-variant-numeric: tabular-nums; color: rgba(238,240,242,0.65); }
.ps-sess-h { font-size: 0.74rem; font-weight: 600; color: rgba(238,240,242,0.7); margin-bottom: 0.5rem; }
.ps-sess { display: flex; align-items: center; gap: 0.7rem; background: var(--b100); border: 1px solid var(--b300); border-radius: 10px; padding: 0.55rem 0.75rem; margin-bottom: 0.45rem; }
.ps-sess-l { flex: 1; min-width: 0; }
.ps-sess-c { font-size: 0.78rem; font-weight: 500; display: flex; align-items: center; gap: 5px; }
.ps-sess-t { font-size: 0.64rem; color: rgba(238,240,242,0.5); margin-top: 0.15rem; }
.ps-sess-r { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; }
.ps-dur { font-family: 'Geist Mono','JetBrains Mono',ui-monospace,monospace; font-size: 0.78rem; font-variant-numeric: tabular-nums; }
.ps-badge-run { font-size: 0.56rem; font-weight: 700; color: var(--green); background: rgba(108,199,136,0.16); border-radius: 9999px; padding: 0.05rem 0.4rem; }

/* command center */
.ps-hero { position: relative; border-radius: 14px; padding: 0.95rem 1.1rem; margin-bottom: 0.8rem; background: linear-gradient(135deg, rgba(138,58,147,0.28), rgba(245,181,10,0.05)); border: 1px solid rgba(138,58,147,0.35); }
.ps-hero-eye { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(238,240,242,0.55); }
.ps-hero-h { font-family: 'Hanken Grotesk',system-ui,sans-serif; font-size: 1.3rem; font-weight: 700; letter-spacing: -0.01em; margin-top: 0.25rem; }
.ps-hero-name { color: #c79bef; }
.ps-hero-tail { font-weight: 400; font-style: italic; color: rgba(238,240,242,0.55); font-size: 1rem; }
.ps-hero-btn { position: absolute; top: 0.95rem; right: 1.1rem; display: inline-flex; align-items: center; gap: 5px; font-size: 0.68rem; font-weight: 600; color: #16181d; background: #eef0f2; padding: 0.3rem 0.7rem; border-radius: 8px; }
.ps-hive { background: var(--b100); border: 1px solid var(--b300); border-radius: 14px; padding: 0.8rem 0.9rem; margin-bottom: 0.8rem; }
.ps-hive-h { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 600; margin-bottom: 0.7rem; }
.ps-acc { color: var(--pri); }
.ps-hive-c { font-size: 0.68rem; color: rgba(238,240,242,0.6); font-weight: 400; }
.ps-hive-c b { color: var(--ink); }
.ps-hive-c i { font-style: normal; }
.ps-blue { color: var(--blue); }
.ps-green { color: var(--green); }
.ps-violet { color: #b08cf0; }
.ps-mut2 { color: rgba(238,240,242,0.45); }
.ps-hive-row { display: flex; gap: 0.9rem; }
.ps-person { position: relative; display: flex; flex-direction: column; align-items: center; gap: 0.25rem; width: 70px; }
.ps-person.ps-off { opacity: 0.55; }
.ps-pstat-dot { position: absolute; top: 22px; right: 16px; width: 9px; height: 9px; border-radius: 9999px; border: 2px solid var(--b100); }
.ps-blue-dot { background: var(--blue); }
.ps-violet-dot { background: #8b5cf6; }
.ps-green-dot { background: var(--green); }
.ps-off-dot { background: rgba(238,240,242,0.25); }
.ps-pn { font-size: 0.68rem; font-weight: 600; }
.ps-ps { font-size: 0.58rem; display: inline-flex; align-items: center; gap: 3px; }
.ps-pulse { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.7rem; margin-bottom: 0.8rem; }
.ps-pc { display: flex; flex-direction: column; }
.ps-pc-l { display: inline-flex; align-items: center; gap: 5px; font-size: 0.64rem; color: rgba(238,240,242,0.55); }
.ps-pc-v { font-family: 'Hanken Grotesk',system-ui,sans-serif; font-size: 1.5rem; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 0.15rem; }
.ps-pc-s { font-size: 0.6rem; color: rgba(238,240,242,0.45); }
.ps-pc-err { border-color: rgba(239,132,151,0.4); background: rgba(239,132,151,0.06); }
.ps-pc-err .ps-pc-v, .ps-pc-err .ps-pc-l { color: var(--coral); }
.ps-spark { display: flex; align-items: flex-end; gap: 2px; height: 22px; margin-top: 0.3rem; }
.ps-spark i { flex: 1; background: linear-gradient(180deg, rgba(178,102,187,0.8), rgba(178,102,187,0.2)); border-radius: 2px 2px 0 0; }
.ps-attn { background: var(--b100); border: 1px solid var(--b300); border-radius: 14px; padding: 0.7rem 0.85rem; }
.ps-attn-h { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.5rem; }
.ps-attn-n { font-size: 0.58rem; text-transform: uppercase; color: rgba(238,240,242,0.4); }
.ps-attn-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0; }
.ps-attn-row + .ps-attn-row { border-top: 1px solid rgba(43,46,54,0.6); }
.ps-attn-i { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; flex: none; }
.ps-attn-err { color: var(--coral); background: rgba(239,132,151,0.12); }
.ps-attn-warn { color: var(--amber); background: rgba(227,162,74,0.12); }
.ps-attn-t { font-size: 0.76rem; font-weight: 600; }
.ps-attn-s { font-size: 0.62rem; color: rgba(238,240,242,0.5); }

.ps-ping { width: 7px; height: 7px; border-radius: 9999px; position: relative; }
.ps-ping-g { background: var(--green); }
.ps-ping::after { content: ''; position: absolute; inset: -3px; border-radius: 9999px; background: inherit; opacity: 0.4; animation: ps-ping 1.6s ease-out infinite; }
@keyframes ps-ping { 0% { transform: scale(0.6); opacity: 0.5; } 100% { transform: scale(2); opacity: 0; } }

/* progress comb */
.ps-comb { position: absolute; bottom: 4vh; left: 50%; transform: translateX(-50%); display: flex; gap: 0.5rem; }
.ps-comb-c { width: 26px; height: 26px; clip-path: var(--hex); -webkit-clip-path: var(--hex); background: rgba(255,255,255,0.07); transition: all 0.4s; }
.ps-comb-c.is-on { background: rgba(168,91,224,0.35); }
.ps-comb-c.is-now { background: linear-gradient(135deg, #a85be0, #7c3fd1); transform: scale(1.12); box-shadow: 0 0 16px rgba(168,91,224,0.6); }

/* reduced motion: static stack */
.ps.is-reduced { height: auto !important; }
.ps.is-reduced .ps-stage { position: static; height: auto; display: block; padding: 5rem 0; }
.ps.is-reduced .ps-grid { align-items: start; }
.ps.is-reduced .ps-feat-body { grid-template-rows: 1fr; opacity: 1; margin-top: 0.55rem; }
.ps.is-reduced .ps-window { height: 560px; }
.ps.is-reduced .ps-panel { position: absolute; }
.ps.is-reduced .ps-comb { display: none; }
@media (prefers-reduced-motion: reduce) { .ps-ping::after { animation: none; } }
</style>
