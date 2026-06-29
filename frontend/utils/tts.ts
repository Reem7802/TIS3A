const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
let currentAudio: HTMLAudioElement | null = null

export function stopSpeaking() {
  if (currentAudio) { currentAudio.pause(); currentAudio.src = ''; currentAudio = null }
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
}

export async function speak(text: string, onEnd?: () => void): Promise<void> {
  if (typeof window === 'undefined') { if (onEnd) onEnd(); return }
  stopSpeaking()
  try {
    const res = await fetch(`${API}/tts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`TTS error: ${res.status}`)
    const blob = await res.blob()
    if (blob.size === 0) throw new Error('Empty audio')
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    currentAudio = audio
    audio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; if (onEnd) onEnd() }
    audio.onerror = () => { URL.revokeObjectURL(url); currentAudio = null; if (onEnd) onEnd() }
    await audio.play()
  } catch (err) {
    console.error('TTS failed:', err)
    currentAudio = null
    if (onEnd) onEnd()
  }
}
