// Summary Agent — runs once at end of meeting. Synthesizes the final
// structured summary from the full transcript + final intelligence state.

import Store from 'electron-store'
import type { MeetingState } from './action-items-agent'

const store = new Store()
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.1-8b-instant'

const SYSTEM_PROMPT = `You are the meeting summarizer for a VA staffing company. The VA was on a call with their client.

You are given:
1. The full transcript (with "You:" = VA, "Client:" = Client labels)
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

  try {
    const userMsg = `LIVE STATE (captured during the call):
${JSON.stringify(finalState, null, 2)}

FULL TRANSCRIPT:
${fullTranscript}

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

      if (res.status !== 429) break

      // Honor Retry-After header from Groq
      const retryAfter = res.headers.get('retry-after')
      const waitSec = retryAfter ? Math.min(60, parseFloat(retryAfter)) : 8 * (attempt + 1)
      console.log(`[Summary] 429, retrying in ${waitSec}s (attempt ${attempt + 1}/3)`)
      await new Promise(r => setTimeout(r, waitSec * 1000))
    }

    if (!res || !res.ok || !res.body) {
      const errText = res ? await res.text().catch(() => '') : ''
      yield JSON.stringify({
        error: res?.status === 429
          ? 'Rate limit hit. The big model is throttled — wait a minute or switch to llama-3.1-8b in settings later.'
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
