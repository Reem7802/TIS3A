import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const INTENT_AR: Record<string,string> = {
  fraud:'احتيال مالي', lost_card:'فقدان البطاقة', duplicate_transaction:'خصم مكرر',
  suspicious_activity:'نشاط مشبوه', account_blocked:'حساب موقوف', wrong_transfer:'تحويل خاطئ',
  card_not_working:'بطاقة معطلة', atm_issue:'مشكلة صراف آلي', '':'غير مصنف',
}
const INTENT_ICON: Record<string,string> = {
  fraud:'🚨', lost_card:'💳', duplicate_transaction:'🔁', suspicious_activity:'⚠️',
  account_blocked:'🔒', wrong_transfer:'↩️', card_not_working:'❌', atm_issue:'🏧', '':'❔',
}
const EMOTION_AR: Record<string,string> = { panic:'هلع', angry:'غضب', frustrated:'إحباط', calm:'هادئ', confused:'مرتبك', worried:'قلق' }
const EMOTION_COLOR: Record<string,string> = { panic:'#EF4444', angry:'#F97316', worried:'#EAB308', frustrated:'#F59E0B', confused:'#8B5CF6', calm:'#22C55E' }

// ── Bar chart ─────────────────────────────────────────────────────────────────
function IntentBars({ data }: { data: Record<string,number> }) {
  const entries = Object.entries(data).sort((a,b) => b[1]-a[1])
  const max = Math.max(...entries.map(e => e[1]), 1)
  if (entries.length === 0) return <p style={{ fontSize:12, color:'#475569', textAlign:'center', padding:'30px 0' }}>لا توجد بيانات بعد</p>
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {entries.map(([intent, count]) => (
        <div key={intent} style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:14, width:20 }}>{INTENT_ICON[intent]}</span>
          <span style={{ fontSize:12, color:'#CBD5E1', width:100, flexShrink:0 }}>{INTENT_AR[intent]||intent}</span>
          <div style={{ flex:1, height:20, background:'#141E33', borderRadius:5, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${(count/max)*100}%`, borderRadius:5, background:'linear-gradient(90deg,#1D4ED8,#3B82F6)', boxShadow:'0 0 10px rgba(59,130,246,0.4)' }}/>
          </div>
          <span style={{ fontSize:13, color:'#93C5FD', fontWeight:700, minWidth:24, textAlign:'left' }}>{count}</span>
        </div>
      ))}
    </div>
  )
}

// ── Donut ─────────────────────────────────────────────────────────────────────
function EmotionDonut({ data }: { data: Record<string,number> }) {
  const entries = Object.entries(data)
  const total = entries.reduce((s,[,v]) => s+v, 0) || 1
  const r=70, cx=84, cy=84, stroke=20, circ=2*Math.PI*r
  let cum = 0
  return (
    <div style={{ display:'flex', alignItems:'center', gap:24 }}>
      <svg width={168} height={168} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1C2A45" strokeWidth={stroke}/>
        {entries.map(([emo, count], i) => {
          const pct = count/total, dash = circ*pct, off = -cum*circ
          cum += pct
          return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={EMOTION_COLOR[emo]||'#64748B'} strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`} strokeDashoffset={off}/>
        })}
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {entries.map(([emo, count]) => (
          <div key={emo} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:10, height:10, borderRadius:3, background:EMOTION_COLOR[emo]||'#64748B' }}/>
            <span style={{ fontSize:13, color:'#CBD5E1' }}>{EMOTION_AR[emo]||emo}</span>
            <span style={{ fontSize:12, color:'#7A92B8' }}>({count})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Line chart for daily counts ───────────────────────────────────────────────
function DailyLineChart({ data }: { data: {date:string; count:number}[] }) {
  if (data.length === 0) return <p style={{ fontSize:12, color:'#475569', textAlign:'center', padding:'30px 0' }}>لا توجد بيانات بعد</p>
  const w = 600, h = 140, pad = 20
  const max = Math.max(...data.map(d => d.count), 1)
  const stepX = (w - pad*2) / Math.max(data.length - 1, 1)
  const points = data.map((d,i) => `${pad + i*stepX},${h - pad - (d.count/max)*(h-pad*2)}`).join(' ')
  const area = `${pad},${h-pad} ${points} ${pad+(data.length-1)*stepX},${h-pad}`
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#lineGrad)"/>
      <polyline points={points} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      {data.map((d,i) => (
        <circle key={i} cx={pad + i*stepX} cy={h - pad - (d.count/max)*(h-pad*2)} r="4" fill="#0F1629" stroke="#3B82F6" strokeWidth="2"/>
      ))}
    </svg>
  )
}

// ── Word cloud (pure CSS sizing, no external lib) ─────────────────────────────
function WordCloud({ words }: { words: {text:string; value:number}[] }) {
  if (words.length === 0) return <p style={{ fontSize:12, color:'#475569', textAlign:'center', padding:'40px 0' }}>لا توجد بيانات كافية بعد</p>
  const max = Math.max(...words.map(w => w.value))
  const min = Math.min(...words.map(w => w.value))
  const range = max - min || 1
  const colors = ['#3B82F6','#8B5CF6','#F59E0B','#22C55E','#EF4444','#06B6D4']

  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:14, alignItems:'center', justifyContent:'center', padding:'20px 10px' }}>
      {words.map((w, i) => {
        const sizeRatio = (w.value - min) / range
        const fontSize = 13 + sizeRatio * 32
        const color = colors[i % colors.length]
        return (
          <span key={w.text} style={{
            fontSize, color, fontWeight: sizeRatio > 0.5 ? 700 : 500,
            opacity: 0.6 + sizeRatio * 0.4, lineHeight:1,
          }}>{w.text}</span>
        )
      })}
    </div>
  )
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<any>({ intent_distribution:{}, emotion_distribution:{}, daily_counts:[] })
  const [words,     setWords]     = useState<{text:string;value:number}[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/dashboard/analytics`).then(r => r.json()),
      fetch(`${API}/dashboard/wordcloud`).then(r => r.json()),
    ]).then(([a, w]) => {
      setAnalytics(a)
      setWords(w.words || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const totalCalls = Object.values(analytics.intent_distribution as Record<string,number>).reduce((s:number,v:number) => s+v, 0)

  return (
    <>
      <Head><title>تسعة — التحليلات</title></Head>
      <div style={{ minHeight:'100vh', background:'var(--a-bg)', color:'var(--a-text)' }}>

        <header style={{ background:'var(--a-panel)', borderBottom:'1px solid var(--a-border)', padding:'0 28px', height:58, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100 }}>
          <div style={{ display:'flex', alignItems:'center', gap:24 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:9, background:'linear-gradient(135deg,#2563EB,#1D4ED8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color:'#fff' }}>٩</div>
              <p style={{ fontSize:14, fontWeight:700 }}>تسعة · لوحة الموظف</p>
            </div>
            <nav style={{ display:'flex', gap:16 }}>
              <Link href="/agent" style={{ fontSize:13, color:'#7A92B8', textDecoration:'none' }}>السجلات</Link>
              <span style={{ fontSize:13, color:'#fff', fontWeight:600, borderBottom:'2px solid #3B82F6', paddingBottom:18 }}>التحليلات</span>
            </nav>
          </div>
        </header>

        <div style={{ padding:'24px 28px', display:'flex', flexDirection:'column', gap:20 }}>

          {loading ? (
            <p style={{ fontSize:13, color:'#7A92B8', textAlign:'center', padding:'60px 0' }}>جاري تحميل التحليلات...</p>
          ) : (
            <>
              {/* Top row: intent bars + emotion donut */}
              <div style={{ display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:20 }}>
                <div style={{ background:'linear-gradient(160deg,#141E33,#0F1629)', borderRadius:18, border:'1px solid var(--a-border)', padding:22 }}>
                  <p style={{ fontSize:14, fontWeight:700, marginBottom:18 }}>توزيع المشاكل ({totalCalls} مكالمة)</p>
                  <IntentBars data={analytics.intent_distribution}/>
                </div>
                <div style={{ background:'linear-gradient(160deg,#141E33,#0F1629)', borderRadius:18, border:'1px solid var(--a-border)', padding:22, display:'flex', flexDirection:'column' }}>
                  <p style={{ fontSize:14, fontWeight:700, marginBottom:18 }}>توزيع المشاعر</p>
                  <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <EmotionDonut data={analytics.emotion_distribution}/>
                  </div>
                </div>
              </div>

              {/* Daily trend */}
              <div style={{ background:'linear-gradient(160deg,#141E33,#0F1629)', borderRadius:18, border:'1px solid var(--a-border)', padding:22 }}>
                <p style={{ fontSize:14, fontWeight:700, marginBottom:18 }}>عدد المكالمات — آخر 14 يوم</p>
                <DailyLineChart data={analytics.daily_counts}/>
              </div>

              {/* Word cloud */}
              <div style={{ background:'linear-gradient(160deg,#141E33,#0F1629)', borderRadius:18, border:'1px solid var(--a-border)', padding:22 }}>
                <p style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>الكلمات الأكثر استخداماً من العملاء</p>
                <p style={{ fontSize:11, color:'#7A92B8', marginBottom:10 }}>حجم الكلمة يعكس عدد مرات تكرارها</p>
                <WordCloud words={words}/>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
