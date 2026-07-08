import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'

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
const EMOTION_AR: Record<string,string> = {
  panic:'هلع', angry:'غضب', frustrated:'إحباط', calm:'هادئ', confused:'مرتبك', worried:'قلق', '':'—'
}
const EMOTION_ICON: Record<string,string> = {
  panic:'😱', angry:'😠', frustrated:'😤', calm:'😌', confused:'😕', worried:'😟', '':'—'
}
const EMOTION_COLOR: Record<string,string> = {
  panic:'#EF4444', angry:'#F97316', frustrated:'#F59E0B',
  calm:'#22C55E', confused:'#8B5CF6', worried:'#EAB308',
}
const PRIORITY_STYLE: Record<string,{bg:string;text:string;border:string;dot:string;label:string}> = {
  CRITICAL:{bg:'rgba(239,68,68,0.12)',text:'#FCA5A5',border:'rgba(239,68,68,0.35)',dot:'#EF4444',label:'حرج جداً'},
  HIGH:    {bg:'rgba(249,115,22,0.12)',text:'#FDBA74',border:'rgba(249,115,22,0.35)',dot:'#F97316',label:'عالي'},
  MEDIUM:  {bg:'rgba(234,179,8,0.12)',text:'#FDE047',border:'rgba(234,179,8,0.35)',dot:'#EAB308',label:'متوسط'},
  LOW:     {bg:'rgba(34,197,94,0.12)',text:'#86EFAC',border:'rgba(34,197,94,0.35)',dot:'#22C55E',label:'منخفض'},
}
const ACTION_AR: Record<string,string> = {
  block_card_immediately:'تم إيقاف البطاقة فوراً', block_card_temporarily:'تم إيقاف البطاقة مؤقتاً',
  freeze_card_24h:'تم تجميد البطاقة 24 ساعة', set_daily_limit_200:'تم تحديد حد سحب 200 ريال',
  create_fraud_report:'تم فتح بلاغ احتيال', create_lost_card_report:'تم تسجيل بلاغ الفقدان',
  flag_account:'تم تأمين الحساب', force_password_reset:'تم طلب تغيير كلمة المرور',
  enable_login_alerts:'تم تفعيل تنبيهات الدخول', send_otp_verification:'تم إرسال OTP',
  schedule_branch_appointment:'تم حجز موعد فرع', check_transaction_status:'تم التحقق من العملية',
  open_dispute_if_completed:'تم فتح طلب اعتراض', initiate_informal_recall_request:'تم بدء استرجاع ودي',
  check_duplicate_records:'تم مراجعة السجلات', auto_create_complaint:'تم إنشاء الشكوى',
  send_records_confirmation:'تم إرسال تأكيد السجلات', create_atm_report:'تم فتح بلاغ الصراف',
  notify_atm_team:'تم إبلاغ فريق الصيانة', send_self_report_link:'تم إرسال رابط البلاغ',
  run_card_diagnostics:'تم تشخيص البطاقة', issue_replacement_card:'تم طلب بطاقة بديلة',
  remote_card_reactivation:'تم إعادة تفعيل البطاقة',
}

function formatTime(ts: number) {
  return new Date(ts*1000).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})
}
function formatDate(ts: number) {
  return new Date(ts*1000).toLocaleDateString('ar-SA',{day:'numeric',month:'short'})
}

// ── Shared header ─────────────────────────────────────────────────────────────
function Header({ wsStatus, title, subtitle, right }: { wsStatus:string; title:string; subtitle?:string; right?:React.ReactNode }) {
  return (
    <header style={{ background:'#0F1629', borderBottom:'1px solid #1C2A45', padding:'0 24px', height:56, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#2563EB,#1D4ED8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#fff' }}>٩</div>
        <div>
          <p style={{ fontSize:13, fontWeight:700, color:'#E2E8F0' }}>{title}</p>
          {subtitle && <p style={{ fontSize:10, color:'#475569' }}>{subtitle}</p>}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        {right}
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:wsStatus==='connected'?'#22C55E':'#EF4444', boxShadow:wsStatus==='connected'?'0 0 6px #22C55E':'none' }}/>
          <span style={{ fontSize:10, color:'#475569' }}>{wsStatus==='connected'?'متصل':'منقطع'}</span>
        </div>
      </div>
    </header>
  )
}

function BackBtn({ onClick, label='← رجوع' }: { onClick:()=>void; label?:string }) {
  return (
    <button onClick={onClick} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid #1C2A45', borderRadius:8, padding:'6px 14px', cursor:'pointer', color:'#7A92B8', fontFamily:'inherit', fontSize:12 }}>{label}</button>
  )
}

// ── Score bar component ───────────────────────────────────────────────────────
function ScoreBar({ label, score, color, isTop }: { label:string; score:number; color:string; isTop:boolean }) {
  const pct = Math.round(score * 100)
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span style={{ fontSize:11, color: isTop ? '#E2E8F0' : '#475569', width:80, flexShrink:0, fontWeight: isTop ? 600 : 400 }}>{label}</span>
      <div style={{ flex:1, height: isTop ? 8 : 5, background:'#0A0E1A', borderRadius:4, overflow:'hidden' }}>
        <div style={{
          height:'100%', width:`${pct}%`, borderRadius:4,
          background: isTop ? `linear-gradient(90deg, ${color}99, ${color})` : '#1C2A45',
          transition:'width .6s ease',
          boxShadow: isTop ? `0 0 8px ${color}66` : 'none',
        }}/>
      </div>
      <span style={{ fontSize:11, color: isTop ? color : '#334155', fontWeight: isTop ? 700 : 400, minWidth:30, textAlign:'left' }}>{pct}%</span>
    </div>
  )
}

// ════════════════════════════════════════════════════════
//  VIEW 3 — TWIN VIEW (conversation + both MARBERT models)
// ════════════════════════════════════════════════════════
function TwinView({ call, onBack, wsStatus }: { call:any; onBack:()=>void; wsStatus:string }) {
  const pc = PRIORITY_STYLE[call.priority] || PRIORITY_STYLE.LOW
  const audioUrl = call.audio_path ? `${API}/dashboard/calls/${call.ticket_number}/audio` : null
  const intentScores  = call.intent_scores  || {}
  const emotionScores = call.emotion_scores || {}
  const questions = call.questions_asked  || []
  const answers   = call.answers_collected || []

  // Build full transcript from pipe-separated turns as fallback
  const transcriptTurns = (call.transcript || '').split(' | ').filter((t:string) => t.trim())

  return (
    <div style={{ minHeight:'100vh', background:'#0A0E1A', color:'#E2E8F0', display:'flex', flexDirection:'column' }}>
      <Header wsStatus={wsStatus} title="Twin View — المحادثة + تحليل النموذجين" subtitle={`${call.ticket_number} · ${INTENT_AR[call.intent]||call.intent}`} right={<BackBtn onClick={onBack} label="← ملخص المكالمة"/>}/>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', flex:1, overflow:'hidden', height:'calc(100vh - 56px)' }}>

        {/* ── LEFT: Full conversation ── */}
        <div style={{ borderLeft:'1px solid #1C2A45', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'10px 16px', borderBottom:'1px solid #1C2A45', background:'rgba(37,99,235,0.05)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <p style={{ fontSize:12, fontWeight:700, color:'#93C5FD' }}>💬 المحادثة الكاملة</p>
            <p style={{ fontSize:10, color:'#475569' }}>
              {questions.length > 0 ? `${questions.length} سؤال + ${answers.length} إجابة` : `${transcriptTurns.length} رسالة`}
            </p>
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:'16px' }} dir="rtl">
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

              {/* Customer first message */}
              {call.customer_text && (
                <div style={{ display:'flex', justifyContent:'flex-end' }}>
                  <div>
                    <p style={{ fontSize:9, color:'#334155', marginBottom:3, textAlign:'left' }}>العميل</p>
                    <div style={{ maxWidth:260, padding:'9px 13px', background:'rgba(37,99,235,0.2)', border:'1px solid rgba(37,99,235,0.4)', borderRadius:'14px 4px 14px 14px' }}>
                      <p style={{ fontSize:13, color:'#93C5FD', lineHeight:1.6 }}>{call.customer_text}</p>
                    </div>
                  </div>
                </div>
              )}

              {questions.length > 0 ? (
                /* Render Q&A pairs from stored questions/answers */
                questions.map((q: string, i: number) => (
                  <div key={i} style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ display:'flex', justifyContent:'flex-start' }}>
                      <div>
                        <p style={{ fontSize:9, color:'#334155', marginBottom:3 }}>تسعة</p>
                        <div style={{ display:'flex', gap:7, maxWidth:280 }}>
                          <div style={{ width:22, height:22, borderRadius:'50%', background:'linear-gradient(135deg,#2563EB,#1D4ED8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'#fff', flexShrink:0, marginTop:2 }}>٩</div>
                          <div style={{ padding:'9px 13px', background:'rgba(255,255,255,0.05)', border:'1px solid #1C2A45', borderRadius:'4px 14px 14px 14px' }}>
                            <p style={{ fontSize:13, color:'#E2E8F0', lineHeight:1.6 }}>{q}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    {answers[i] && (
                      <div style={{ display:'flex', justifyContent:'flex-end' }}>
                        <div>
                          <p style={{ fontSize:9, color:'#334155', marginBottom:3, textAlign:'left' }}>العميل</p>
                          <div style={{ maxWidth:260, padding:'9px 13px', background:'rgba(37,99,235,0.2)', border:'1px solid rgba(37,99,235,0.4)', borderRadius:'14px 4px 14px 14px' }}>
                            <p style={{ fontSize:13, color:'#93C5FD', lineHeight:1.6 }}>{answers[i]}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : transcriptTurns.length > 1 ? (
                /* Fallback: pipe-separated transcript turns */
                transcriptTurns.slice(1).map((turn: string, i: number) => {
                  const isCustomer = i % 2 === 1
                  return (
                    <div key={i} style={{ display:'flex', justifyContent: isCustomer?'flex-end':'flex-start' }}>
                      <div>
                        <p style={{ fontSize:9, color:'#334155', marginBottom:3, textAlign: isCustomer?'left':'right' }}>{isCustomer?'العميل':'تسعة'}</p>
                        <div style={{ maxWidth:260, padding:'9px 13px', background: isCustomer?'rgba(37,99,235,0.2)':'rgba(255,255,255,0.05)', border:`1px solid ${isCustomer?'rgba(37,99,235,0.4)':'#1C2A45'}`, borderRadius: isCustomer?'14px 4px 14px 14px':'4px 14px 14px 14px' }}>
                          <p style={{ fontSize:13, color: isCustomer?'#93C5FD':'#E2E8F0', lineHeight:1.6 }}>{turn}</p>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : null}

              {/* Decision indicator */}
              {call.customer_decision && (
                <div style={{ display:'flex', justifyContent:'center', padding:'8px 0' }}>
                  <span style={{
                    fontSize:11, padding:'5px 14px', borderRadius:20,
                    background: call.customer_decision.startsWith('yes')?'rgba(34,197,94,0.1)':'rgba(249,115,22,0.1)',
                    color: call.customer_decision.startsWith('yes')?'#22C55E':'#F97316',
                    border:`1px solid ${call.customer_decision.startsWith('yes')?'rgba(34,197,94,0.3)':'rgba(249,115,22,0.3)'}`,
                  }}>
                    {call.customer_decision==='yes'?'✓ وافق على الإجراء الأول':call.customer_decision==='yes_counter'?'✓ وافق على العرض البديل بعد التفاوض':'✗ رفض كلا العرضين — الحالة مفتوحة'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {audioUrl && (
            <div style={{ padding:'10px 14px', borderTop:'1px solid #1C2A45', flexShrink:0 }}>
              <p style={{ fontSize:10, color:'#475569', marginBottom:5 }}>🎙️ تسجيل المكالمة</p>
              <audio controls style={{ width:'100%', height:28 }}>
                <source src={audioUrl} type="audio/webm"/>
              </audio>
            </div>
          )}
        </div>

        {/* ── RIGHT: Both MARBERT models' output ── */}
        <div style={{ display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'10px 16px', borderBottom:'1px solid #1C2A45', background:'rgba(139,92,246,0.05)', flexShrink:0 }}>
            <p style={{ fontSize:12, fontWeight:700, color:'#C4B5FD' }}>🧠 تحليل نموذجَي MARBERT</p>
            <p style={{ fontSize:10, color:'#475569', marginTop:2 }}>Intent Model + Emotion Model — كلاهما مدرَّبان على بيانات بنكية عربية</p>
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:'14px' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* ── MARBERT Intent Model ── */}
              <div style={{ background:'#141E33', borderRadius:12, border:'1px solid #1C2A45', overflow:'hidden' }}>
                <div style={{ padding:'10px 14px', background:'rgba(59,130,246,0.08)', borderBottom:'1px solid #1C2A45', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <p style={{ fontSize:11, fontWeight:700, color:'#93C5FD' }}>MARBERT — نموذج النية</p>
                  <span style={{ fontSize:10, color:'#475569' }}>Intent Classification</span>
                </div>
                <div style={{ padding:'12px 14px' }}>
                  {/* Top result */}
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, padding:'10px 12px', background:'rgba(59,130,246,0.08)', borderRadius:8, border:'1px solid rgba(59,130,246,0.2)' }}>
                    <span style={{ fontSize:22 }}>{INTENT_ICON[call.intent]}</span>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:13, fontWeight:700, color:'#93C5FD' }}>{INTENT_AR[call.intent]||call.intent}</p>
                      <p style={{ fontSize:10, color:'#475569' }}>{call.intent}</p>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <p style={{ fontSize:22, fontWeight:700, color:'#3B82F6' }}>{Math.round((call.intent_confidence||0)*100)}%</p>
                      <p style={{ fontSize:9, color:'#475569' }}>ثقة النموذج</p>
                    </div>
                  </div>

                  {/* All 8 intent scores */}
                  <p style={{ fontSize:10, color:'#334155', marginBottom:8 }}>احتمالية كل تصنيف (8 فئات):</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {Object.entries(intentScores as Record<string,number>)
                      .sort((a,b) => b[1]-a[1])
                      .map(([label, score]) => (
                        <ScoreBar
                          key={label}
                          label={`${INTENT_ICON[label]||''} ${(INTENT_AR[label]||label).slice(0,7)}`}
                          score={score as number}
                          color="#3B82F6"
                          isTop={label === call.intent}
                        />
                      ))}
                  </div>
                </div>
              </div>

              {/* ── MARBERT Emotion Model ── */}
              <div style={{ background:'#141E33', borderRadius:12, border:'1px solid #1C2A45', overflow:'hidden' }}>
                <div style={{ padding:'10px 14px', background:'rgba(139,92,246,0.08)', borderBottom:'1px solid #1C2A45', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <p style={{ fontSize:11, fontWeight:700, color:'#C4B5FD' }}>MARBERT — نموذج العاطفة</p>
                  <span style={{ fontSize:10, color:'#475569' }}>Emotion Detection</span>
                </div>
                <div style={{ padding:'12px 14px' }}>
                  {/* Top result */}
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, padding:'10px 12px', background:'rgba(139,92,246,0.08)', borderRadius:8, border:'1px solid rgba(139,92,246,0.2)' }}>
                    <span style={{ fontSize:22 }}>{EMOTION_ICON[call.emotion]}</span>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:13, fontWeight:700, color:'#C4B5FD' }}>{EMOTION_AR[call.emotion]||call.emotion}</p>
                      {call.emotion_boosted && (
                        <p style={{ fontSize:10, color:'#F59E0B' }}>↑ أدت إلى رفع الأولوية</p>
                      )}
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <p style={{ fontSize:22, fontWeight:700, color: EMOTION_COLOR[call.emotion]||'#8B5CF6' }}>{Math.round((call.emotion_confidence||0)*100)}%</p>
                      <p style={{ fontSize:9, color:'#475569' }}>ثقة النموذج</p>
                    </div>
                  </div>

                  {/* All 6 emotion scores */}
                  <p style={{ fontSize:10, color:'#334155', marginBottom:8 }}>احتمالية كل حالة عاطفية (6 فئات):</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {Object.entries(emotionScores as Record<string,number>)
                      .sort((a,b) => b[1]-a[1])
                      .map(([label, score]) => (
                        <ScoreBar
                          key={label}
                          label={`${EMOTION_ICON[label]||''} ${EMOTION_AR[label]||label}`}
                          score={score as number}
                          color={EMOTION_COLOR[label]||'#8B5CF6'}
                          isTop={label === call.emotion}
                        />
                      ))}
                  </div>
                </div>
              </div>

              {/* ── Combined output: Priority ── */}
              <div style={{ background:pc.bg, borderRadius:12, border:`1.5px solid ${pc.border}`, padding:'12px 14px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <p style={{ fontSize:10, color:pc.text, opacity:.7, fontWeight:600, marginBottom:4 }}>PRIORITY ENGINE OUTPUT</p>
                    <p style={{ fontSize:20, fontWeight:700, color:pc.text }}>{pc.label}</p>
                    {call.emotion_boosted && (
                      <p style={{ fontSize:10, color:pc.text, opacity:.8, marginTop:3 }}>↑ رُفعت: Intent({PRIORITY_STYLE[call.priority]?.label}) + Emotion boost</p>
                    )}
                  </div>
                  <div style={{ textAlign:'center', opacity:.8 }}>
                    <p style={{ fontSize:10, color:pc.text }}>Actions</p>
                    <p style={{ fontSize:20, fontWeight:700, color:pc.text }}>{call.actions_taken?.length||0}</p>
                  </div>
                </div>
              </div>

              {/* ── Actions executed ── */}
              {call.actions_taken?.length > 0 && (
                <div style={{ background:'#141E33', borderRadius:12, border:'1px solid #1C2A45', padding:'12px 14px' }}>
                  <p style={{ fontSize:10, color:'#475569', fontWeight:600, marginBottom:8 }}>ACTIONS EXECUTED AUTOMATICALLY</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    {call.actions_taken.map((a:string) => (
                      <div key={a} style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 10px', background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:7 }}>
                        <span style={{ fontSize:10, color:'#22C55E' }}>✓</span>
                        <span style={{ fontSize:12, color:'#86EFAC' }}>{ACTION_AR[a]||a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agent note */}
              {call.agent_note && (
                <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:12, padding:'12px 14px' }}>
                  <p style={{ fontSize:10, color:'#F59E0B', fontWeight:600, marginBottom:5 }}>AGENT NOTE</p>
                  <p style={{ fontSize:12, color:'#FDE68A', lineHeight:1.6 }}>{call.agent_note}</p>
                </div>
              )}

              {/* Negotiation badge */}
              {call.customer_decision === 'yes_counter' && (
                <div style={{ background:'rgba(59,130,246,0.06)', border:'1px solid rgba(59,130,246,0.2)', borderRadius:12, padding:'12px 14px' }}>
                  <p style={{ fontSize:10, color:'#93C5FD', fontWeight:600, marginBottom:4 }}>🤝 AI NEGOTIATION SUCCEEDED</p>
                  <p style={{ fontSize:12, color:'#BFDBFE', lineHeight:1.6 }}>رفض العرض الأول → تفاوض الذكاء الاصطناعي → قبل العرض البديل</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════
//  VIEW 2 — SUMMARY BAR
// ════════════════════════════════════════════════════════
function SummaryView({ call, onBack, onTwin, wsStatus }: { call:any; onBack:()=>void; onTwin:()=>void; wsStatus:string }) {
  const pc = PRIORITY_STYLE[call.priority] || PRIORITY_STYLE.LOW
  const audioUrl = call.audio_path ? `${API}/dashboard/calls/${call.ticket_number}/audio` : null

  return (
    <div style={{ minHeight:'100vh', background:'#0A0E1A', color:'#E2E8F0', display:'flex', flexDirection:'column' }}>
      <Header wsStatus={wsStatus} title={`${INTENT_ICON[call.intent]} ${INTENT_AR[call.intent]||call.intent}`} subtitle={`${call.ticket_number} · ${formatDate(call.created_at)} ${formatTime(call.created_at)}`} right={<BackBtn onClick={onBack}/>}/>

      <div style={{ padding:'20px 28px', display:'flex', flexDirection:'column', gap:14, maxWidth:860, width:'100%', margin:'0 auto' }}>

        {/* Status badges row */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <span style={{ fontSize:13, fontWeight:600, padding:'6px 16px', borderRadius:20, background:call.status==='resolved'?'rgba(34,197,94,0.1)':'rgba(249,115,22,0.1)', color:call.status==='resolved'?'#22C55E':'#F97316', border:`1px solid ${call.status==='resolved'?'rgba(34,197,94,0.3)':'rgba(249,115,22,0.3)'}` }}>
            {call.status==='resolved'?'✅ محلولة':'📋 مفتوحة'}
          </span>
          <span style={{ fontSize:13, fontWeight:600, padding:'6px 16px', borderRadius:20, background:pc.bg, color:pc.text, border:`1px solid ${pc.border}` }}>{pc.label}</span>
          <span style={{ fontSize:12, padding:'6px 16px', borderRadius:20, background:'rgba(255,255,255,0.04)', color:'#7A92B8', border:'1px solid #1C2A45' }}>{call.channel==='voice'?'🎙️ صوتية':'⌨️ نصية'}</span>
          {call.customer_decision==='yes_counter' && (
            <span style={{ fontSize:12, padding:'6px 16px', borderRadius:20, background:'rgba(59,130,246,0.1)', color:'#93C5FD', border:'1px solid rgba(59,130,246,0.3)' }}>🤝 تم التفاوض</span>
          )}
        </div>

        {/* 4 quick stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
          {[
            { label:'النية',          value:`${INTENT_ICON[call.intent]} ${INTENT_AR[call.intent]||'—'}`,              sub:`${Math.round((call.intent_confidence||0)*100)}% ثقة`,  color:'#3B82F6' },
            { label:'العاطفة',        value:`${EMOTION_ICON[call.emotion]} ${EMOTION_AR[call.emotion]||'—'}`,          sub:`${Math.round((call.emotion_confidence||0)*100)}% ثقة`,  color:'#8B5CF6' },
            { label:'قرار العميل',    value:call.customer_decision==='yes'?'✓ وافق':call.customer_decision==='yes_counter'?'✓ وافق على البديل':'✗ رفض', sub:'—',                color:call.customer_decision?.startsWith('yes')?'#22C55E':'#F97316' },
            { label:'الإجراءات',      value:`${call.actions_taken?.length||0} إجراء`,                                  sub:'نُفِّذ تلقائياً',                                      color:'#F59E0B' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} style={{ background:'#141E33', borderRadius:10, border:'1px solid #1C2A45', padding:'12px 14px' }}>
              <p style={{ fontSize:10, color:'#475569', marginBottom:5 }}>{label}</p>
              <p style={{ fontSize:13, fontWeight:700, color, lineHeight:1.3 }}>{value}</p>
              <p style={{ fontSize:10, color:'#334155', marginTop:3 }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* Customer message */}
        <div style={{ background:'#141E33', borderRadius:10, border:'1px solid #1C2A45', padding:'14px' }}>
          <p style={{ fontSize:10, color:'#475569', marginBottom:5, fontWeight:600 }}>رسالة العميل الأولى</p>
          <p style={{ fontSize:14, color:'#E2E8F0', lineHeight:1.8 }}>"{call.customer_text||'—'}"</p>
        </div>

        {/* Actions */}
        {call.actions_taken?.length > 0 && (
          <div style={{ background:'#141E33', borderRadius:10, border:'1px solid #1C2A45', padding:'14px' }}>
            <p style={{ fontSize:10, color:'#475569', marginBottom:8, fontWeight:600 }}>الإجراءات المنفذة</p>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {call.actions_taken.map((a:string) => (
                <div key={a} style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 10px', background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:7 }}>
                  <span style={{ color:'#22C55E', fontSize:11 }}>✓</span>
                  <span style={{ fontSize:12, color:'#86EFAC' }}>{ACTION_AR[a]||a}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Agent note */}
        {call.agent_note && (
          <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:10, padding:'12px 14px' }}>
            <p style={{ fontSize:10, color:'#F59E0B', marginBottom:5, fontWeight:600 }}>ملاحظة للموظف</p>
            <p style={{ fontSize:13, color:'#FDE68A', lineHeight:1.6 }}>{call.agent_note}</p>
          </div>
        )}

        {/* Audio */}
        {audioUrl && (
          <div style={{ background:'#141E33', borderRadius:10, border:'1px solid #1C2A45', padding:'12px 14px' }}>
            <p style={{ fontSize:10, color:'#475569', marginBottom:6 }}>تسجيل المكالمة</p>
            <audio controls style={{ width:'100%' }}>
              <source src={audioUrl} type="audio/webm"/>
            </audio>
          </div>
        )}

        {/* CTA */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onTwin} style={{ flex:1, padding:'13px 0', background:'linear-gradient(135deg,#2563EB,#1D4ED8)', border:'none', borderRadius:10, color:'#fff', fontFamily:'inherit', fontSize:13, fontWeight:600, cursor:'pointer', boxShadow:'0 4px 14px rgba(37,99,235,0.3)' }}>
            🧠 عرض تحليل النموذجين — Twin View →
          </button>
          <button style={{ padding:'13px 18px', background:'transparent', border:'1px solid #1C2A45', borderRadius:10, color:'#7A92B8', fontFamily:'inherit', fontSize:12, cursor:'pointer' }}>
            📤 إرسال للمتابعة
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════
//  VIEW 1 — MAIN TABLE
// ════════════════════════════════════════════════════════
function StatBox({ icon, label, value, color }: { icon:string; label:string; value:number; color:string }) {
  return (
    <div style={{ background:'linear-gradient(160deg,#141E33,#0F1629)', borderRadius:14, border:'1px solid #1C2A45', padding:'16px 18px' }}>
      <div style={{ width:32, height:32, borderRadius:9, background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, marginBottom:8 }}>{icon}</div>
      <p style={{ fontSize:26, fontWeight:700, color:'#fff', lineHeight:1 }}>{value}</p>
      <p style={{ fontSize:11, color:'#7A92B8', marginTop:5 }}>{label}</p>
    </div>
  )
}

export default function AgentDashboard() {
  const [calls,    setCalls]    = useState<any[]>([])
  const [stats,    setStats]    = useState({ total_today:0, fraud_today:0, critical_today:0, open_today:0 })
  const [view,     setView]     = useState<'table'|'summary'|'twin'>('table')
  const [selected, setSelected] = useState<any>(null)
  const [filter,   setFilter]   = useState<'all'|'open'|'resolved'>('all')
  const [wsStatus, setWsStatus] = useState<'connecting'|'connected'|'disconnected'>('connecting')
  const wsRef = useRef<WebSocket|null>(null)

  const loadData = async () => {
    try {
      const [cr, sr] = await Promise.all([
        fetch(`${API}/dashboard/calls`), fetch(`${API}/dashboard/stats`),
      ])
      setCalls((await cr.json()).calls || [])
      setStats(await sr.json())
    } catch {}
  }

  useEffect(() => {
    loadData()
    function connect() {
      const ws = new WebSocket(`${WS_URL}/ws/dashboard`)
      wsRef.current = ws
      ws.onopen    = () => setWsStatus('connected')
      ws.onmessage = e => {
        try { const m = JSON.parse(e.data); if (m.type==='new_call') loadData() } catch {}
      }
      ws.onclose = () => { setWsStatus('disconnected'); setTimeout(connect, 3000) }
      ws.onerror = () => { setWsStatus('disconnected'); ws.close() }
    }
    connect()
    return () => wsRef.current?.close()
  }, [])

  if (view==='summary' && selected) return <SummaryView call={selected} wsStatus={wsStatus} onBack={()=>setView('table')} onTwin={()=>setView('twin')}/>
  if (view==='twin'    && selected) return <TwinView    call={selected} wsStatus={wsStatus} onBack={()=>setView('summary')}/>

  const filtered = filter==='all' ? calls : calls.filter(c=>c.status===filter)

  return (
    <>
      <Head><title>تسعة — لوحة الموظف</title></Head>
      <div style={{ minHeight:'100vh', background:'#0A0E1A', color:'#E2E8F0' }}>
        <Header wsStatus={wsStatus} title="تسعة · لوحة الموظف" subtitle="مصرف الإنماء"/>

        <div style={{ padding:'20px 24px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
            <StatBox icon="📞" label="مكالمات اليوم"        value={stats.total_today}    color="#3B82F6"/>
            <StatBox icon="🚨" label="احتيال اليوم"          value={stats.fraud_today}    color="#EF4444"/>
            <StatBox icon="🔴" label="حالات حرجة"            value={stats.critical_today} color="#F97316"/>
            <StatBox icon="📋" label="مفتوحة — تحتاج متابعة" value={stats.open_today}     color="#EAB308"/>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            {[{k:'all',l:'الكل'},{k:'open',l:'📋 مفتوحة'},{k:'resolved',l:'✅ محلولة'}].map(f=>(
              <button key={f.k} onClick={()=>setFilter(f.k as any)} style={{ padding:'5px 14px', borderRadius:20, fontSize:11, fontFamily:'inherit', cursor:'pointer', background:filter===f.k?'rgba(59,130,246,0.2)':'transparent', border:filter===f.k?'1px solid rgba(59,130,246,0.5)':'1px solid #1C2A45', color:filter===f.k?'#93C5FD':'#7A92B8' }}>{f.l}</button>
            ))}
            <span style={{ marginRight:'auto', fontSize:10, color:'#334155' }}>اضغط على أي سجل لعرض الملخص والتحليل</span>
          </div>

          <div style={{ background:'#0F1629', borderRadius:14, border:'1px solid #1C2A45', overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'44px 96px 1fr 120px 100px 96px 86px 70px', padding:'10px 18px', borderBottom:'1px solid #1C2A45', background:'rgba(255,255,255,0.02)' }}>
              {['#','رقم التذكرة','رسالة العميل','التصنيف','العاطفة','الأولوية','الحالة','الوقت'].map((h,i)=>(
                <span key={i} style={{ fontSize:10, color:'#475569', fontWeight:600 }}>{h}</span>
              ))}
            </div>

            {filtered.length===0 && (
              <div style={{ padding:'50px 20px', textAlign:'center' }}>
                <p style={{ fontSize:26, marginBottom:8 }}>📞</p>
                <p style={{ fontSize:13, color:'#475569' }}>{calls.length===0?'لا توجد سجلات — ابدأ محادثة من صفحة العميل':'لا توجد نتائج'}</p>
              </div>
            )}

            {filtered.map(call=>{
              const pc = PRIORITY_STYLE[call.priority]||PRIORITY_STYLE.LOW
              return (
                <div key={call.id} onClick={()=>{ setSelected(call); setView('summary') }} style={{ display:'grid', gridTemplateColumns:'44px 96px 1fr 120px 100px 96px 86px 70px', padding:'13px 18px', borderBottom:'1px solid rgba(28,42,69,0.5)', cursor:'pointer', alignItems:'center', transition:'background .12s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                >
                  <span style={{ fontSize:11, color:'#334155' }}>#{call.id}</span>
                  <span style={{ fontSize:10, color:'#3B82F6' }}>{call.ticket_number}</span>
                  <p style={{ fontSize:12, color:'#E2E8F0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingLeft:10 }}>{call.customer_text||'—'}</p>
                  <span style={{ fontSize:11 }}>{INTENT_ICON[call.intent]} {(INTENT_AR[call.intent]||call.intent).slice(0,8)}</span>
                  <span style={{ fontSize:11 }}>{EMOTION_ICON[call.emotion]} {EMOTION_AR[call.emotion]||'—'}</span>
                  <span style={{ fontSize:10, fontWeight:600, padding:'3px 8px', borderRadius:14, background:pc.bg, color:pc.text, border:`1px solid ${pc.border}`, whiteSpace:'nowrap', display:'inline-block' }}>{pc.label}</span>
                  <span style={{ fontSize:10, fontWeight:600, color:call.status==='resolved'?'#22C55E':'#F97316' }}>{call.status==='resolved'?'✅ محلولة':'📋 مفتوحة'}</span>
                  <span style={{ fontSize:10, color:'#334155' }}>{formatTime(call.created_at)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
