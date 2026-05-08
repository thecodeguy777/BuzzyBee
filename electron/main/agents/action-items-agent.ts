// Action Items Agent — maintains the living state of the meeting:
// action items, open questions, decisions, client preferences, red flags.

import Store from 'electron-store'

const store = new Store()
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.1-8b-instant'

export interface ActionItem {
  id: string
  task: string
  assignee: 'VA' | 'Client'
  deadline: string | null
  status: 'new' | 'expanded' | 'simplified' | 'done'
}

export interface OpenQuestion {
  id: string
  question: string
  asked_by: 'VA' | 'Client'
  context: string
}

export interface Decision {
  id: string
  decision: string
}

export interface RedFlag {
  id: string
  flag: string
}

export interface MeetingState {
  actionItems: ActionItem[]
  openQuestions: OpenQuestion[]
  decisions: Decision[]
  clientPreferences: string[]
  redFlags: string[]
}

export const EMPTY_STATE: MeetingState = {
  actionItems: [],
  openQuestions: [],
  decisions: [],
  clientPreferences: [],
  redFlags: [],
}

const SYSTEM_PROMPT = `You are the meeting intelligence engine for a virtual assistant (VA) on a call with their client (a real estate agent or broker).

Your job: maintain a LIVING STATE of the meeting that evolves as new transcript chunks arrive. The state has 5 lists:
  - actionItems: tasks assigned to VA or Client
  - openQuestions: things asked but not yet answered
  - decisions: choices that have been made
  - clientPreferences: working style, tools, channels the Client mentioned
  - redFlags: concerning patterns (repeated deadline changes, vague scope, frustration signals)

CRITICAL RULES:
1. You receive the CURRENT state and NEW transcript text.
2. Output the FULL UPDATED state — never partial.
3. Preserve existing items by their "id". Modify them in place if new info arrived.
4. Set status correctly:
   - "new" — just added in this update
   - "expanded" — existing item with new detail (e.g., deadline added, scope clarified)
   - "simplified" — was vague, now clear
   - "done" — completed during the call
5. If a question gets answered, MOVE it from openQuestions to decisions (or remove if minor).
6. Keep items concise (one sentence). Be specific. Use real names and dates.
7. Use the speaker labels in the transcript: "You:" = VA, "Client:" = Client.
8. Output ONLY a valid JSON object matching this shape (no markdown fences):

{
  "actionItems": [{"id":"a1","task":"...","assignee":"VA","deadline":"...","status":"new"}],
  "openQuestions": [{"id":"q1","question":"...","asked_by":"Client","context":"..."}],
  "decisions": [{"id":"d1","decision":"..."}],
  "clientPreferences": ["...","..."],
  "redFlags": ["...","..."]
}`

export async function updateMeetingState(
  currentState: MeetingState,
  newTranscriptChunk: string
): Promise<MeetingState> {
  const apiKey = store.get('groqApiKey') as string | undefined
  if (!apiKey) return currentState

  try {
    const userMsg = `CURRENT STATE:
${JSON.stringify(currentState, null, 2)}

NEW TRANSCRIPT (since last update):
${newTranscriptChunk}

Update the state. Output only the JSON.`

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
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      console.error('[ActionItemsAgent]', res.status, await res.text())
      return currentState
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return currentState

    const parsed = JSON.parse(content)

    // Defensively shape the response
    return {
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : currentState.actionItems,
      openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions : currentState.openQuestions,
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : currentState.decisions,
      clientPreferences: Array.isArray(parsed.clientPreferences) ? parsed.clientPreferences : currentState.clientPreferences,
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : currentState.redFlags,
    }
  } catch (err) {
    console.error('[ActionItemsAgent] error:', err)
    return currentState
  }
}
