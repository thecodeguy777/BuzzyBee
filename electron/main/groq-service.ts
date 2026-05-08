import Store from 'electron-store'

const store = new Store()

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

const COACHING_SYSTEM_PROMPT = `You are a real-time meeting coach for a virtual assistant (VA) on a call with their client (a real estate agent or broker).

The transcript labels speakers explicitly:
- "You:" = the VA (the person you are coaching)
- "Client:" = the client speaking

Provide ONE short, actionable coaching prompt (1-2 sentences max, addressed TO the VA) to help the VA perform better. Focus on:
- Following up on something the Client mentioned
- Asking a clarifying question about a task or deadline the Client raised
- Noting a Client preference or complaint that should be documented

Rules:
- Keep it to 1-2 sentences max
- Be specific, not generic
- If nothing actionable, respond with just "—"
- Output only the coaching prompt, no preamble`

const SUMMARY_SYSTEM_PROMPT = `You are a meeting intelligence system for a VA staffing company. Analyze the meeting transcript between a virtual assistant (the VA) and their client.

The transcript labels speakers explicitly:
- "You:" = the VA
- "Client:" = the client (a real estate agent / broker)

Output ONLY a valid JSON object (no markdown fences) with exactly this format:
{
  "summary": "2-3 sentence overview of what was discussed",
  "keyDecisions": ["decision 1", "decision 2"],
  "actionItems": [
    { "task": "description", "assignee": "VA" or "Client", "deadline": "if mentioned, else null" }
  ],
  "clientPreferences": ["preferences or working style notes the Client mentioned"],
  "followUps": ["things the VA should check on next meeting"]
}

Use the speaker labels to correctly assign action items. Be specific. Extract real deadlines and names. If something wasn't discussed, use an empty array.`

function getApiKey(): string | null {
  return (store.get('groqApiKey') as string | undefined) || null
}

export async function generateCoachingPromptGroq(recentTranscript: string): Promise<string | null> {
  const apiKey = getApiKey()
  if (!apiKey) return null

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: COACHING_SYSTEM_PROMPT },
          { role: 'user', content: `Recent transcript:\n${recentTranscript}` },
        ],
        temperature: 0.5,
        max_tokens: 100,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[Groq] Coaching error:', res.status, err)
      return null
    }

    const data = await res.json()
    const text: string = data.choices?.[0]?.message?.content?.trim() || ''
    if (!text || text === '—' || text === '-' || text.length < 5) return null
    return text
  } catch (err) {
    console.error('[Groq] Coaching request failed:', err)
    return null
  }
}

export async function* generateMeetingSummaryGroq(fullTranscript: string): AsyncGenerator<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    yield JSON.stringify({ error: 'No Groq API key configured. Add it in Settings.' })
    return
  }

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: `Transcript:\n${fullTranscript}` },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
        stream: true,
      }),
    })

    if (!res.ok || !res.body) {
      const err = await res.text()
      console.error('[Groq] Summary error:', res.status, err)
      yield JSON.stringify({ error: `Groq API error: ${res.status}` })
      return
    }

    // Parse SSE stream
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
        } catch {
          // skip malformed chunks
        }
      }
    }
  } catch (err) {
    console.error('[Groq] Summary request failed:', err)
    yield JSON.stringify({ error: String(err) })
  }
}
