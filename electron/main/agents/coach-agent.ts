// Coach Agent — generates 3-script coaching cards when a "moment" is detected
// (objection, surprise question, deadline, decision point, complaint, etc).
// Returns null when nothing meaningful is happening.

import Store from 'electron-store'

const store = new Store()
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.1-8b-instant'

export interface CoachingCard {
  trigger: string
  category: 'objection' | 'question' | 'deadline' | 'decision' | 'complaint' | 'praise' | 'preference' | 'unknown_answer' | 'other'
  scripts: {
    safe: string
    sharp: string
    bold: string
  }
  capture: string | null
}

const SYSTEM_PROMPT = `You are a real-time conversation coach for a virtual assistant (VA) on a call with their client (a real estate agent or broker). Your goal: make the VA look incredibly smart by giving them ready-to-read scripts when key moments happen.

Speaker labels: "You:" = the VA, "Client:" = the Client.

Detect if a NOTEWORTHY MOMENT just occurred in the new transcript. Categories (in priority order):
  - question: ANY question the client asked the VA — even simple ones. ALWAYS surface scripted answer options. THIS IS YOUR HIGHEST PRIORITY.
  - objection: client pushed back on price/scope/approach
  - deadline: timing/date introduced or shifted
  - decision: a decision is forming or being asked of the VA
  - complaint: frustration, blocker, dissatisfaction
  - praise: positive feedback worth reinforcing
  - preference: client mentioned a working style / tool / channel preference
  - unknown_answer: VA hesitated, said "uh", "let me check"
  - other: something else worth coaching

QUESTION DETECTION RULES:
- Any sentence ending in "?" from the Client → ALWAYS generate a card with category="question"
- Phrases like "do you", "can you", "how", "what", "when", "why", "which", "tell me" from Client → likely a question
- For mock interviews: every interviewer question deserves a card with strong "safe", "sharp", "bold" answers
- If the VA already started answering well, still output the card — they can use it to refine

If NOTHING noteworthy happened (just chitchat, neither side asked or said anything significant), output {"none": true} and nothing else.

If a moment occurred, output a coaching card with this exact shape:
{
  "trigger": "1-line description of what just happened",
  "category": "objection",
  "scripts": {
    "safe": "ready-to-read response that acknowledges and buys time",
    "sharp": "smart clarifying question that surfaces hidden context",
    "bold": "confident proposal or specific action commitment"
  },
  "capture": "1-line note for the playbook (e.g. preference learned, risk to track) — or null if not applicable"
}

SCRIPT RULES:
- Each script is what the VA can literally say next. Make it sound natural and human.
- safe: validates the client and buys 5-10 seconds of thinking room.
- sharp: a senior-agent clarifying question that demonstrates competence.
- bold: a concrete proposal or commitment with a specific timeframe.
- 1-2 sentences max per script. No filler. No "I think" or "maybe".
- Use real estate vocabulary correctly when relevant (listing agreement, contingencies, MLS, dual agency, escrow, EMD, etc.).

Output ONLY the JSON object, no markdown fences, no preamble.`

export async function generateCoachingCard(
  recentTranscript: string,
  newChunk: string
): Promise<CoachingCard | null> {
  const apiKey = store.get('groqApiKey') as string | undefined
  if (!apiKey) return null

  try {
    const userMsg = `Recent context (last ~90 seconds):
${recentTranscript}

Just spoken (this is the moment to evaluate):
${newChunk}

Did a noteworthy moment occur? If yes, generate the coaching card. If not, output {"none": true}.`

    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.6,
        max_tokens: 600,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      console.error('[CoachAgent]', res.status, await res.text())
      return null
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return null

    const parsed = JSON.parse(content)
    if (parsed.none === true || !parsed.scripts) return null

    return {
      trigger: parsed.trigger ?? '',
      category: parsed.category ?? 'other',
      scripts: {
        safe: parsed.scripts.safe ?? '',
        sharp: parsed.scripts.sharp ?? '',
        bold: parsed.scripts.bold ?? '',
      },
      capture: parsed.capture ?? null,
    }
  } catch (err) {
    console.error('[CoachAgent] error:', err)
    return null
  }
}
