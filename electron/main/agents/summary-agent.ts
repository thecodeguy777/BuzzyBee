// Summary Agent — runs once at end of meeting. Synthesizes the final
// structured summary from the full transcript + final intelligence state.

import Store from 'electron-store'
import type { MeetingState } from './action-items-agent'

const store = new Store()
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.1-8b-instant'

const SYSTEM_PROMPT = `You are the meeting summarizer for a VA staffing company. The VA was on a call with their client — a business owner (real estate, construction/commercial, content, or another small business). Infer the domain from the transcript; don't assume real estate.

You are given:
1. The full transcript. "You:" = the VA. Any other speaker label ("Client", "Client · 2", or a person's name) is on the client side, which may include more than one person — attribute decisions and action items to the right party.
2. The live intelligence state captured during the call (already-extracted action items, decisions, etc.)

Your job: produce a polished, executive-ready summary in this exact JSON shape:

{
  "summary": "2-3 sentence overview suitable for an executive: what was discussed, what was decided.",
  "keyDecisions": ["decision 1", "decision 2"],
  "actionItems": [
    { "task": "concrete task description", "assignee": "VA" or "Client", "deadline": "if mentioned, else null" }
  ],
  "clientPreferences": ["preferences/tools/working style notes"],
  "followUps": ["specific things the VA should check/raise next meeting"],
  "redFlags": ["risks worth tracking"]
}

Use the LIVE STATE as the canonical source — fix obvious errors against the transcript but trust it as your starting point. Be concise. Be specific (real names, real dates). No fluff. Output ONLY the JSON.`

export async function* generateFinalSummary(
  fullTranscript: string,
  finalState: MeetingState
): AsyncGenerator<string> {
  const apiKey = store.get('groqApiKey') as string | undefined
  if (!apiKey) {
    yield JSON.stringify({ error: 'No Groq API key configured.' })
    return
  }

  // Stay well under Groq free-tier 8b TPM (6000/min). Approx tokens ≈ chars/4.
  // Budget: ~3000 chars transcript + state JSON + system prompt = ~1500 tokens per request.
  // If transcript is longer, keep the head (intros/setup) and tail (closing/decisions),
  // dropping the chatty middle.
  const MAX_TRANSCRIPT_CHARS = 6000
  function trimTranscript(text: string): string {
    if (text.length <= MAX_TRANSCRIPT_CHARS) return text
    const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2)
    return text.slice(0, half) + '\n\n[…middle of transcript trimmed for length…]\n\n' + text.slice(-half)
  }

  try {
    const trimmedTranscript = trimTranscript(fullTranscript)
    const userMsg = `LIVE STATE (already extracted during the call — trust this as the source of truth):
${JSON.stringify(finalState, null, 2)}

TRANSCRIPT (may be trimmed if very long — use the live state above as canonical):
${trimmedTranscript}

Produce the final summary JSON.`

    let res: Response | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(GROQ_URL, {
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
          temperature: 0.3,
          max_tokens: 1500,
          response_format: { type: 'json_object' },
          stream: true,
        }),
      })

      // Both 413 (too large) and 429 (rate limit) are recoverable with backoff
      if (res.status !== 429 && res.status !== 413) break

      const retryAfter = res.headers.get('retry-after')
      const waitSec = retryAfter ? Math.min(60, parseFloat(retryAfter)) : 8 * (attempt + 1)
      console.log(`[Summary] ${res.status}, retrying in ${waitSec}s (attempt ${attempt + 1}/3)`)
      await new Promise(r => setTimeout(r, waitSec * 1000))
    }

    if (!res || !res.ok || !res.body) {
      const errText = res ? await res.text().catch(() => '') : ''
      yield JSON.stringify({
        error: res?.status === 429 || res?.status === 413
          ? 'Groq rate limit hit. Wait ~60s and click Generate again.'
          : `Groq error: ${res?.status} ${errText.slice(0, 200)}`,
      })
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') return
        try {
          const json = JSON.parse(payload)
          const delta = json.choices?.[0]?.delta?.content
          if (delta) yield delta
        } catch { /* skip malformed */ }
      }
    }
  } catch (err) {
    yield JSON.stringify({ error: String(err) })
  }
}
