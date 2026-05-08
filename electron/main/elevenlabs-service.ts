import Store from 'electron-store'

const store = new Store()

export async function transcribeAudioElevenLabs(base64Audio: string, mimeType: string): Promise<string | null> {
  const apiKey = store.get('elevenLabsApiKey') as string | undefined
  if (!apiKey) {
    console.error('[ElevenLabs] No API key configured')
    return null
  }

  try {
    const buffer = Buffer.from(base64Audio, 'base64')
    const blob = new Blob([buffer], { type: mimeType })

    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('ogg') ? 'ogg' : 'wav'

    const form = new FormData()
    form.append('file', blob, `audio.${ext}`)
    form.append('model_id', 'scribe_v2')
    form.append('language_code', 'en')

    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: form,
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[ElevenLabs] API error:', res.status, err)
      return null
    }

    const data = await res.json()
    const text = data.text?.trim() || null
    if (text) console.log('[ElevenLabs] Transcribed:', text)
    return text
  } catch (err) {
    console.error('[ElevenLabs] Transcribe error:', err)
    return null
  }
}
