<script setup lang="ts">
import AmbientGradient from './AmbientGradient.vue'
import { Mic, Sparkles, Shield, Search, Zap, ListChecks, Layers, X, MousePointerClick, Bookmark } from 'lucide-vue-next'
</script>

<template>
  <section id="hivemind-ai" class="relative py-24 md:py-32 border-t border-base-300 overflow-hidden bg-base-100">
    <!-- Ambient gradient -->
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.12" tone="purple" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="text-center max-w-2xl mx-auto mb-12">
        <div class="flex items-center gap-3 mb-3 justify-center">
          <span class="text-xs font-medium uppercase tracking-wider text-primary">BuzzyHive AI</span>
        </div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          Every meeting, captured.
          <span class="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">Every detail, actioned.</span>
        </h2>
        <p class="mt-4 text-base text-base-content/65 leading-relaxed">
          A desktop AI copilot that joins your VA-client calls. Live transcription, real-time coaching prompts, and auto-generated meeting summaries with action items. Nothing slips through the cracks ever again.
        </p>
      </div>

      <!-- Live mock window -->
      <div v-reveal="100" class="border border-base-300 rounded-xl overflow-hidden bg-base-100 shadow-2xl shadow-purple-500/15">
        <!-- Window chrome -->
        <div class="flex items-center gap-2 px-4 py-2.5 bg-base-200 border-b border-base-300">
          <div class="flex gap-1.5">
            <div class="w-2.5 h-2.5 rounded-full bg-red-400"></div>
            <div class="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
            <div class="w-2.5 h-2.5 rounded-full bg-green-400"></div>
          </div>
          <div class="flex-1 ml-3 flex items-center gap-2">
            <Layers class="w-3.5 h-3.5 text-primary" />
            <span class="text-[11px] font-semibold tracking-tight">BuzzyHive AI</span>
            <span class="ml-2 inline-flex items-center gap-1 text-[10px] text-red-500 font-medium">
              <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
              Recording · 14:32
            </span>
          </div>
        </div>

        <!-- App grid -->
        <div class="grid grid-cols-[260px_1fr] min-h-[500px]">
          <!-- Live Intelligence sidebar -->
          <div class="border-r border-base-300 bg-gradient-to-br from-base-200/30 to-primary/[0.03] flex flex-col">
            <div class="px-4 py-3 border-b border-base-300 flex items-center gap-2">
              <Sparkles class="w-3.5 h-3.5 text-primary" />
              <span class="text-[10px] font-semibold uppercase tracking-wider text-base-content/70">Live Intelligence</span>
              <span class="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            </div>

            <div class="overflow-y-auto p-3 space-y-4 text-xs">
              <!-- Action Items -->
              <section>
                <div class="flex items-center gap-1.5 mb-2">
                  <ListChecks class="w-3 h-3 text-primary" />
                  <span class="text-[9px] uppercase tracking-wider text-base-content/50 font-semibold">Action Items</span>
                </div>
                <ul class="space-y-1.5">
                  <li class="text-[11px] p-2 rounded border border-purple-300/50 ring-1 ring-purple-200 bg-base-100">
                    <div class="flex items-start gap-1 mb-1">
                      <span class="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-primary/15 text-primary">VA</span>
                      <span class="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-purple-500/15 text-purple-600">EXPANDED</span>
                    </div>
                    <div class="text-base-content/85">Send updated CMA with comparable sold within 2 miles</div>
                    <div class="text-[9px] text-base-content/50 mt-1">⏱ End of day</div>
                  </li>
                  <li class="text-[11px] p-2 rounded border border-base-300 bg-base-100">
                    <div class="flex items-start gap-1 mb-1">
                      <span class="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-primary/15 text-primary">VA</span>
                      <span class="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-blue-500/15 text-blue-600">NEW</span>
                    </div>
                    <div class="text-base-content/85">Schedule virtual tour for 412 Oak Ave</div>
                  </li>
                  <li class="text-[11px] p-2 rounded border border-base-300 bg-base-100">
                    <div class="flex items-start gap-1 mb-1">
                      <span class="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-purple-500/15 text-purple-600">CLIENT</span>
                      <span class="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-green-500/15 text-green-600">DONE</span>
                    </div>
                    <div class="line-through text-base-content/50">Confirm pre-approval letter from Wells Fargo</div>
                  </li>
                </ul>
              </section>

              <!-- Decisions -->
              <section>
                <div class="flex items-center gap-1.5 mb-2">
                  <span class="text-[9px] uppercase tracking-wider text-base-content/50 font-semibold">Decisions</span>
                </div>
                <ul class="space-y-1">
                  <li class="text-[11px] text-base-content/80 flex items-start gap-2 pl-1">
                    <span class="shrink-0 w-1 h-1 rounded-full bg-green-500 mt-1.5"></span>
                    <span>List at $675K, ready by Friday</span>
                  </li>
                  <li class="text-[11px] text-base-content/80 flex items-start gap-2 pl-1">
                    <span class="shrink-0 w-1 h-1 rounded-full bg-green-500 mt-1.5"></span>
                    <span>Two-week marketing sprint before open house</span>
                  </li>
                </ul>
              </section>

              <!-- Red Flags -->
              <section>
                <div class="flex items-center gap-1.5 mb-2">
                  <span class="text-[9px] uppercase tracking-wider text-base-content/50 font-semibold">Red Flags</span>
                </div>
                <div class="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2">
                  🚩 Client mentioned competing offer interest — follow up Tuesday
                </div>
              </section>
            </div>
          </div>

          <!-- Right side: transcript + coaching card -->
          <div class="flex flex-col min-w-0">
            <!-- Transcript -->
            <div class="flex-1 overflow-y-auto p-5 space-y-3 text-sm">
              <div class="text-[10px] uppercase tracking-wider text-base-content/40 mb-1">Live Transcript</div>

              <div class="flex gap-2 items-start">
                <span class="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 mt-0.5">Client</span>
                <span class="text-base-content/85 leading-relaxed">So I've been thinking about timing. I really need to be in the new place by end of next month. Is that even realistic?</span>
              </div>

              <div class="flex gap-2 items-start">
                <span class="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary mt-0.5">You</span>
                <span class="text-base-content/85 leading-relaxed">Totally hear you on that timeline. Let me make sure I understand the priorities so we can build the right plan.</span>
              </div>

              <div class="flex gap-2 items-start">
                <span class="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 mt-0.5">Client</span>
                <span class="text-base-content/85 leading-relaxed">Also, what about the inspection? My friend said theirs took weeks to schedule.</span>
              </div>

              <div class="flex gap-2 items-start opacity-50">
                <span class="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary mt-0.5">You</span>
                <span class="text-base-content/85 leading-relaxed italic">um, well, it depends on...</span>
              </div>
            </div>

            <!-- Coaching card -->
            <div class="border-t border-base-300 m-3 mt-0 rounded-lg overflow-hidden bg-base-100 shadow-sm">
              <!-- Card header -->
              <div class="flex items-center gap-2 px-4 py-2 border-b border-base-300 bg-gradient-to-r from-primary/[0.06] to-purple-500/[0.06]">
                <Sparkles class="w-3.5 h-3.5 text-primary" />
                <span class="text-[10px] uppercase tracking-wider text-base-content/60 font-semibold">AI Coach</span>
                <span class="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-700 border-amber-200">Surprise Question</span>
                <button class="ml-auto text-base-content/30 hover:text-base-content/70 transition-colors">
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- Trigger -->
              <div class="px-4 py-2 border-b border-base-300 text-xs text-base-content/70">
                🎯 Client asked about inspection scheduling timeline
              </div>

              <!-- Three scripts -->
              <div class="divide-y divide-base-300">
                <div class="px-4 py-2.5 flex items-start gap-3 hover:bg-base-200/50 transition-colors cursor-pointer">
                  <div class="flex items-center gap-1.5 shrink-0 w-16 mt-0.5">
                    <Shield class="w-3 h-3 text-green-600" />
                    <span class="text-[9px] uppercase tracking-wider font-bold text-green-600">Safe</span>
                  </div>
                  <p class="text-[12px] text-base-content/85 leading-relaxed flex-1">"Great question — I'll connect you with our preferred inspector who can usually book within the week."</p>
                </div>
                <div class="px-4 py-2.5 flex items-start gap-3 hover:bg-base-200/50 transition-colors cursor-pointer">
                  <div class="flex items-center gap-1.5 shrink-0 w-16 mt-0.5">
                    <Search class="w-3 h-3 text-blue-600" />
                    <span class="text-[9px] uppercase tracking-wider font-bold text-blue-600">Sharp</span>
                  </div>
                  <p class="text-[12px] text-base-content/85 leading-relaxed flex-1">"Are you flexible on inspector choice, or do you want to go with someone specific? That changes the timeline."</p>
                </div>
                <div class="px-4 py-2.5 flex items-start gap-3 hover:bg-base-200/50 transition-colors cursor-pointer">
                  <div class="flex items-center gap-1.5 shrink-0 w-16 mt-0.5">
                    <Zap class="w-3 h-3 text-purple-600" />
                    <span class="text-[9px] uppercase tracking-wider font-bold text-purple-600">Bold</span>
                  </div>
                  <p class="text-[12px] text-base-content/85 leading-relaxed flex-1">"I can have an inspector booked by tomorrow morning. Send me your two top time windows and I'll lock it in."</p>
                </div>
              </div>

              <!-- Capture note -->
              <div class="px-4 py-2 bg-primary/[0.03] border-t border-base-300 text-[11px] text-base-content/70 flex items-start gap-1.5">
                <Bookmark class="w-3 h-3 text-primary shrink-0 mt-0.5" />
                <span><span class="text-primary font-semibold">Capture:</span> Client values fast scheduling — add to playbook</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Feature highlights -->
      <div v-reveal="200" class="mt-12 grid md:grid-cols-3 gap-4">
        <div class="border border-base-300 rounded-lg p-5 bg-base-100">
          <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/15 flex items-center justify-center mb-3">
            <Mic class="w-5 h-5 text-primary" />
          </div>
          <h3 class="text-sm font-semibold mb-1">Real-time transcription</h3>
          <p class="text-xs text-base-content/60 leading-relaxed">Captures both sides of the call (mic + system audio). Speaker-aware. ~300ms latency. Works on Zoom, Meet, Teams.</p>
        </div>
        <div class="border border-base-300 rounded-lg p-5 bg-base-100">
          <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/15 flex items-center justify-center mb-3">
            <MousePointerClick class="w-5 h-5 text-primary" />
          </div>
          <h3 class="text-sm font-semibold mb-1">Three scripted answers, one click</h3>
          <p class="text-xs text-base-content/60 leading-relaxed">When a client asks something tough, the AI generates three responses ranging Safe → Sharp → Bold. The VA reads it. Sounds like a senior agent.</p>
        </div>
        <div class="border border-base-300 rounded-lg p-5 bg-base-100">
          <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/15 flex items-center justify-center mb-3">
            <ListChecks class="w-5 h-5 text-primary" />
          </div>
          <h3 class="text-sm font-semibold mb-1">Action items, written live</h3>
          <p class="text-xs text-base-content/60 leading-relaxed">By the time the call ends, every commitment is captured, attributed (VA vs Client), and ready to push into HiveFlow tasks.</p>
        </div>
      </div>

      <!-- CTA -->
      <div v-reveal="300" class="mt-10 text-center">
        <p class="text-base-content/70 mb-4 text-sm">Available exclusively to BuzzyHive clients. No extra cost.</p>
        <a href="#contact" class="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-purple-600 text-white font-medium px-6 py-3 rounded-md hover:opacity-90 transition-opacity text-sm">
          Book a BuzzyHive AI demo
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    </div>
  </section>
</template>
