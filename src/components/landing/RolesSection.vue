<script setup lang="ts">
// "Hire the talent, skip the overhead" — the roles catalog. Shows the breadth
// of positions HiveMind staffs (the people cluster shows *who/quality*; this
// shows *what roles*). Ported from the Claude Design "HiveMind Landing" handoff
// into the landing design system: plum tokens, font-display, v-reveal stagger,
// and the same discovery-form CTA seam as FinalCtaSection (no dead links).
import { ref, computed } from 'vue'
import { ArrowRight } from 'lucide-vue-next'
import AmbientGradient from './AmbientGradient.vue'

const formToken = import.meta.env.VITE_DISCOVERY_FORM_TOKEN as string | undefined
const ctaHref = formToken ? `/f/${formToken}` : 'mailto:hello@hivemind.co'

type Cat = 'admin' | 'growth' | 'creative' | 'ops'
interface Role { cat: Cat; icon: string; title: string; desc: string; skills: string[] }

const cats: { key: Cat | 'all'; label: string }[] = [
  { key: 'all', label: 'All roles' },
  { key: 'admin', label: 'Admin & Support' },
  { key: 'growth', label: 'Sales & Growth' },
  { key: 'creative', label: 'Creative & Tech' },
  { key: 'ops', label: 'Specialized' },
]

const roles: Role[] = [
  // Admin & Support
  { cat: 'admin', icon: '🏠', title: 'Property Management VA', desc: 'Listings, tenant comms, maintenance coordination.', skills: ['AppFolio', 'Tenant comms', 'Maintenance'] },
  { cat: 'admin', icon: '🗂️', title: 'Executive Assistant', desc: 'Calendar, travel, inbox & gatekeeping for leaders.', skills: ['Calendar', 'Travel', 'Inbox triage'] },
  { cat: 'admin', icon: '🎧', title: 'Customer Service Rep', desc: 'Tickets, live chat, and friendly first responses.', skills: ['Zendesk', 'Live chat', 'Tickets'] },
  { cat: 'admin', icon: '📋', title: 'Administrative Support', desc: 'Docs, filing, and scheduling, all quietly handled.', skills: ['Docs', 'Scheduling', 'Filing'] },
  { cat: 'admin', icon: '📅', title: 'Email & Calendar Management', desc: 'Zero-inbox discipline and a conflict-free calendar.', skills: ['Inbox zero', 'Scheduling', 'Reminders'] },
  { cat: 'admin', icon: '🔎', title: 'Data Entry & Research', desc: 'Clean records and fast, sourced market research.', skills: ['Excel', 'Sourcing', 'CRM hygiene'] },
  { cat: 'admin', icon: '💬', title: 'General Virtual Assistant', desc: 'A flexible right hand for whatever the week needs.', skills: ['Flexible', 'Ops', 'Admin'] },
  // Sales & Growth
  { cat: 'growth', icon: '📣', title: 'Social Media Management', desc: 'Calendars, posting, community & engagement.', skills: ['Canva', 'Meta Suite', 'Scheduling'] },
  { cat: 'growth', icon: '🧲', title: 'Recruitment & Talent Sourcing', desc: 'Sourcing, screening, and pipeline management.', skills: ['Sourcing', 'Screening', 'ATS'] },
  { cat: 'growth', icon: '📞', title: 'Appointment Setting & Lead Gen', desc: 'Booked calendars and qualified pipeline.', skills: ['Outreach', 'CRM', 'Qualifying'] },
  { cat: 'growth', icon: '🤝', title: 'Sales Support', desc: 'CRM hygiene, quotes, and follow-up that closes.', skills: ['CRM', 'Quotes', 'Follow-up'] },
  { cat: 'growth', icon: '✉️', title: 'Email Marketing Support', desc: 'Campaigns, sequences, lists, and reporting.', skills: ['Klaviyo', 'Sequences', 'Reporting'] },
  // Creative & Tech
  { cat: 'creative', icon: '🎬', title: 'Video Editing', desc: 'Reels, YouTube, and polished promo cuts.', skills: ['Premiere', 'CapCut', 'Reels'] },
  { cat: 'creative', icon: '🎨', title: 'Graphic Design', desc: 'On-brand social, decks, and marketing assets.', skills: ['Figma', 'Canva', 'Brand kits'] },
  { cat: 'creative', icon: '💻', title: 'Web Development', desc: 'Landing pages, sites, and CMS build-outs.', skills: ['HTML/CSS', 'Webflow', 'CMS'] },
  { cat: 'creative', icon: '📱', title: 'App Development', desc: 'Mobile & web app features, fixes, and QA.', skills: ['React', 'APIs', 'QA'] },
  // Specialized
  { cat: 'ops', icon: '📊', title: 'Bookkeeping Support', desc: 'Reconciliation, invoicing, and clean books.', skills: ['QuickBooks', 'Invoicing', 'Reconcile'] },
  { cat: 'ops', icon: '🧭', title: 'Project Management Support', desc: 'Timelines, standups, and tasks that ship.', skills: ['Asana', 'Standups', 'Timelines'] },
  { cat: 'ops', icon: '⚙️', title: 'Operations Support', desc: 'SOPs, vendors, and the systems behind the scenes.', skills: ['SOPs', 'Vendors', 'Systems'] },
  { cat: 'ops', icon: '🩺', title: 'Healthcare Virtual Assistant', desc: 'HIPAA-aware scheduling, intake & records.', skills: ['HIPAA', 'Intake', 'Records'] },
]

const activeCat = ref<Cat | 'all'>('all')
const filtered = computed(() =>
  activeCat.value === 'all' ? roles : roles.filter((r) => r.cat === activeCat.value),
)
</script>

<template>
  <section id="roles" class="relative py-24 md:py-32 border-t border-base-300 overflow-hidden">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.12" tone="purple" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="text-center max-w-2xl mx-auto mb-10">
        <div class="flex items-center gap-3 mb-3 justify-center">
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-r from-primary to-plum"></div>
          <span class="text-xs font-medium uppercase tracking-wider text-primary">What you can hire</span>
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-l from-primary to-plum"></div>
        </div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          Hire the <span class="bg-gradient-to-r from-primary to-plum bg-clip-text text-transparent">talent</span>, skip the overhead.
        </h2>
        <p class="mt-4 text-base text-base-content/60 leading-relaxed">
          Every HiveMind VA is pre-vetted, fluent in English, and backed by the platform and a dedicated
          project manager. Tell us the role — we bring the right person.
        </p>

        <!-- Filter tabs -->
        <div class="flex flex-wrap justify-center gap-2 mt-7">
          <button
            v-for="c in cats"
            :key="c.key"
            type="button"
            class="text-[13px] font-medium rounded-full px-4 py-2 border transition-all duration-150"
            :class="activeCat === c.key
              ? 'bg-primary border-primary text-primary-content shadow-md'
              : 'bg-base-100 border-base-300 text-base-content/70 hover:border-primary hover:text-primary'"
            @click="activeCat = c.key"
          >
            {{ c.label }}
          </button>
        </div>
      </div>

      <!-- Role grid -->
      <div v-reveal="100" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 items-start stagger-children">
        <a
          v-for="r in filtered"
          :key="r.title"
          :href="ctaHref"
          class="group relative block overflow-hidden border border-base-300 rounded-2xl p-5 bg-base-100 hover:border-primary/40 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
        >
          <span
            class="grid place-items-center w-11 h-11 rounded-xl text-xl bg-base-200 border border-base-300 group-hover:bg-primary group-hover:border-primary group-hover:scale-105 transition-all duration-300"
          >{{ r.icon }}</span>
          <h3 class="mt-3.5 font-semibold text-[15px] leading-snug tracking-tight text-base-content">{{ r.title }}</h3>
          <p class="mt-1.5 text-[13px] leading-relaxed text-base-content/60">{{ r.desc }}</p>

          <!-- Hover reveal: skills + link -->
          <div class="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] opacity-0 group-hover:opacity-100 transition-[grid-template-rows,opacity] duration-300">
            <div class="overflow-hidden min-h-0">
              <div class="flex flex-wrap gap-1.5 mt-3">
                <span
                  v-for="s in r.skills"
                  :key="s"
                  class="text-[10.5px] font-medium text-base-content/70 bg-base-200 border border-base-300 rounded-md px-2 py-0.5"
                >{{ s }}</span>
              </div>
              <span class="inline-flex items-center gap-1.5 mt-3 text-[12.5px] font-semibold text-primary">
                Meet a {{ r.title.split(' ')[0] }} VA
                <ArrowRight class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" :stroke-width="2.4" />
              </span>
            </div>
          </div>
        </a>
      </div>

      <!-- Footer line -->
      <div
        v-reveal="200"
        class="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 px-6 py-5 bg-base-200 border border-base-300 rounded-2xl text-center sm:text-left"
      >
        <span class="text-[15px] font-medium text-base-content">Don't see your role? We staff custom positions too.</span>
        <a
          :href="ctaHref"
          class="group inline-flex items-center gap-2 shrink-0 rounded-xl bg-primary text-primary-content font-bold text-[15px] px-5 py-3 hover:bg-primary/90 transition-colors"
        >
          Tell us what you need
          <ArrowRight class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" :stroke-width="2.4" />
        </a>
      </div>
    </div>
  </section>
</template>
