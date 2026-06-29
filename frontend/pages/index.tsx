import { useState, useRef, useCallback, useEffect } from 'react'
import Head from 'next/head'
import { speak, stopSpeaking } from '../utils/tts'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type Phase = 'idle'|'greeting'|'listening'|'analyzing'|'speaking'|'confirming'|'done'|'error'
type OrbMode = 'idle'|'listening'|'speaking'|'analyzing'|'critical'
type Channel = 'voice'|'text'
type Stage = 'opening'|'questions'|'confirm'

// ── Voice Orb ─────────────────────────────────────────────────────────────────
function VoiceOrb({ mode }: { mode: OrbMode }) {
  const colors: Record<OrbMode,{core:string;glow:string}> = {
    idle:      { core:'#2563EB', glow:'rgba(37,99,235,0.3)'  },
    listening: { core:'#1D4ED8', glow:'rgba(29,78,216,0.5)'  },
    speaking:  { core:'#10B981', glow:'rgba(16,185,129,0.5)' },
    analyzing: { core:'#2563EB', glow:'rgba(37,99,235,0.3)'  },
    critical:  { core:'#EF4444', glow:'rgba(239,68,68,0.5)'  },
  }
  const c = colors[mode]
  const animMap: Record<OrbMode,string> = {
    idle: 'orb-idle 3s ease-in-out infinite', listening: 'orb-listen 1.2s ease-in-out infinite',
    speaking: 'orb-speak 0.8s ease-in-out infinite', analyzing: 'spin 2s linear infinite',
    critical: 'orb-idle 1s ease-in-out infinite',
  }
  return (
    <div style={{ position:'relative', width:160, height:160, display:'flex', alignItems:'center', justifyContent:'center' }}>
      {(mode === 'listening' || mode === 'speaking') && (
        <div style={{ position:'absolute', width:'100%', height:'100%', borderRadius:'50%', border:`1.5px solid ${c.glow}`, animation:'ring-pulse 2s ease-out infinite' }}/>
      )}
      <div style={{ position:'absolute', width:120, height:120, borderRadius:'50%', background:`radial-gradient(circle, ${c.glow} 0%, transparent 70%)`, filter:'blur(20px)' }}/>
      <div style={{
        width:110, height:110, borderRadius:'50%', position:'relative', zIndex:2,
        background:`radial-gradient(circle at 35% 35%, ${c.core}, ${c.core}DD)`,
        boxShadow:`0 0 40px ${c.glow}`, animation:animMap[mode],
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        {mode === 'analyzing' ? (
          <div style={{ width:28, height:28, borderRadius:'50%', border:'3px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', animation:'spin .7s linear infinite' }}/>
        ) : mode === 'listening' ? (
          <div style={{ display:'flex', gap:3 }}>
            {Array.from({length:5}).map((_,i) => <div key={i} style={{ width:4, height:18, borderRadius:2, background:'rgba(255,255,255,.9)', animation:'wave-bar .7s ease-in-out infinite', animationDelay:`${i*.12}s` }}/>)}
          </div>
        ) : mode === 'speaking' ? (
          <div style={{ display:'flex', gap:3 }}>
            {Array.from({length:5}).map((_,i) => <div key={i} style={{ width:4, height:14, borderRadius:2, background:'rgba(255,255,255,.9)', animation:'wave-bar .5s ease-in-out infinite', animationDelay:`${i*.1}s` }}/>)}
          </div>
        ) : (
          <span style={{ fontSize:30 }}>🎙️</span>
        )}
      </div>
    </div>
  )
}

// ── Chat bubble ───────────────────────────────────────────────────────────────
function Bubble({ role, text }: { role:'assistant'|'customer'; text:string }) {
  const isAssistant = role === 'assistant'
  return (
    <div className="fade-up" style={{ display:'flex', justifyContent: isAssistant ? 'flex-start' : 'flex-end', width:'100%' }}>
      <div style={{
        maxWidth:280, padding:'11px 15px',
        background: isAssistant ? 'rgba(255,255,255,0.06)' : 'rgba(37,99,235,0.18)',
        border: `1px solid ${isAssistant ? 'var(--c-border)' : 'rgba(37,99,235,0.4)'}`,
        borderRadius: isAssistant ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
      }}>
        <p style={{ fontSize:14, color: isAssistant ? 'var(--c-text)' : '#93C5FD', lineHeight:1.7 }}>{text}</p>
      </div>
    </div>
  )
}

export default function CustomerPage() {
  const [channel,     setChannel]     = useState<Channel>('voice')
  const [phase,        setPhase]       = useState<Phase>('idle')
  const [orbMode,      setOrbMode]     = useState<OrbMode>('idle')
  const [messages,     setMessages]    = useState<{role:'assistant'|'customer';text:string}[]>([])
  const [sessionId,    setSessionId]   = useState('')
  const [stage,        setStage]       = useState<Stage>('opening')
  const [questionIdx,  setQuestionIdx] = useState(0)
  const [answers,      setAnswers]     = useState<string[]>([])
  const [textInput,    setTextInput]   = useState('')
  const [ticketNo,     setTicketNo]    = useState('')
  const [finalStatus,  setFinalStatus] = useState('')
  const [isCritical,   setIsCritical]  = useState(false)

  const mediaRef  = useRef<MediaRecorder|null>(null)
  const chunksRef = useRef<Blob[]>([])
  const chatRef   = useRef<HTMLDivElement>(null)

  useEffect(() => { setTimeout(() => chatRef.current?.scrollTo({ top:9999, behavior:'smooth' }), 80) }, [messages])

  const addMsg = (role:'assistant'|'customer', text:string) => setMessages(p => [...p, { role, text }])

  const doSpeak = useCallback((text:string, cb?:()=>void) => {
    if (channel === 'text') { if (cb) cb(); return }
    setOrbMode('speaking')
    speak(text, () => { setOrbMode('idle'); if (cb) cb() })
  }, [channel])

  // ── Start ──────────────────────────────────────────────────────────────────
  const beginCall = useCallback(() => {
    setPhase('greeting'); setOrbMode('speaking')
    const g = 'مرحباً، أنا تسعة مساعدك البنكي. كيف أقدر أساعدك اليوم؟'
    addMsg('assistant', g)
    if (channel === 'voice') {
      speak(g, () => { setPhase('listening'); setOrbMode('listening'); startRec() })
    } else {
      setPhase('listening')
    }
  }, [channel])

  // ── Recording ──────────────────────────────────────────────────────────────
  const startRec = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true })
      const mr = new MediaRecorder(stream, { mimeType:'audio/webm' })
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size>0) chunksRef.current.push(e.data) }
      mr.start(200)
      mediaRef.current = mr
    } catch { setPhase('error') }
  }, [])

  const stopRec = useCallback((): Promise<Blob> => new Promise(resolve => {
    if (!mediaRef.current || mediaRef.current.state !== 'recording') { resolve(new Blob([])); return }
    mediaRef.current.onstop = () => resolve(new Blob(chunksRef.current, { type:'audio/webm' }))
    mediaRef.current.stop()
    mediaRef.current.stream?.getTracks().forEach(t => t.stop())
  }), [])

  // ── Get text from either voice or typed input ───────────────────────────────
  const getCustomerText = useCallback(async (): Promise<string> => {
    if (channel === 'text') {
      const t = textInput.trim()
      setTextInput('')
      return t
    }
    setPhase('analyzing'); setOrbMode('analyzing')
    const blob = await stopRec()
    if (blob.size < 400) return ''
    const form = new FormData()
    form.append('file', blob, 'audio.webm')
    const res = await fetch(`${API}/analyze`, { method:'POST', body:form })
    const data = await res.json()
    return data.transcript || ''
  }, [channel, textInput, stopRec])

  // ── Submit handler — works for all 3 stages ───────────────────────────────
  const handleSubmit = useCallback(async () => {
    const text = await getCustomerText()
    if (!text) {
      if (channel === 'voice') { setPhase('listening'); setOrbMode('listening'); startRec() }
      return
    }
    addMsg('customer', text)
    setPhase('analyzing'); setOrbMode('analyzing')

    try {
      if (stage === 'opening') {
        const res = await fetch(`${API}/conversation/start`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ text, session_id:sessionId, channel }),
        })
        const d = await res.json()
        setSessionId(d.session_id || '')

        if (d.is_greeting) {
          doSpeak(d.message, () => { setPhase('listening'); setOrbMode('listening'); if(channel==='voice') startRec() })
          addMsg('assistant', d.message)
          return
        }

        const crit = d.priority === 'CRITICAL'
        setIsCritical(crit)
        if (crit) setOrbMode('critical')

        addMsg('assistant', d.message)
        if (d.has_questions) {
          setStage('questions'); setQuestionIdx(0); setAnswers([])
          doSpeak(d.message, () => { setPhase('listening'); setOrbMode(crit?'critical':'listening'); if(channel==='voice') startRec() })
        } else {
          setStage('confirm')
          doSpeak(d.message, () => { setPhase('listening'); setOrbMode(crit?'critical':'listening'); if(channel==='voice') startRec() })
        }

      } else if (stage === 'questions') {
        const res = await fetch(`${API}/conversation/answer`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ text, session_id:sessionId, question_idx:questionIdx, answers }),
        })
        const d = await res.json()
        setAnswers(d.answers || [])
        addMsg('assistant', d.message)

        if (d.ready_to_confirm) {
          setStage('confirm')
          doSpeak(d.message, () => { setPhase('listening'); setOrbMode(isCritical?'critical':'listening'); if(channel==='voice') startRec() })
        } else {
          setQuestionIdx(d.question_idx)
          doSpeak(d.message, () => { setPhase('listening'); setOrbMode(isCritical?'critical':'listening'); if(channel==='voice') startRec() })
        }

      } else if (stage === 'confirm') {
        const res = await fetch(`${API}/conversation/confirm`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ text, session_id:sessionId }),
        })
        const d = await res.json()
        addMsg('assistant', d.message)
        setTicketNo(d.ticket_number || '')
        setFinalStatus(d.status || '')
        doSpeak(d.message, () => { setPhase('done'); setOrbMode('idle') })
      }
    } catch { setPhase('error') }
  }, [stage, sessionId, questionIdx, answers, channel, isCritical, getCustomerText, doSpeak])

  const resetAll = useCallback(() => {
    stopSpeaking()
    setPhase('idle'); setOrbMode('idle'); setMessages([])
    setSessionId(''); setStage('opening'); setQuestionIdx(0); setAnswers([])
    setTicketNo(''); setFinalStatus(''); setIsCritical(false); setTextInput('')
  }, [])

  const isListening = phase === 'listening'

  return (
    <>
      <Head>
        <title>تسعة — اتصل بنا</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
      </Head>

      <div style={{ minHeight:'100vh', background:'var(--c-bg)', display:'flex', flexDirection:'column', maxWidth:430, margin:'0 auto' }}>

        {/* Header */}
        <div style={{ padding:'18px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--c-border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:10, background:'linear-gradient(135deg,#2563EB,#1D4ED8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color:'#fff' }}>٩</div>
            <span style={{ fontSize:15, fontWeight:700, color:'var(--c-text)' }}>تسعة</span>
          </div>
          {phase === 'idle' && (
            <div style={{ display:'flex', background:'rgba(255,255,255,0.05)', borderRadius:10, padding:3, gap:3 }}>
              {(['voice','text'] as Channel[]).map(c => (
                <button key={c} onClick={() => setChannel(c)} style={{
                  padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600,
                  background: channel===c ? '#2563EB' : 'transparent', color: channel===c ? '#fff' : 'var(--c-muted)',
                }}>{c==='voice' ? '🎙️ صوت' : '⌨️ كتابة'}</button>
              ))}
            </div>
          )}
        </div>

        {/* Idle state */}
        {phase === 'idle' && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:28, padding:24 }}>
            <VoiceOrb mode="idle"/>
            <div style={{ textAlign:'center' }}>
              <h1 style={{ fontSize:22, fontWeight:700, color:'var(--c-text)', marginBottom:8 }}>مرحباً بك</h1>
              <p style={{ fontSize:14, color:'var(--c-muted)' }}>
                {channel === 'voice' ? 'اضغط للبدء بالتحدث' : 'اضغط للبدء بالكتابة'}
              </p>
            </div>
            <button onClick={beginCall} style={{
              width:'100%', padding:'15px 0', background:'linear-gradient(135deg,#2563EB,#1D4ED8)',
              border:'none', borderRadius:14, color:'#fff', fontFamily:'inherit', fontSize:15, fontWeight:600, cursor:'pointer',
              boxShadow:'0 8px 24px rgba(37,99,235,0.35)',
            }}>بدء المحادثة</button>
          </div>
        )}

        {/* Active conversation */}
        {phase !== 'idle' && (
          <>
            <div ref={chatRef} style={{ flex:1, overflowY:'auto', padding:'18px 16px', display:'flex', flexDirection:'column', gap:14 }}>
              {messages.map((m,i) => <Bubble key={i} role={m.role} text={m.text}/>)}
              {(phase === 'analyzing' || phase === 'greeting' || phase === 'speaking') && (
                <div style={{ display:'flex', justifyContent:'center', padding:'10px 0' }}>
                  <VoiceOrb mode={orbMode}/>
                </div>
              )}
            </div>

            <div style={{ borderTop:'1px solid var(--c-border)', padding:'16px 18px 28px', flexShrink:0 }}>
              {phase === 'done' ? (
                <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <div style={{
                    background: finalStatus === 'resolved' ? 'rgba(34,197,94,0.1)' : 'rgba(249,115,22,0.1)',
                    border: `1px solid ${finalStatus === 'resolved' ? 'rgba(34,197,94,0.3)' : 'rgba(249,115,22,0.3)'}`,
                    borderRadius:14, padding:16, textAlign:'center',
                  }}>
                    <p style={{ fontSize:20, marginBottom:6 }}>{finalStatus === 'resolved' ? '✅' : '📋'}</p>
                    <p style={{ fontSize:14, fontWeight:600, color: finalStatus === 'resolved' ? '#22C55E' : '#F97316' }}>
                      {finalStatus === 'resolved' ? 'تم حل المشكلة' : 'تم تسجيل طلبك'}
                    </p>
                    {ticketNo && <p style={{ fontSize:12, color:'var(--c-muted)', marginTop:6 }}>رقم التذكرة: {ticketNo}</p>}
                  </div>
                  <button onClick={resetAll} style={{ width:'100%', padding:'13px 0', background:'rgba(37,99,235,0.15)', border:'1px solid rgba(37,99,235,0.4)', borderRadius:12, color:'#93C5FD', fontFamily:'inherit', fontSize:14, fontWeight:600, cursor:'pointer' }}>محادثة جديدة</button>
                </div>
              ) : phase === 'error' ? (
                <button onClick={resetAll} style={{ width:'100%', padding:'13px 0', background:'transparent', border:'1px solid var(--c-border)', borderRadius:12, color:'var(--c-muted)', fontFamily:'inherit', cursor:'pointer' }}>حاول مجدداً</button>
              ) : channel === 'voice' ? (
                isListening && (
                  <button onClick={handleSubmit} style={{
                    width:'100%', padding:'15px 0', background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.4)',
                    borderRadius:14, color:'#FCA5A5', fontFamily:'inherit', fontSize:15, fontWeight:600, cursor:'pointer',
                  }}>⏹ إنهاء الكلام وإرسال</button>
                )
              ) : (
                isListening && (
                  <div style={{ display:'flex', gap:8 }}>
                    <input
                      value={textInput} onChange={e => setTextInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && textInput.trim()) handleSubmit() }}
                      placeholder="اكتب رسالتك..."
                      style={{ flex:1, padding:'13px 16px', background:'rgba(255,255,255,0.05)', border:'1px solid var(--c-border)', borderRadius:12, color:'var(--c-text)', fontFamily:'inherit', fontSize:14, outline:'none' }}
                    />
                    <button onClick={handleSubmit} disabled={!textInput.trim()} style={{
                      padding:'0 20px', background: textInput.trim() ? '#2563EB' : '#1A2540', border:'none', borderRadius:12,
                      color:'#fff', fontFamily:'inherit', fontWeight:600, cursor: textInput.trim() ? 'pointer' : 'not-allowed',
                    }}>إرسال</button>
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
