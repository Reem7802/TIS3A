import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'

const API    = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const WS_URL = process.env.NEXT_PUBLIC_WS_URL  || 'ws://localhost:8000'

const INTENT_AR: Record<string,string> = {
  fraud:'احتيال مالي', lost_card:'فقدان البطاقة', duplicate_transaction:'خصم مكرر',
  suspicious_activity:'نشاط مشبوه', account_blocked:'حساب موقوف', wrong_transfer:'تحويل خاطئ',
  card_not_working:'بطاقة معطلة', atm_issue:'مشكلة صراف آلي', '':'غير مصنف',
}
const INTENT_ICON: Record<string,string> = {
  fraud:'🚨', lost_card:'💳', duplicate_transaction:'🔁', suspicious_activity:'⚠️',
  account_blocked:'🔒', wrong_transfer:'↩️', card_not_working:'❌', atm_issue:'🏧', '':'❔',
}
const EMOTION_AR: Record<string,string> = { panic:'هلع', angry:'غضب', frustrated:'إحباط', calm:'هادئ', confused:'مرتبك', worried:'قلق', '':'—' }
const EMOTION_ICON: Record<string,string> = { panic:'😱', angry:'😠', frustrated:'😤', calm:'😌', confused:'😕', worried:'😟', '':'—' }
const PRIORITY_STYLE: Record<string,{bg:string;text:string;border:string;dot:string;label:string}> = {
  CRITICAL:{bg:'rgba(239,68,68,0.12)',text:'#FCA5A5',border:'rgba(239,68,68,0.35)',dot:'#EF4444',label:'حرج جداً'},
  HIGH:    {bg:'rgba(249,115,22,0.12)',text:'#FDBA74',border:'rgba(249,115,22,0.35)',dot:'#F97316',label:'عالي'},
  MEDIUM:  {bg:'rgba(234,179,8,0.12)',text:'#FDE047',border:'rgba(234,179,8,0.35)',dot:'#EAB308',label:'متوسط'},
  LOW:     {bg:'rgba(34,197,94,0.12)',text:'#86EFAC',border:'rgba(34,197,94,0.35)',dot:'#22C55E',label:'منخفض'},
}
const ACTION_AR: Record<string,string> = {
  block_card_immediately:'تم إيقاف البطاقة فوراً', block_card_temporarily:'تم إيقاف البطاقة مؤقتاً',
  create_fraud_report:'تم فتح بلاغ احتيال', create_lost_card_report:'تم تسجيل بلاغ الفقدان',
  flag_account:'تم تأمين الحساب', force_password_reset:'تم طلب تغيير كلمة المرور',
  send_otp_verification:'تم إرسال رمز التحقق', check_transaction_status:'تم التحقق من العملية',
  open_dispute_if_completed:'تم فتح طلب اعتراض', check_duplicate_records:'تم مراجعة السجلات',
  auto_create_complaint:'تم إنشاء الشكوى', create_atm_report:'تم فتح بلاغ الصراف',
  notify_atm_team:'تم إبلاغ فريق الصيانة', run_card_diagnostics:'تم تشخيص البطاقة',
  issue_replacement_card:'تم طلب بطاقة بديلة',
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString('ar-SA', { hour:'2-digit', minute:'2-digit' })
}
function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('ar-SA', { day:'numeric', month:'short' })
}

function StatBox({ icon, label, value, color }: { icon:string; label:string; value:number; color:string }) {
  return (
    <div style={{
      background:'linear-gradient(160deg,#141E33,#0F1629)', borderRadius:16,
      border:'1px solid var(--a-border)', padding:'18px 20px',
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ width:34, height:34, borderRadius:10, background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>{icon}</div>
      </div>
      <p style={{ fontSize:28, fontWeight:700, color:'#fff', lineHeight:1 }}>{value}</p>
      <p style={{ fontSize:12, color:'#7A92B8', marginTop:6 }}>{label}</p>
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function DetailPanel({ call, onClose }: { call:any; onClose:()=>void }) {
  const pc = PRIORITY_STYLE[call.priority] || PRIORITY_STYLE.LOW
  const audioUrl = call.audio_path ? `${API}/dashboard/calls/${call.ticket_number}/audio` : null

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex' }}>
      <div onClick={onClose} style={{ flex:1, background:'rgba(0,0,0,0.6)' }}/>
      <div style={{ width:540, background:'var(--a-bg)', borderRight:'1px solid var(--a-border)', overflowY:'auto', animation:'slideIn .25s ease' }}>
        <div style={{ background:'var(--a-panel)', borderBottom:'1px solid var(--a-border)', padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0 }}>
          <div>
            <p style={{ fontSize:16, fontWeight:700, color:'#fff' }}>{INTENT_ICON[call.intent]} {INTENT_AR[call.intent]}</p>
            <p style={{ fontSize:11, color:'#7A92B8', marginTop:2 }}>{call.ticket_number} · {formatDate(call.created_at)} {formatTime(call.created_at)}</p>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'1px solid var(--a-border)', borderRadius:8, width:32, height:32, cursor:'pointer', color:'#7A92B8' }}>✕</button>
        </div>

        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>

          {/* Status */}
          <div style={{
            background: call.status === 'resolved' ? 'rgba(34,197,94,0.1)' : 'rgba(249,115,22,0.1)',
            border: `1px solid ${call.status === 'resolved' ? 'rgba(34,197,94,0.3)' : 'rgba(249,115,22,0.3)'}`,
            borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between',
          }}>
            <span style={{ fontSize:14, fontWeight:600, color: call.status === 'resolved' ? '#22C55E' : '#F97316' }}>
              {call.status === 'resolved' ? '✅ تم الحل تلقائياً' : '📋 مفتوحة — تحتاج متابعة'}
            </span>
            <span style={{ fontSize:11, color:'#7A92B8' }}>قرار العميل: {call.customer_decision === 'yes' ? 'نعم' : call.customer_decision === 'no' ? 'لا' : '—'}</span>
          </div>

          {/* Priority */}
          <div style={{ background:pc.bg, border:`1.5px solid ${pc.border}`, borderRadius:12, padding:'12px 16px' }}>
            <p style={{ fontSize:11, color:pc.text, fontWeight:600, marginBottom:2 }}>مستوى الأولوية</p>
            <p style={{ fontSize:20, fontWeight:700, color:pc.text }}>{pc.label}</p>
            {call.emotion_boosted ? <p style={{ fontSize:11, color:pc.text, opacity:.8 }}>↑ رُفعت بسبب الحالة العاطفية</p> : null}
          </div>

          {/* Audio player */}
          {audioUrl && (
            <div style={{ background:'var(--a-card)', border:'1px solid var(--a-border)', borderRadius:12, padding:14 }}>
              <p style={{ fontSize:11, color:'#7A92B8', marginBottom:8, fontWeight:600 }}>تسجيل المكالمة</p>
              <audio controls style={{ width:'100%' }}>
                <source src={audioUrl} type="audio/webm"/>
              </audio>
            </div>
          )}

          {/* Transcript */}
          <div style={{ background:'var(--a-card)', border:'1px solid var(--a-border)', borderRadius:12, padding:14 }}>
            <p style={{ fontSize:11, color:'#7A92B8', marginBottom:8, fontWeight:600 }}>نص المحادثة الكامل</p>
            <p style={{ fontSize:13, color:'var(--a-text)', lineHeight:1.8, whiteSpace:'pre-wrap' }}>{call.transcript}</p>
          </div>

          {/* Q&A */}
          {call.questions_asked?.length > 0 && (
            <div style={{ background:'var(--a-card)', border:'1px solid var(--a-border)', borderRadius:12, padding:14 }}>
              <p style={{ fontSize:11, color:'#7A92B8', marginBottom:10, fontWeight:600 }}>الأسئلة والإجابات</p>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {call.questions_asked.map((q:string, i:number) => (
                  <div key={i} style={{ borderRight:'2px solid var(--a-border)', paddingRight:12 }}>
                    <p style={{ fontSize:12, color:'#7A92B8', marginBottom:3 }}>س: {q}</p>
                    <p style={{ fontSize:13, color:'var(--a-text)' }}>ج: {call.answers_collected?.[i] || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions taken */}
          {call.actions_taken?.length > 0 && (
            <div>
              <p style={{ fontSize:11, color:'#7A92B8', marginBottom:8, fontWeight:600 }}>الإجراءات المنفذة</p>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {call.actions_taken.map((a:string) => (
                  <div key={a} style={{ background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#86EFAC' }}>
                    ✓ {ACTION_AR[a] || a}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agent note (if open) */}
          {call.agent_note && (
            <div style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:12, padding:'12px 14px' }}>
              <p style={{ fontSize:10, color:'#F59E0B', marginBottom:4, fontWeight:600 }}>ملاحظة للموظف</p>
              <p style={{ fontSize:13, color:'#FDE68A' }}>{call.agent_note}</p>
            </div>
          )}

          {/* AI scores */}
          <div style={{ background:'var(--a-card)', border:'1px solid var(--a-border)', borderRadius:12, padding:14 }}>
            <p style={{ fontSize:11, color:'#7A92B8', marginBottom:10, fontWeight:600 }}>تحليل الذكاء الاصطناعي</p>
            <div style={{ display:'flex', flexDirection:'column', gap:7, marginBottom:14 }}>
              {Object.entries(call.intent_scores || {}).sort((a:any,b:any)=>b[1]-a[1]).slice(0,4).map(([label,score]:any) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:11, color:'#7A92B8', width:84, textAlign:'right' }}>{INTENT_ICON[label]} {(INTENT_AR[label]||label).slice(0,6)}</span>
                  <div style={{ flex:1, height:5, background:'#1C2A45', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${score*100}%`, background: label===call.intent?'#3B82F6':'#334155', borderRadius:3 }}/>
                  </div>
                  <span style={{ fontSize:11, color:'#93C5FD', minWidth:30 }}>{(score*100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {Object.entries(call.emotion_scores || {}).sort((a:any,b:any)=>b[1]-a[1]).map(([label,score]:any) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:11, color:'#7A92B8', width:70, textAlign:'right' }}>{EMOTION_ICON[label]} {EMOTION_AR[label]}</span>
                  <div style={{ flex:1, height:5, background:'#1C2A45', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${score*100}%`, background: label===call.emotion?'#8B5CF6':'#334155', borderRadius:3 }}/>
                  </div>
                  <span style={{ fontSize:11, color:'#C4B5FD', minWidth:30 }}>{(score*100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AgentDashboard() {
  const [calls,    setCalls]    = useState<any[]>([])
  const [stats,    setStats]    = useState({ total_today:0, fraud_today:0, critical_today:0, open_today:0 })
  const [selected, setSelected] = useState<any>(null)
  const [filter,   setFilter]   = useState<'all'|'open'|'resolved'>('all')
  const [wsStatus, setWsStatus] = useState<'connecting'|'connected'|'disconnected'>('connecting')
  const wsRef = useRef<WebSocket|null>(null)

  const loadData = async () => {
    try {
      const [callsRes, statsRes] = await Promise.all([
        fetch(`${API}/dashboard/calls`), fetch(`${API}/dashboard/stats`),
      ])
      setCalls((await callsRes.json()).calls || [])
      setStats(await statsRes.json())
    } catch {}
  }

  useEffect(() => {
    loadData()
    function connect() {
      const ws = new WebSocket(`${WS_URL}/ws/dashboard`)
      wsRef.current = ws
      ws.onopen = () => setWsStatus('connected')
      ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'new_call') { loadData() }
        } catch {}
      }
      ws.onclose = () => { setWsStatus('disconnected'); setTimeout(connect, 3000) }
      ws.onerror = () => { setWsStatus('disconnected'); ws.close() }
    }
    connect()
    return () => wsRef.current?.close()
  }, [])

  const filtered = filter === 'all' ? calls : calls.filter(c => c.status === filter)

  return (
    <>
      <Head><title>تسعة — لوحة الموظف</title></Head>
      <div style={{ minHeight:'100vh', background:'var(--a-bg)', color:'var(--a-text)' }}>

        <header style={{ background:'var(--a-panel)', borderBottom:'1px solid var(--a-border)', padding:'0 28px', height:58, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100 }}>
          <div style={{ display:'flex', alignItems:'center', gap:24 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:9, background:'linear-gradient(135deg,#2563EB,#1D4ED8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color:'#fff' }}>٩</div>
              <p style={{ fontSize:14, fontWeight:700 }}>تسعة · لوحة الموظف</p>
            </div>
            <nav style={{ display:'flex', gap:16 }}>
              <span style={{ fontSize:13, color:'#fff', fontWeight:600, borderBottom:'2px solid #3B82F6', paddingBottom:18 }}>السجلات</span>
              <Link href="/analytics" style={{ fontSize:13, color:'#7A92B8', textDecoration:'none' }}>التحليلات</Link>
            </nav>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background: wsStatus==='connected'?'#22C55E':'#EF4444' }}/>
            <span style={{ fontSize:11, color:'#7A92B8' }}>{wsStatus==='connected'?'متصل':'منقطع'}</span>
          </div>
        </header>

        <div style={{ padding:'24px 28px' }}>
          {/* 4 stat boxes */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
            <StatBox icon="📞" label="مكالمات اليوم"    value={stats.total_today}    color="#3B82F6"/>
            <StatBox icon="🚨" label="احتيال اليوم"      value={stats.fraud_today}    color="#EF4444"/>
            <StatBox icon="🔴" label="حالات حرجة اليوم"  value={stats.critical_today} color="#F97316"/>
            <StatBox icon="📋" label="مفتوحة — بحاجة متابعة" value={stats.open_today} color="#EAB308"/>
          </div>

          {/* Filter */}
          <div style={{ display:'flex', gap:8, marginBottom:14 }}>
            {[{k:'all',l:'الكل'},{k:'open',l:'📋 مفتوحة'},{k:'resolved',l:'✅ محلولة'}].map(f => (
              <button key={f.k} onClick={() => setFilter(f.k as any)} style={{
                padding:'6px 16px', borderRadius:20, fontSize:12, fontFamily:'inherit', cursor:'pointer',
                background: filter===f.k ? 'rgba(59,130,246,0.2)' : 'transparent',
                border: filter===f.k ? '1px solid rgba(59,130,246,0.5)' : '1px solid var(--a-border)',
                color: filter===f.k ? '#93C5FD' : '#7A92B8',
              }}>{f.l}</button>
            ))}
          </div>

          {/* Table */}
          <div style={{ background:'var(--a-panel)', borderRadius:16, border:'1px solid var(--a-border)', overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'56px 90px 1fr 130px 100px 100px 160px 90px 70px', padding:'12px 20px', borderBottom:'1px solid var(--a-border)', background:'rgba(255,255,255,0.02)' }}>
              {['#','رقم التذكرة','النص','التصنيف','العاطفة','الأولوية','الإجراء','الحالة','الوقت'].map((h,i) => (
                <span key={i} style={{ fontSize:11, color:'#7A92B8', fontWeight:600 }}>{h}</span>
              ))}
            </div>

            {filtered.length === 0 && (
              <div style={{ padding:'60px 24px', textAlign:'center' }}>
                <p style={{ fontSize:30, marginBottom:10 }}>📞</p>
                <p style={{ fontSize:14, color:'#7A92B8' }}>لا توجد سجلات بعد</p>
              </div>
            )}

            {filtered.map((call, i) => {
              const pc = PRIORITY_STYLE[call.priority] || PRIORITY_STYLE.LOW
              return (
                <div key={call.id} onClick={() => setSelected(call)} style={{
                  display:'grid', gridTemplateColumns:'56px 90px 1fr 130px 100px 100px 160px 90px 70px',
                  padding:'13px 20px', borderBottom:'1px solid rgba(28,42,69,0.6)', cursor:'pointer', alignItems:'center',
                }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}
                >
                  <span style={{ fontSize:12, color:'#475569' }}>#{call.id}</span>
                  <span style={{ fontSize:11, color:'#93C5FD' }}>{call.ticket_number}</span>
                  <p style={{ fontSize:13, color:'var(--a-text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:10 }}>{call.customer_text || '—'}</p>
                  <span style={{ fontSize:12 }}>{INTENT_ICON[call.intent]} {INTENT_AR[call.intent]}</span>
                  <span style={{ fontSize:12 }}>{EMOTION_ICON[call.emotion]} {EMOTION_AR[call.emotion]}</span>
                  <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:16, background:pc.bg, color:pc.text, border:`1px solid ${pc.border}`, whiteSpace:'nowrap' }}>{pc.label}</span>
                  <span style={{ fontSize:11, color:'#7A92B8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {call.actions_taken?.[0] ? (ACTION_AR[call.actions_taken[0]] || call.actions_taken[0]) : '—'}
                  </span>
                  <span style={{ fontSize:11, fontWeight:600, color: call.status==='resolved' ? '#22C55E' : '#F97316' }}>
                    {call.status === 'resolved' ? '✅ محلولة' : '📋 مفتوحة'}
                  </span>
                  <span style={{ fontSize:11, color:'#475569' }}>{formatTime(call.created_at)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {selected && <DetailPanel call={selected} onClose={() => setSelected(null)}/>}

      <style>{`
        @keyframes slideIn { from{transform:translateX(-100%);opacity:0} to{transform:translateX(0);opacity:1} }
        * { box-sizing: border-box; }
      `}</style>
    </>
  )
}
