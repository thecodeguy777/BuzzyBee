import { GoogleGenerativeAI } from '@google/generative-ai'
import Store from 'electron-store'

const store = new Store()

function getClient(): GoogleGenerativeAI | null {
  const apiKey = store.get('geminiApiKey') as string | undefined
  if (!apiKey) return null
  return new GoogleGenerativeAI(apiKey)
}

const COACHING_SYSTEM_PROMPT = `You are a real-time meeting coach for a virtual assistant (VA) who is on a call with their client (a real estate agent or broker).

The transcript labels speakers explicitly:
- "You:" = the VA (the person you are coaching)
- "Client:" = the client speaking

Based on the recent transcript, provide ONE short, actionable coaching prompt to help the VA perform better. Focus on:
- Following up on something the Client mentioned
- Asking a clarifying question about a task or deadline the Client raised
- Noting a Client preference or complaint that should be documented
- Suggesting the VA's next step or action item

Rules:
- Keep it to 1-2 sentences max, addressed TO the VA ("Ask the client about...", "Follow up on...")
- Be specific, not generic
- If nothing actionable, respond with just "—"
- Never repeat a previous coaching prompt`

const SUMMARY_SYSTEM_PROMPT = `You are a meeting intelligence system for a VA staffing company. Analyze the following meeting transcript between a virtual assistant (the VA) and their client.

The transcript labels speakers explicitly:
- "You:" = the VA
- "Client:" = the client (a real estate agent / broker)

Generate a structured JSON response with exactly this format:
{
  "summary": "2-3 sentence overview of what was discussed",
  "keyDecisions": ["decision 1", "decision 2"],
  "actionItems": [
    { "task": "description", "assignee": "VA" or "Client", "deadline": "if mentioned" }
  ],
  "clientPreferences": ["any preferences, working style, or tools the Client mentioned"],
  "followUps": ["things the VA should check on next meeting"]
}

Use the speaker labels to correctly assign action items. If the Client said they would do something, assignee = "Client". If the VA committed to something, assignee = "VA". Be specific. Extract real deadlines and names. If something wasn't discussed, use an empty array.`

export async function transcribeAudio(base64Audio: string, mimeType: string): Promise<string | null> {
  const client = getClient()
  if (!client) {
    console.error('[Gemini] No API key configured')
    return null
  }

  try {
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Audio,
          mimeType,
        },
      },
      { text: 'Transcribe the audio verbatim. Output only the transcribed text, nothing else. If there is no clear speech, output an empty string.' },
    ])
    const text = result.response.text().trim()
    return text
  } catch (err) {
    console.error('[Gemini] Transcribe error:', err)
    return null
  }
}

export async function generateCoachingPrompt(recentTranscript: string): Promise<string | null> {
  const client = getClient()
  if (!client) return null

  try {
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })
    const result = await model.generateContent(
      `${COACHING_SYSTEM_PROMPT}\n\nRecent transcript:\n${recentTranscript}`
    )
    const text = result.response.text().trim()
    if (text === '—' || text === '-' || text.length < 5) return null
    return text
  } catch (err) {
    console.error('[Gemini] Coaching prompt error:', err)
    return null
  }
}

export async function* generateMeetingSummary(fullTranscript: string): AsyncGenerator<string> {
  const client = getClient()
  if (!client) {
    yield JSON.stringify({ error: 'No Gemini API key configured' })
    return
  }

  try {
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })
    const result = await model.generateContentStream(
      `${SUMMARY_SYSTEM_PROMPT}\n\nFull transcript:\n${fullTranscript}`
    )

    for await (const chunk of result.stream) {
      const text = chunk.text()
      if (text) yield text
    }
  } catch (err) {
    console.error('[Gemini] Summary error:', err)
    yield JSON.stringify({ error: String(err) })
  }
}
