import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import { speak, stopSpeaking } from '../utils/tts'

const API    = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const WS_URL = process.env.NEXT_PUBLIC_WS_URL  || 'ws://localhost:8000'

// ── Maps ──────────────────────────────────────────────────────────────────────
const INTENT_AR: Record<string,string> = {
  fraud:'احتيال مالي', lost_card:'فقدان البطاقة', duplicate_transaction:'خصم مكرر',
  suspicious_activity:'نشاط مشبوه', account_blocked:'حساب موقوف', wrong_transfer:'تحويل خاطئ',
  card_not_working:'بطاقة معطلة', atm_issue:'مشكلة صراف', '':'غير مصنف',
}
const EMOTION_AR: Record<string,string> = {
  panic:'هلع', angry:'غضب', frustrated:'إحباط', calm:'هادئ', confused:'مرتبك', worried:'قلق', '':'—'
}
const EMOTION_COLOR: Record<string,string> = {
  panic:'#EF4444', angry:'#F97316', frustrated:'#F59E0B',
  calm:'#22C55E', confused:'#8B5CF6', worried:'#EAB308',
}
const INTENT_COLOR: Record<string,string> = {
  fraud:'#EF4444', lost_card:'#3B82F6', duplicate_transaction:'#8B5CF6',
  suspicious_activity:'#F97316', account_blocked:'#EAB308', wrong_transfer:'#10B981',
  card_not_working:'#6366F1', atm_issue:'#EC4899',
}
const PRIORITY_STYLE: Record<string,{bg:string;text:string;border:string;label:string;solid:string}> = {
  CRITICAL:{bg:'rgba(239,68,68,0.1)',text:'#FCA5A5',border:'rgba(239,68,68,0.3)',label:'حرج جداً',solid:'#EF4444'},
  HIGH:    {bg:'rgba(249,115,22,0.1)',text:'#FDBA74',border:'rgba(249,115,22,0.3)',label:'عالي',solid:'#F97316'},
  MEDIUM:  {bg:'rgba(234,179,8,0.1)',text:'#FDE047',border:'rgba(234,179,8,0.3)',label:'متوسط',solid:'#EAB308'},
  LOW:     {bg:'rgba(34,197,94,0.1)',text:'#86EFAC',border:'rgba(34,197,94,0.3)',label:'منخفض',solid:'#22C55E'},
}
const ACTION_AR: Record<string,string> = {
  block_card_immediately:'إيقاف البطاقة فوراً', block_card_temporarily:'إيقاف البطاقة مؤقتاً',
  freeze_card_24h:'تجميد البطاقة 24 ساعة', set_daily_limit_200:'حد سحب 200 ريال',
  create_fraud_report:'فتح بلاغ احتيال', create_lost_card_report:'تسجيل بلاغ فقدان',
  flag_account:'تأمين الحساب', send_otp_verification:'إرسال OTP',
  open_dispute_if_completed:'فتح طلب اعتراض', auto_create_complaint:'إنشاء شكوى',
  create_atm_report:'فتح بلاغ صراف', issue_replacement_card:'طلب بطاقة بديلة',
  remote_card_reactivation:'إعادة تفعيل البطاقة', enable_login_alerts:'تنبيهات الدخول',
}

const fmt = (ts:number) => new Date(ts*1000).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit',hour12:false})
const pct = (n:number) => `${Math.round(n*100)}%`

// ══════════════════════════════════════════════════════
//  DONUT CHART
// ══════════════════════════════════════════════════════
function DonutChart({data,size=140}:{data:{label:string;value:number;color:string}[];size?:number}){
  const total = data.reduce((s,d)=>s+d.value,0)||1
  const r=size/2-14, cx=size/2, cy=size/2, circ=2*Math.PI*r
  let cum=0
  return(
    <svg width={size} height={size} style={{display:'block',margin:'0 auto'}}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1C2A45" strokeWidth={12}/>
      {data.map((d,i)=>{
        const p=d.value/total, dash=circ*p, off=-(cum)*circ; cum+=p
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={12}
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={off}
          style={{transform:'rotate(-90deg)',transformOrigin:'center'}}/>
      })}
      <text x={cx} y={cy-6} textAnchor="middle" fill="#E2E8F0" fontSize={22} fontWeight={700}>{total}</text>
      <text x={cx} y={cy+14} textAnchor="middle" fill="#7A92B8" fontSize={10}>مكالمة</text>
    </svg>
  )
}

// ══════════════════════════════════════════════════════
//  BAR CHART
// ══════════════════════════════════════════════════════
function BarChart({data,height=100}:{data:{label:string;value:number;color:string}[];height?:number}){
  const max=Math.max(...data.map(d=>d.value),1)
  return(
    <div style={{display:'flex',alignItems:'flex-end',gap:6,height,padding:'0 4px'}}>
      {data.map((d,i)=>(
        <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',flex:1,gap:4}}>
          <span style={{fontSize:9,color:'#E2E8F0',fontWeight:700}}>{d.value}</span>
          <div style={{width:'100%',background:d.color,borderRadius:'3px 3px 0 0',
            height:`${(d.value/max)*80}%`,minHeight:4,transition:'height .5s',
            boxShadow:`0 0 8px ${d.color}44`}}/>
          <span style={{fontSize:8,color:'#94A3B8',textAlign:'center',lineHeight:1.2}}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  WORD CLOUD (SVG based)
// ══════════════════════════════════════════════════════
function WordCloud({words}:{words:{text:string;value:number}[]}){
  if(!words.length) return <p style={{color:'#475569',fontSize:11,textAlign:'center'}}>لا توجد بيانات</p>
  const max=Math.max(...words.map(w=>w.value),1)
  const colors=['#3B82F6','#8B5CF6','#EF4444','#F97316','#22C55E','#EAB308','#EC4899','#10B981']
  // Simple positioned word cloud
  const positions = [
    {x:50,y:35},{x:20,y:55},{x:75,y:55},{x:35,y:75},{x:65,y:20},
    {x:15,y:30},{x:80,y:35},{x:50,y:70},{x:25,y:70},{x:70,y:72},
    {x:40,y:20},{x:60,y:85},{x:10,y:70},{x:85,y:65},{x:30,y:88},
  ]
  return(
    <div style={{position:'relative',height:120,width:'100%',overflow:'hidden'}}>
      {words.slice(0,15).map((w,i)=>{
        const size = 9 + (w.value/max)*18
        const pos = positions[i%positions.length]
        const color = colors[i%colors.length]
        return(
          <span key={i} style={{
            position:'absolute', left:`${pos.x}%`, top:`${pos.y}%`,
            transform:'translate(-50%,-50%)',
            fontSize:size, color, fontWeight: w.value===max?700:400,
            opacity: 0.6 + (w.value/max)*0.4,
            whiteSpace:'nowrap', cursor:'default',
            transition:'all .3s',
          }} title={`${w.text}: ${w.value}`}>{w.text}</span>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  SPARKLINE
// ══════════════════════════════════════════════════════
function Sparkline({data,color='#3B82F6',h=32,w=80}:{data:number[];color?:string;h?:number;w?:number}){
  if(data.length<2) return <div style={{width:w,height:h}}/>
  const max=Math.max(...data,1),min=Math.min(...data,0),range=max-min||1
  const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-min)/range)*(h-4)+2}`).join(' ')
  return(
    <svg width={w} height={h} style={{display:'block'}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round"/>
      <polyline points={`0,${h} ${pts} ${w},${h}`}
        fill={`${color}22`} stroke="none"/>
    </svg>
  )
}

// ══════════════════════════════════════════════════════
//  SCORE BAR
// ══════════════════════════════════════════════════════
function ScoreBar({label,score,color,isTop}:{label:string;score:number;color:string;isTop:boolean}){
  return(
    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
      <span style={{fontSize:9,color:isTop?'#CBD5E1':'#475569',width:76,flexShrink:0,fontWeight:isTop?600:400}}>{label}</span>
      <div style={{flex:1,height:isTop?5:3,background:'#0A0E1A',borderRadius:3,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${score*100}%`,background:isTop?color:'#1C2A45',borderRadius:3,transition:'width .5s'}}/>
      </div>
      <span style={{fontSize:9,color:isTop?color:'#334155',fontWeight:isTop?700:400,minWidth:28,textAlign:'right'}}>{pct(score)}</span>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  CALL PANEL
// ══════════════════════════════════════════════════════
type Phase='idle'|'greeting'|'listening'|'analyzing'|'speaking'|'done'|'error'
type Stage='opening'|'questions'|'confirm'

function VoiceOrb({mode}:{mode:string}){
  const colors:Record<string,{core:string;glow:string}>={
    idle:{core:'#2563EB',glow:'rgba(37,99,235,0.3)'},
    listening:{core:'#1D4ED8',glow:'rgba(29,78,216,0.5)'},
    speaking:{core:'#10B981',glow:'rgba(16,185,129,0.5)'},
    analyzing:{core:'#2563EB',glow:'rgba(37,99,235,0.3)'},
    critical:{core:'#EF4444',glow:'rgba(239,68,68,0.5)'},
  }
  const c=colors[mode]||colors.idle
  return(
    <div style={{position:'relative',width:72,height:72,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{position:'absolute',width:60,height:60,borderRadius:'50%',background:`radial-gradient(circle,${c.glow} 0%,transparent 70%)`,filter:'blur(8px)'}}/>
      <div style={{width:52,height:52,borderRadius:'50%',position:'relative',zIndex:2,background:`radial-gradient(circle at 35% 35%,${c.core},${c.core}DD)`,boxShadow:`0 0 16px ${c.glow}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
        {mode==='analyzing'?<div style={{width:14,height:14,borderRadius:'50%',border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',animation:'spin .7s linear infinite'}}/>
        :mode==='listening'?<div style={{display:'flex',gap:2}}>{[0,1,2,3,4].map(i=><div key={i} style={{width:2,height:10,borderRadius:2,background:'rgba(255,255,255,.9)',animation:'wave-bar .7s ease-in-out infinite',animationDelay:`${i*.12}s`}}/>)}</div>
        :<span style={{fontSize:18}}>🎙️</span>}
      </div>
    </div>
  )
}

function Bubble({role,text}:{role:'assistant'|'customer';text:string}){
  const isA=role==='assistant'
  return(
    <div style={{display:'flex',justifyContent:isA?'flex-start':'flex-end',width:'100%'}} dir="rtl">
      <div style={{maxWidth:'80%',padding:'8px 12px',background:isA?'rgba(255,255,255,0.06)':'rgba(37,99,235,0.18)',border:`1px solid ${isA?'#1C2A45':'rgba(37,99,235,0.4)'}`,borderRadius:isA?'4px 12px 12px 12px':'12px 4px 12px 12px'}}>
        <p style={{fontSize:13,color:isA?'#E2E8F0':'#93C5FD',lineHeight:1.6}}>{text}</p>
      </div>
    </div>
  )
}

function CallPanel({onClose}:{onClose:()=>void}){
  const [channel,setChannel]=useState<'voice'|'text'>('voice')
  const [phase,setPhase]=useState<Phase>('idle')
  const [orbMode,setOrbMode]=useState('idle')
  const [messages,setMessages]=useState<{role:'assistant'|'customer';text:string}[]>([])
  const [sessionId,setSessionId]=useState('')
  const [stage,setStage]=useState<Stage>('opening')
  const [questionIdx,setQuestionIdx]=useState(0)
  const [answers,setAnswers]=useState<string[]>([])
  const [textInput,setTextInput]=useState('')
  const [ticketNo,setTicketNo]=useState('')
  const [finalStatus,setFinalStatus]=useState('')
  const [isCritical,setIsCritical]=useState(false)
  const mediaRef=useRef<MediaRecorder|null>(null)
  const chunksRef=useRef<Blob[]>([])
  const chatRef=useRef<HTMLDivElement>(null)

  useEffect(()=>{ setTimeout(()=>chatRef.current?.scrollTo({top:9999,behavior:'smooth'}),80) },[messages])

  const addMsg=(role:'assistant'|'customer',text:string)=>setMessages(p=>[...p,{role,text}])

  const doSpeak=useCallback((text:string,cb?:()=>void)=>{
    if(channel==='text'){if(cb)cb();return}
    setOrbMode('speaking')
    speak(text,()=>{setOrbMode('idle');if(cb)cb()})
  },[channel])

  const beginCall=useCallback(()=>{
    setPhase('greeting');setOrbMode('speaking')
    const g='مرحباً، أنا تسعة مساعدك البنكي. كيف أقدر أساعدك اليوم؟'
    addMsg('assistant',g)
    if(channel==='voice'){speak(g,()=>{setPhase('listening');setOrbMode('listening');startRec()})}
    else{setPhase('listening')}
  },[channel])

  const startRec=useCallback(async()=>{
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true})
      const candidates=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','']
      const supported=candidates.find(t=>t===''||MediaRecorder.isTypeSupported(t))
      const mr=supported?new MediaRecorder(stream,{mimeType:supported}):new MediaRecorder(stream)
      chunksRef.current=[]
      mr.ondataavailable=e=>{if(e.data.size>0)chunksRef.current.push(e.data)}
      mr.start(200);mediaRef.current=mr
    }catch{setPhase('error')}
  },[])

  const stopRec=useCallback(():Promise<Blob>=>new Promise(resolve=>{
    if(!mediaRef.current||mediaRef.current.state!=='recording'){resolve(new Blob([]));return}
    const mimeType=mediaRef.current.mimeType||'audio/webm'
    mediaRef.current.onstop=()=>resolve(new Blob(chunksRef.current,{type:mimeType}))
    mediaRef.current.stop()
    mediaRef.current.stream?.getTracks().forEach(t=>t.stop())
  }),[])

  const getCustomerText=useCallback(async():Promise<string>=>{
    if(channel==='text'){const t=textInput.trim();setTextInput('');return t}
    setPhase('analyzing');setOrbMode('analyzing')
    const blob=await stopRec()
    if(blob.size<400)return ''
    const form=new FormData()
    const ext=blob.type.includes('ogg')?'ogg':'webm'
    form.append('file',blob,`audio.${ext}`)
    const res=await fetch(`${API}/analyze`,{method:'POST',body:form})
    const data=await res.json()
    return data.transcript||''
  },[channel,textInput,stopRec])

  const handleSubmit=useCallback(async()=>{
    const text=await getCustomerText()
    if(!text){if(channel==='voice'){setPhase('listening');setOrbMode('listening');startRec()};return}
    addMsg('customer',text);setPhase('analyzing');setOrbMode('analyzing')
    try{
      if(stage==='opening'){
        const d=await fetch(`${API}/conversation/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,session_id:sessionId,channel})}).then(r=>r.json())
        setSessionId(d.session_id||'')
        if(d.is_greeting){addMsg('assistant',d.message);doSpeak(d.message,()=>{setPhase('listening');setOrbMode('listening');if(channel==='voice')startRec()});return}
        const crit=d.priority==='CRITICAL';setIsCritical(crit)
        addMsg('assistant',d.message)
        if(d.has_questions){setStage('questions');setQuestionIdx(0);setAnswers([])}else{setStage('confirm')}
        doSpeak(d.message,()=>{setPhase('listening');setOrbMode(crit?'critical':'listening');if(channel==='voice')startRec()})
      }else if(stage==='questions'){
        const d=await fetch(`${API}/conversation/answer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,session_id:sessionId,question_idx:questionIdx,answers})}).then(r=>r.json())
        setAnswers(d.answers||[]);addMsg('assistant',d.message)
        if(d.ready_to_confirm)setStage('confirm');else setQuestionIdx(d.question_idx)
        doSpeak(d.message,()=>{setPhase('listening');setOrbMode(isCritical?'critical':'listening');if(channel==='voice')startRec()})
      }else if(stage==='confirm'){
        const d=await fetch(`${API}/conversation/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,session_id:sessionId})}).then(r=>r.json())
        addMsg('assistant',d.message)
        if(d.done===true){setTicketNo(d.ticket_number||'');setFinalStatus(d.status||'');doSpeak(d.message,()=>{setPhase('done');setOrbMode('idle')});return}
        if(d.done===false){doSpeak(d.message,()=>{setPhase('listening');setOrbMode(isCritical?'critical':'listening');if(channel==='voice')startRec()});return}
      }
    }catch(err){
      console.error('[تسعة]',err)
      if(stage==='confirm'){setPhase('listening');setOrbMode('listening');if(channel==='voice')startRec()}
      else setPhase('error')
    }
  },[stage,sessionId,questionIdx,answers,channel,isCritical,getCustomerText,doSpeak,startRec])

  const resetAll=useCallback(()=>{
    stopSpeaking();setPhase('idle');setOrbMode('idle');setMessages([])
    setSessionId('');setStage('opening');setQuestionIdx(0)
    setAnswers([]);setTicketNo('');setFinalStatus('');setIsCritical(false);setTextInput('')
  },[])

  return(
    <div style={{width:340,height:'100vh',background:'#0A0E1A',borderRight:'1px solid #1C2A45',display:'flex',flexDirection:'column',flexShrink:0,animation:'slideInLeft .25s ease-out'}}>
      <div style={{padding:'12px 14px',borderBottom:'1px solid #1C2A45',display:'flex',alignItems:'center',justifyContent:'space-between',background:'#0F1629'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:26,height:26,borderRadius:7,background:'linear-gradient(135deg,#2563EB,#1D4ED8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff'}}>٩</div>
          <div>
            <p style={{fontSize:12,fontWeight:700,color:'#E2E8F0'}}>محادثة العميل</p>
            <p style={{fontSize:9,color:'#475569'}}>تسعة — مصرف الإنماء</p>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {phase==='idle'&&(
            <div style={{display:'flex',background:'rgba(255,255,255,0.05)',borderRadius:7,padding:2,gap:2}}>
              {(['voice','text']as const).map(c=>(
                <button key={c} onClick={()=>setChannel(c)} style={{padding:'3px 9px',borderRadius:5,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:10,fontWeight:600,background:channel===c?'#2563EB':'transparent',color:channel===c?'#fff':'#7A92B8'}}>
                  {c==='voice'?'صوت':'نص'}
                </button>
              ))}
            </div>
          )}
          <button onClick={()=>{stopSpeaking();onClose()}} style={{background:'transparent',border:'1px solid #1C2A45',borderRadius:6,padding:'3px 9px',cursor:'pointer',color:'#7A92B8',fontFamily:'inherit',fontSize:10}}>إخفاء</button>
        </div>
      </div>

      {phase==='idle'&&(
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,padding:20}}>
          <VoiceOrb mode="idle"/>
          <p style={{fontSize:12,color:'#7A92B8',textAlign:'center'}}>{channel==='voice'?'اضغط لبدء مكالمة صوتية':'اضغط لبدء محادثة نصية'}</p>
          <button onClick={beginCall} style={{width:'100%',padding:'12px 0',background:'linear-gradient(135deg,#2563EB,#1D4ED8)',border:'none',borderRadius:11,color:'#fff',fontFamily:'inherit',fontSize:14,fontWeight:600,cursor:'pointer'}}>بدء المحادثة</button>
        </div>
      )}

      {phase!=='idle'&&(
        <>
          <div ref={chatRef} style={{flex:1,overflowY:'auto',padding:'12px',display:'flex',flexDirection:'column',gap:10,minHeight:0}}>
            {messages.map((m,i)=><Bubble key={i} role={m.role} text={m.text}/>)}
            {(phase==='analyzing'||phase==='greeting'||phase==='speaking')&&(
              <div style={{display:'flex',justifyContent:'center',padding:'6px 0'}}><VoiceOrb mode={orbMode}/></div>
            )}
            <div style={{height:1,flexShrink:0}}/>
          </div>
          <div style={{borderTop:'1px solid #1C2A45',padding:'10px 12px 14px',flexShrink:0}}>
            {phase==='done'?(
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <div style={{background:finalStatus==='resolved'?'rgba(34,197,94,0.1)':'rgba(249,115,22,0.1)',border:`1px solid ${finalStatus==='resolved'?'rgba(34,197,94,0.3)':'rgba(249,115,22,0.3)'}`,borderRadius:9,padding:10,textAlign:'center'}}>
                  <p style={{fontSize:13,fontWeight:600,color:finalStatus==='resolved'?'#22C55E':'#F97316'}}>{finalStatus==='resolved'?'تم حل المشكلة':'تم تسجيل طلبك'}</p>
                  {ticketNo&&<p style={{fontSize:10,color:'#475569',marginTop:3}}>رقم التذكرة: {ticketNo}</p>}
                </div>
                <button onClick={resetAll} style={{width:'100%',padding:'10px 0',background:'rgba(37,99,235,0.15)',border:'1px solid rgba(37,99,235,0.4)',borderRadius:9,color:'#93C5FD',fontFamily:'inherit',fontSize:12,cursor:'pointer'}}>محادثة جديدة</button>
              </div>
            ):phase==='error'?(
              <button onClick={resetAll} style={{width:'100%',padding:'10px 0',background:'transparent',border:'1px solid #1C2A45',borderRadius:9,color:'#7A92B8',fontFamily:'inherit',cursor:'pointer'}}>حاول مجدداً</button>
            ):channel==='voice'?(
              phase==='listening'&&<button onClick={handleSubmit} style={{width:'100%',padding:'12px 0',background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.4)',borderRadius:9,color:'#FCA5A5',fontFamily:'inherit',fontSize:13,fontWeight:600,cursor:'pointer'}}>إرسال</button>
            ):(
              phase==='listening'&&(
                <div style={{display:'flex',gap:7}} dir="rtl">
                  <input value={textInput} onChange={e=>setTextInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'&&textInput.trim())handleSubmit()}}
                    placeholder="اكتب رسالتك..."
                    style={{flex:1,padding:'9px 11px',background:'rgba(255,255,255,0.05)',border:'1px solid #1C2A45',borderRadius:9,color:'#E2E8F0',fontFamily:'inherit',fontSize:13,outline:'none'}}/>
                  <button onClick={handleSubmit} disabled={!textInput.trim()} style={{padding:'0 13px',background:textInput.trim()?'#2563EB':'#1A2540',border:'none',borderRadius:9,color:'#fff',fontFamily:'inherit',fontWeight:600,cursor:textInput.trim()?'pointer':'not-allowed'}}>إرسال</button>
                </div>
              )
            )}
          </div>
        </>
      )}
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes wave-bar{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}
        @keyframes slideInLeft{from{transform:translateX(-100%);opacity:0}to{transform:translateX(0);opacity:1}}
      `}</style>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  TWIN VIEW
// ══════════════════════════════════════════════════════
function TwinView({call,onBack,wsStatus}:{call:any;onBack:()=>void;wsStatus:string}){
  const pc=PRIORITY_STYLE[call.priority]||PRIORITY_STYLE.LOW
  const audioUrl=call.audio_path?`${API}/dashboard/calls/${call.ticket_number}/audio`:null
  const intentScores=call.intent_scores||{}
  const emotionScores=call.emotion_scores||{}
  const questions=call.questions_asked||[]
  const answers=call.answers_collected||[]
  const turns=(call.transcript||'').split(' | ').filter((t:string)=>t.trim())
  return(
    <div style={{minHeight:'100vh',background:'#0A0E1A',color:'#E2E8F0',display:'flex',flexDirection:'column'}}>
      <header style={{background:'#0F1629',borderBottom:'1px solid #1C2A45',padding:'0 20px',height:52,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={onBack} style={{background:'transparent',border:'1px solid #1C2A45',borderRadius:6,padding:'4px 10px',cursor:'pointer',color:'#7A92B8',fontFamily:'inherit',fontSize:11}}>رجوع</button>
          <p style={{fontSize:12,fontWeight:700}}>{INTENT_AR[call.intent]||call.intent} — {call.ticket_number}</p>
        </div>
        <button onClick={()=>window.open(`${API}/dashboard/calls/${call.ticket_number}/report`,'_blank')} style={{padding:'4px 12px',background:'transparent',border:'1px solid rgba(184,80,66,0.4)',borderRadius:6,color:'#F87171',fontFamily:'inherit',fontSize:11,cursor:'pointer'}}>تقرير PDF</button>
      </header>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',flex:1,overflow:'hidden',height:'calc(100vh - 52px)'}}>
        <div style={{borderLeft:'1px solid #1C2A45',display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'8px 14px',borderBottom:'1px solid #1C2A45',background:'rgba(37,99,235,0.04)',flexShrink:0}}>
            <p style={{fontSize:11,fontWeight:700,color:'#93C5FD'}}>نص المحادثة الكاملة</p>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'12px'}} dir="rtl">
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {call.customer_text&&<div style={{display:'flex',justifyContent:'flex-end'}}><div style={{maxWidth:'78%',padding:'8px 12px',background:'rgba(37,99,235,0.15)',border:'1px solid rgba(37,99,235,0.3)',borderRadius:'12px 3px 12px 12px'}}><p style={{fontSize:12,color:'#93C5FD',lineHeight:1.6}}>{call.customer_text}</p></div></div>}
              {questions.length>0?questions.map((q:string,i:number)=>(
                <div key={i} style={{display:'flex',flexDirection:'column',gap:6}}>
                  <div style={{display:'flex',justifyContent:'flex-start'}}><div style={{maxWidth:'78%',padding:'8px 12px',background:'rgba(255,255,255,0.04)',border:'1px solid #1C2A45',borderRadius:'3px 12px 12px 12px'}}><p style={{fontSize:12,color:'#E2E8F0',lineHeight:1.6}}>{q}</p></div></div>
                  {answers[i]&&<div style={{display:'flex',justifyContent:'flex-end'}}><div style={{maxWidth:'78%',padding:'8px 12px',background:'rgba(37,99,235,0.15)',border:'1px solid rgba(37,99,235,0.3)',borderRadius:'12px 3px 12px 12px'}}><p style={{fontSize:12,color:'#93C5FD',lineHeight:1.6}}>{answers[i]}</p></div></div>}
                </div>
              )):turns.slice(1).map((t:string,i:number)=>{
                const isC=i%2===1
                return<div key={i} style={{display:'flex',justifyContent:isC?'flex-end':'flex-start'}}><div style={{maxWidth:'78%',padding:'8px 12px',background:isC?'rgba(37,99,235,0.15)':'rgba(255,255,255,0.04)',border:`1px solid ${isC?'rgba(37,99,235,0.3)':'#1C2A45'}`,borderRadius:isC?'12px 3px 12px 12px':'3px 12px 12px 12px'}}><p style={{fontSize:12,color:isC?'#93C5FD':'#E2E8F0',lineHeight:1.6}}>{t}</p></div></div>
              })}
              {call.customer_decision&&<div style={{display:'flex',justifyContent:'center',padding:'6px 0'}}><span style={{fontSize:10,padding:'3px 12px',borderRadius:20,background:call.customer_decision.startsWith('yes')?'rgba(34,197,94,0.08)':'rgba(249,115,22,0.08)',color:call.customer_decision.startsWith('yes')?'#22C55E':'#F97316',border:`1px solid ${call.customer_decision.startsWith('yes')?'rgba(34,197,94,0.25)':'rgba(249,115,22,0.25)'}`}}>{call.customer_decision==='yes'?'وافق على العرض الأول':call.customer_decision==='yes_counter'?'وافق على العرض البديل':'رفض كلا العرضين'}</span></div>}
            </div>
          </div>
          {audioUrl&&<div style={{padding:'8px 12px',borderTop:'1px solid #1C2A45',flexShrink:0}}><p style={{fontSize:10,color:'#94A3B8',marginBottom:5}}>تسجيل المكالمة</p><audio controls style={{width:'100%',height:26}}><source src={audioUrl} type="audio/webm"/></audio></div>}
        </div>
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'8px 14px',borderBottom:'1px solid #1C2A45',background:'rgba(139,92,246,0.04)',flexShrink:0}}><p style={{fontSize:11,fontWeight:700,color:'#C4B5FD'}}>تحليل MARBERT</p></div>
          <div style={{flex:1,overflowY:'auto',padding:'12px',display:'flex',flexDirection:'column',gap:10}}>
            <div style={{background:'#141E33',borderRadius:8,border:'1px solid #1C2A45',overflow:'hidden'}}>
              <div style={{padding:'6px 12px',background:'rgba(59,130,246,0.06)',borderBottom:'1px solid #1C2A45',display:'flex',justifyContent:'space-between'}}><p style={{fontSize:10,fontWeight:700,color:'#93C5FD'}}>نموذج النية</p><span style={{fontSize:10,color:'#3B82F6',fontWeight:700}}>{pct(call.intent_confidence||0)}</span></div>
              <div style={{padding:'10px 12px'}}><p style={{fontSize:12,fontWeight:700,color:'#93C5FD',marginBottom:8}}>{INTENT_AR[call.intent]||call.intent}</p>{Object.entries(intentScores as Record<string,number>).sort((a,b)=>b[1]-a[1]).map(([l,s])=><ScoreBar key={l} label={INTENT_AR[l]||l} score={s as number} color="#3B82F6" isTop={l===call.intent}/>)}</div>
            </div>
            <div style={{background:'#141E33',borderRadius:8,border:'1px solid #1C2A45',overflow:'hidden'}}>
              <div style={{padding:'6px 12px',background:'rgba(139,92,246,0.06)',borderBottom:'1px solid #1C2A45',display:'flex',justifyContent:'space-between'}}><p style={{fontSize:10,fontWeight:700,color:'#C4B5FD'}}>نموذج الحالة النفسية</p><span style={{fontSize:10,color:'#8B5CF6',fontWeight:700}}>{pct(call.emotion_confidence||0)}</span></div>
              <div style={{padding:'10px 12px'}}><p style={{fontSize:12,fontWeight:700,color:'#C4B5FD',marginBottom:8}}>{EMOTION_AR[call.emotion]||call.emotion}</p>{Object.entries(emotionScores as Record<string,number>).sort((a,b)=>b[1]-a[1]).map(([l,s])=><ScoreBar key={l} label={EMOTION_AR[l]||l} score={s as number} color={EMOTION_COLOR[l]||'#8B5CF6'} isTop={l===call.emotion}/>)}</div>
            </div>
            <div style={{background:pc.bg,borderRadius:8,border:`1px solid ${pc.border}`,padding:'10px 12px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div><p style={{fontSize:9,color:pc.text,opacity:.7,fontWeight:600,marginBottom:3}}>الأولوية</p><p style={{fontSize:16,fontWeight:700,color:pc.text}}>{pc.label}</p></div>
              <div style={{textAlign:'center'}}><p style={{fontSize:18,fontWeight:700,color:pc.text}}>{call.actions_taken?.length||0}</p><p style={{fontSize:9,color:pc.text,opacity:.7}}>إجراء</p></div>
            </div>
            {call.actions_taken?.length>0&&<div style={{background:'#141E33',borderRadius:8,border:'1px solid #1C2A45',padding:'10px 12px'}}><p style={{fontSize:11,color:'#E2E8F0',fontWeight:700,marginBottom:6}}>الإجراءات المنفذة</p>{call.actions_taken.map((a:string)=><div key={a} style={{display:'flex',gap:5,padding:'4px 8px',background:'rgba(34,197,94,0.05)',border:'1px solid rgba(34,197,94,0.15)',borderRadius:5,marginBottom:4}}><span style={{fontSize:9,color:'#22C55E',fontWeight:700}}>تم</span><span style={{fontSize:11,color:'#86EFAC'}}>{ACTION_AR[a]||a}</span></div>)}</div>}
            {call.agent_note&&<div style={{background:'rgba(239,68,68,0.04)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,padding:'10px 12px'}}><p style={{fontSize:11,color:'#EF4444',fontWeight:700,marginBottom:4}}>ملاحظة الموظف</p><p style={{fontSize:11,color:'#FCA5A5',lineHeight:1.5}}>{call.agent_note}</p></div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  SUMMARY VIEW
// ══════════════════════════════════════════════════════
function SummaryView({call,onBack,onTwin,wsStatus}:{call:any;onBack:()=>void;onTwin:()=>void;wsStatus:string}){
  const pc=PRIORITY_STYLE[call.priority]||PRIORITY_STYLE.LOW
  const [quality,setQuality]=useState<any>(null)
  const [summary,setSummary]=useState<any>(null)
  useEffect(()=>{
    fetch(`${API}/dashboard/calls/${call.ticket_number}/quality`)
      .then(r=>r.json()).then(d=>{setQuality(d.quality);setSummary(d.summary)}).catch(()=>{})
  },[call.ticket_number])
  return(
    <div style={{flex:1,overflowY:'auto',padding:'14px 16px',display:'flex',flexDirection:'column',gap:10,minHeight:0}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
        <button onClick={onBack} style={{background:'transparent',border:'1px solid #1C2A45',borderRadius:6,padding:'3px 10px',cursor:'pointer',color:'#7A92B8',fontFamily:'inherit',fontSize:11}}>رجوع</button>
        <p style={{fontSize:12,fontWeight:700,color:'#E2E8F0'}}>{INTENT_AR[call.intent]||call.intent}</p>
        <span style={{fontSize:10,color:'#475569'}}>{call.ticket_number}</span>
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <span style={{fontSize:11,fontWeight:600,padding:'4px 12px',borderRadius:5,background:call.status==='resolved'?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',color:call.status==='resolved'?'#22C55E':'#EF4444',border:`1px solid ${call.status==='resolved'?'rgba(34,197,94,0.25)':'rgba(239,68,68,0.25)'}`}}>{call.status==='resolved'?'محلولة':'مفتوحة'}</span>
        <span style={{fontSize:11,fontWeight:600,padding:'4px 12px',borderRadius:5,background:pc.bg,color:pc.text,border:`1px solid ${pc.border}`}}>{pc.label}</span>
      </div>
      <div style={{background:'#141E33',borderRadius:8,border:'1px solid #1C2A45',padding:'10px 12px'}}>
        <p style={{fontSize:11,color:'#E2E8F0',fontWeight:700,marginBottom:4}}>رسالة العميل</p>
        <p style={{fontSize:13,color:'#CBD5E1',lineHeight:1.7}}>{call.customer_text||'—'}</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div style={{background:'#141E33',borderRadius:8,border:'1px solid #1C2A45',padding:'10px 12px'}}>
          <p style={{fontSize:11,color:'#E2E8F0',fontWeight:700,marginBottom:3}}>النية</p>
          <p style={{fontSize:12,fontWeight:700,color:'#93C5FD'}}>{INTENT_AR[call.intent]||'—'}</p>
          <p style={{fontSize:10,color:'#94A3B8'}}>{pct(call.intent_confidence||0)} ثقة</p>
        </div>
        <div style={{background:'#141E33',borderRadius:8,border:'1px solid #1C2A45',padding:'10px 12px'}}>
          <p style={{fontSize:11,color:'#E2E8F0',fontWeight:700,marginBottom:3}}>الحالة النفسية</p>
          <p style={{fontSize:12,fontWeight:700,color:EMOTION_COLOR[call.emotion]||'#C4B5FD'}}>{EMOTION_AR[call.emotion]||'—'}</p>
          <p style={{fontSize:10,color:'#94A3B8'}}>{pct(call.emotion_confidence||0)} ثقة</p>
        </div>
      </div>
      {call.actions_taken?.length>0&&<div style={{background:'#141E33',borderRadius:8,border:'1px solid #1C2A45',padding:'10px 12px'}}><p style={{fontSize:11,color:'#E2E8F0',fontWeight:700,marginBottom:6}}>الإجراءات المنفذة</p>{call.actions_taken.map((a:string)=><div key={a} style={{display:'flex',gap:5,padding:'4px 8px',background:'rgba(34,197,94,0.05)',border:'1px solid rgba(34,197,94,0.15)',borderRadius:5,marginBottom:4}}><span style={{fontSize:9,color:'#22C55E',fontWeight:700}}>تم</span><span style={{fontSize:11,color:'#86EFAC'}}>{ACTION_AR[a]||a}</span></div>)}</div>}
      {call.agent_note&&<div style={{background:'rgba(239,68,68,0.04)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,padding:'10px 12px'}}><p style={{fontSize:11,color:'#EF4444',fontWeight:700,marginBottom:4}}>ملاحظة الموظف</p><p style={{fontSize:11,color:'#FCA5A5',lineHeight:1.5}}>{call.agent_note}</p></div>}

      {summary&&<div style={{background:'#141E33',borderRadius:8,border:'1px solid #1C2A45',overflow:'hidden'}}>
        <div style={{padding:'6px 12px',background:'rgba(37,99,235,0.08)',borderBottom:'1px solid #1C2A45'}}><p style={{fontSize:11,color:'#93C5FD',fontWeight:700}}>الملخص الذكي — قراءة 10 ثواني</p></div>
        <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:6}}>
          {([['المشكلة',summary.problem,'#EF4444'],['السبب',summary.cause,'#F97316'],['الإجراءات',summary.actions,'#22C55E'],['قرار العميل',summary.customer_decision,'#3B82F6'],['النتيجة',summary.outcome,'#E2E8F0'],['الخطوات القادمة',summary.next_steps,'#F59E0B']] as [string,string,string][]).map(([label,value,color])=>(
            <div key={label} style={{display:'flex',gap:8,alignItems:'flex-start'}}>
              <span style={{fontSize:11,fontWeight:700,color:'#E2E8F0',minWidth:90,paddingTop:1,flexShrink:0}}>{label}</span>
              <span style={{fontSize:10,color:'#94A3B8',lineHeight:1.5,wordBreak:'break-word' as any}}>{value}</span>
            </div>
          ))}
        </div>
      </div>}

      {quality&&<div style={{background:'#141E33',borderRadius:8,border:'1px solid #1C2A45',overflow:'hidden'}}>
        <div style={{padding:'6px 12px',background:'rgba(139,92,246,0.08)',borderBottom:'1px solid #1C2A45'}}><p style={{fontSize:11,color:'#C4B5FD',fontWeight:700}}>تقييم جودة الذكاء الاصطناعي</p></div>
        <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:8}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
            {([['رضا العميل',`${quality.satisfaction_score}%`,quality.satisfaction_label,quality.satisfaction_score>=80?'#22C55E':quality.satisfaction_score>=60?'#F59E0B':'#EF4444'],['ثقة النموذج',quality.confidence_rating,`نية ${Math.round((call.intent_confidence||0)*100)}%`,'#3B82F6'],['وقت الحل',quality.resolution_time,quality.resolved?'حُلّت تلقائياً':'حُوّلت','#F59E0B']] as [string,string,string,string][]).map(([label,value,sub,color])=>(
              <div key={label} style={{background:'rgba(255,255,255,0.03)',borderRadius:6,border:'1px solid #1C2A45',padding:'8px',textAlign:'center'}}>
                <p style={{fontSize:9,color:'#94A3B8',marginBottom:3}}>{label}</p>
                <p style={{fontSize:12,fontWeight:700,color,lineHeight:1.2}}>{value}</p>
                <p style={{fontSize:8,color:'#475569',marginTop:2}}>{sub}</p>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            <span style={{fontSize:9,padding:'2px 8px',borderRadius:4,background:quality.resolved?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',color:quality.resolved?'#22C55E':'#EF4444',border:`1px solid ${quality.resolved?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)'}`}}>{quality.resolved?'محلولة':'غير محلولة'}</span>
            {quality.negotiated&&<span style={{fontSize:9,padding:'2px 8px',borderRadius:4,background:'rgba(59,130,246,0.1)',color:'#93C5FD',border:'1px solid rgba(59,130,246,0.2)'}}>تم التفاوض</span>}
            {quality.human_needed&&<span style={{fontSize:9,padding:'2px 8px',borderRadius:4,background:'rgba(249,115,22,0.1)',color:'#FDBA74',border:'1px solid rgba(249,115,22,0.2)'}}>يحتاج متابعة</span>}
            <span style={{fontSize:9,padding:'2px 8px',borderRadius:4,background:'rgba(255,255,255,0.04)',color:'#7A92B8',border:'1px solid #1C2A45'}}>{quality.classification_quality}</span>
          </div>
        </div>
      </div>}

      <div style={{display:'flex',gap:8}}>
        <button onClick={onTwin} style={{flex:1,padding:'10px 0',background:'#1D4ED8',border:'none',borderRadius:8,color:'#fff',fontFamily:'inherit',fontSize:12,fontWeight:600,cursor:'pointer'}}>عرض التحليل الكامل</button>
        <button onClick={()=>window.open(`${API}/dashboard/calls/${call.ticket_number}/report`,'_blank')} style={{padding:'10px 14px',background:'transparent',border:'1px solid rgba(184,80,66,0.4)',borderRadius:8,color:'#F87171',fontFamily:'inherit',fontSize:11,cursor:'pointer'}}>تقرير PDF</button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  CHARTS SECTION
// ══════════════════════════════════════════════════════
function ChartsSection({calls}:{calls:any[]}){
  const total=calls.length||1

  // Intent distribution
  const intentCounts:Record<string,number>={}
  calls.forEach(c=>{const k=c.intent||'';intentCounts[k]=(intentCounts[k]||0)+1})
  const intentData=Object.entries(intentCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({
    label:INTENT_AR[k]||k, value:v, color:INTENT_COLOR[k]||'#3B82F6'
  }))

  // Emotion distribution
  const emotionCounts:Record<string,number>={}
  calls.forEach(c=>{const k=c.emotion||'';emotionCounts[k]=(emotionCounts[k]||0)+1})
  const emotionData=Object.entries(emotionCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({
    label:EMOTION_AR[k]||k, value:v, color:EMOTION_COLOR[k]||'#8B5CF6'
  }))

  // Resolution rate
  const resolved=calls.filter(c=>c.status==='resolved').length
  const rate=Math.round(resolved/total*100)

  // Hourly trend (last 12 hours)
  const now=Date.now()/1000
  const hourly=Array(8).fill(0).map((_,i)=>{
    const start=now-(8-i)*3600, end=now-(7-i)*3600
    return calls.filter(c=>c.created_at>=start&&c.created_at<end).length
  })

  // Word cloud from customer texts
  const stopwords=new Set(['من','في','على','إلى','عن','مع','هذا','هذه','ذلك','التي','الذي','أن','إن','كان','لا','ما','أنا','انا','يا','و','ف','ب','ل','ال','او','أو','عندي','عندي','ابغا','ابي','أبي'])
  const wordCount:Record<string,number>={}
  calls.forEach(c=>{
    const text=c.customer_text||''
    const words=text.match(/[\u0600-\u06FF]+/g)||[]
    words.forEach((w:string)=>{
      if(w.length>=2&&!stopwords.has(w)) wordCount[w]=(wordCount[w]||0)+1
    })
  })
  const wordData=Object.entries(wordCount).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([text,value])=>({text,value}))

  // Negotiation stats
  const negotiated=calls.filter(c=>c.customer_decision==='yes_counter').length
  const escalated=calls.filter(c=>c.customer_decision==='no').length

  return(
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:14}}>

      {/* Donut — Intent Distribution */}
      <div style={{background:'#141E33',borderRadius:12,border:'1px solid #1C2A45',padding:'14px'}}>
        <p style={{fontSize:12,fontWeight:700,color:'#E2E8F0',marginBottom:12}}>توزيع المشاكل</p>
        <DonutChart data={intentData} size={130}/>
        <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:4}}>
          {intentData.slice(0,4).map(d=>(
            <div key={d.label} style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:d.color,flexShrink:0}}/>
              <span style={{fontSize:9,color:'#94A3B8',flex:1}}>{d.label}</span>
              <span style={{fontSize:9,color:'#E2E8F0',fontWeight:700}}>{d.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bar — Emotion Breakdown */}
      <div style={{background:'#141E33',borderRadius:12,border:'1px solid #1C2A45',padding:'14px'}}>
        <p style={{fontSize:12,fontWeight:700,color:'#E2E8F0',marginBottom:12}}>الحالة النفسية</p>
        <BarChart data={emotionData} height={110}/>
      </div>

      {/* Word Cloud */}
      <div style={{background:'#141E33',borderRadius:12,border:'1px solid #1C2A45',padding:'14px'}}>
        <p style={{fontSize:12,fontWeight:700,color:'#E2E8F0',marginBottom:8}}>أكثر الكلمات تكراراً</p>
        <WordCloud words={wordData}/>
        {wordData.length>0&&(
          <div style={{marginTop:8,display:'flex',flexWrap:'wrap',gap:4}}>
            {wordData.slice(0,5).map(w=>(
              <span key={w.text} style={{fontSize:9,padding:'2px 7px',borderRadius:10,background:'rgba(59,130,246,0.1)',color:'#93C5FD',border:'1px solid rgba(59,130,246,0.2)'}}>{w.text} ({w.value})</span>
            ))}
          </div>
        )}
      </div>

      {/* Hourly trend */}
      <div style={{background:'#141E33',borderRadius:12,border:'1px solid #1C2A45',padding:'14px'}}>
        <p style={{fontSize:12,fontWeight:700,color:'#E2E8F0',marginBottom:4}}>نشاط المكالمات</p>
        <p style={{fontSize:10,color:'#94A3B8',marginBottom:10}}>آخر 8 ساعات</p>
        <Sparkline data={hourly} color="#3B82F6" h={60} w={260}/>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
          <span style={{fontSize:9,color:'#475569'}}>-8h</span>
          <span style={{fontSize:9,color:'#475569'}}>الآن</span>
        </div>
      </div>

      {/* Resolution stats */}
      <div style={{background:'#141E33',borderRadius:12,border:'1px solid #1C2A45',padding:'14px'}}>
        <p style={{fontSize:12,fontWeight:700,color:'#E2E8F0',marginBottom:12}}>نسبة الحل التلقائي</p>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10}}>
          <svg width={110} height={110} style={{display:'block'}}>
            <circle cx={55} cy={55} r={40} fill="none" stroke="#1C2A45" strokeWidth={10}/>
            <circle cx={55} cy={55} r={40} fill="none" stroke="#22C55E" strokeWidth={10}
              strokeDasharray={`${2*Math.PI*40*rate/100} ${2*Math.PI*40}`}
              strokeDashoffset={2*Math.PI*40*0.25}
              strokeLinecap="round"/>
            <text x={55} y={50} textAnchor="middle" fill="#22C55E" fontSize={22} fontWeight={700}>{rate}%</text>
            <text x={55} y={67} textAnchor="middle" fill="#94A3B8" fontSize={9}>محلولة</text>
          </svg>
        </div>
        <div style={{display:'flex',gap:8}}>
          <div style={{flex:1,textAlign:'center',background:'rgba(34,197,94,0.06)',borderRadius:7,padding:'6px'}}>
            <p style={{fontSize:16,fontWeight:700,color:'#22C55E'}}>{resolved}</p>
            <p style={{fontSize:9,color:'#94A3B8'}}>محلولة</p>
          </div>
          <div style={{flex:1,textAlign:'center',background:'rgba(239,68,68,0.06)',borderRadius:7,padding:'6px'}}>
            <p style={{fontSize:16,fontWeight:700,color:'#EF4444'}}>{total-resolved}</p>
            <p style={{fontSize:9,color:'#94A3B8'}}>مفتوحة</p>
          </div>
        </div>
      </div>

      {/* Negotiation stats */}
      <div style={{background:'#141E33',borderRadius:12,border:'1px solid #1C2A45',padding:'14px'}}>
        <p style={{fontSize:12,fontWeight:700,color:'#E2E8F0',marginBottom:12}}>نتائج التفاوض</p>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {[
            {label:'وافق مباشرة',value:calls.filter(c=>c.customer_decision==='yes').length,color:'#22C55E'},
            {label:'وافق بعد التفاوض',value:negotiated,color:'#3B82F6'},
            {label:'رفض — حُوّل لموظف',value:escalated,color:'#EF4444'},
          ].map(d=>(
            <div key={d.label} style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:d.color,flexShrink:0}}/>
              <span style={{fontSize:10,color:'#94A3B8',flex:1}}>{d.label}</span>
              <span style={{fontSize:13,fontWeight:700,color:d.color}}>{d.value}</span>
              <div style={{width:50,height:5,background:'#0A0E1A',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${(d.value/total)*100}%`,background:d.color,borderRadius:3}}/>
              </div>
            </div>
          ))}
        </div>
        {negotiated>0&&(
          <div style={{marginTop:10,padding:'6px 10px',background:'rgba(59,130,246,0.06)',borderRadius:7,border:'1px solid rgba(59,130,246,0.15)'}}>
            <p style={{fontSize:9,color:'#93C5FD'}}>معدل نجاح التفاوض: <strong>{Math.round(negotiated/(negotiated+escalated)*100)||0}%</strong></p>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  MAIN DASHBOARD
// ══════════════════════════════════════════════════════
function StatCard({label,value,color,flash,sub}:{label:string;value:string|number;color:string;flash?:boolean;sub?:string}){
  return(
    <div style={{background:'linear-gradient(160deg,#141E33,#0F1629)',borderRadius:12,border:`1px solid ${flash?color:'#1C2A45'}`,padding:'14px 16px',transition:'all .4s',boxShadow:flash?`0 0 16px ${color}33`:'none'}}>
      <p style={{fontSize:11,color:'#E2E8F0',fontWeight:700,marginBottom:8,letterSpacing:'.03em'}}>{label}</p>
      <p style={{fontSize:26,fontWeight:700,color,lineHeight:1}}>{value}</p>
      {sub&&<p style={{fontSize:10,color:'#94A3B8',marginTop:5}}>{sub}</p>}
    </div>
  )
}

export default function AgentDashboard(){
  const [calls,setCalls]=useState<any[]>([])
  const [stats,setStats]=useState({total_today:0,fraud_today:0,critical_today:0,open_today:0})
  const [view,setView]=useState<'table'|'summary'|'twin'>('table')
  const [selected,setSelected]=useState<any>(null)
  const [filter,setFilter]=useState<'all'|'open'|'resolved'>('all')
  const [search,setSearch]=useState('')
  const [wsStatus,setWsStatus]=useState<'connecting'|'connected'|'disconnected'>('connecting')
  const [newFlash,setNewFlash]=useState('')
  const [showCall,setShowCall]=useState(true)
  const [showCharts,setShowCharts]=useState(true)
  const wsRef=useRef<WebSocket|null>(null)

  const loadData=useCallback(async()=>{
    try{
      const [cr,sr]=await Promise.all([fetch(`${API}/dashboard/calls`),fetch(`${API}/dashboard/stats`)])
      setCalls((await cr.json()).calls||[])
      setStats(await sr.json())
    }catch{}
  },[])

  useEffect(()=>{
    loadData()
    function connect(){
      const ws=new WebSocket(`${WS_URL}/ws/dashboard`)
      wsRef.current=ws
      ws.onopen=()=>setWsStatus('connected')
      ws.onmessage=e=>{
        try{const m=JSON.parse(e.data);if(m.type==='new_call'){loadData();setNewFlash(m.data?.ticket_number||'');setTimeout(()=>setNewFlash(''),3000)}}catch{}
      }
      ws.onclose=()=>{setWsStatus('disconnected');setTimeout(connect,3000)}
      ws.onerror=()=>{setWsStatus('disconnected');ws.close()}
    }
    connect()
    return()=>wsRef.current?.close()
  },[loadData])

  const resolved=calls.filter(c=>c.status==='resolved').length
  const rate=calls.length?Math.round(resolved/calls.length*100):0
  const filtered=calls
    .filter(c=>filter==='all'||c.status===filter)
    .filter(c=>!search||c.customer_text?.includes(search)||c.ticket_number?.includes(search)||INTENT_AR[c.intent]?.includes(search))

  return(
    <>
      <Head><title>تسعة — لوحة الموظف</title></Head>
      <div style={{height:'100vh',background:'#0A0E1A',color:'#E2E8F0',display:'flex',overflow:'hidden',fontFamily:"'Segoe UI',system-ui,sans-serif"}}>

        {/* Call panel — left */}
        {showCall&&<CallPanel onClose={()=>setShowCall(false)}/>}

        {/* Dashboard */}
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>

          {/* Header */}
          <header style={{background:'#0F1629',borderBottom:'1px solid #1C2A45',padding:'0 20px',height:52,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:26,height:26,borderRadius:6,background:'#1D4ED8',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff'}}>٩</div>
              <p style={{fontSize:13,fontWeight:700}}>تسعة — لوحة الموظف</p>
              <span style={{fontSize:10,color:'#475569'}}>مصرف الإنماء</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {!showCall&&<button onClick={()=>setShowCall(true)} style={{padding:'4px 11px',background:'rgba(37,99,235,0.15)',border:'1px solid rgba(37,99,235,0.4)',borderRadius:6,color:'#93C5FD',fontFamily:'inherit',fontSize:11,cursor:'pointer'}}>عرض محادثة العميل</button>}
              <button onClick={()=>setShowCharts(s=>!s)} style={{padding:'4px 11px',background:'transparent',border:'1px solid #1C2A45',borderRadius:6,color:'#7A92B8',fontFamily:'inherit',fontSize:11,cursor:'pointer'}}>{showCharts?'إخفاء التحليلات':'عرض التحليلات'}</button>
              <button onClick={()=>window.open(`${API}/dashboard/report/daily`,'_blank')} style={{padding:'4px 11px',background:'transparent',border:'1px solid rgba(184,80,66,0.4)',borderRadius:6,color:'#F87171',fontFamily:'inherit',fontSize:11,cursor:'pointer'}}>تقرير PDF يومي</button>
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:wsStatus==='connected'?'#22C55E':'#EF4444',boxShadow:wsStatus==='connected'?'0 0 5px #22C55E':'none'}}/>
                <span style={{fontSize:10,color:'#475569'}}>{wsStatus==='connected'?'مباشر':'منقطع'}</span>
              </div>
            </div>
          </header>

          {view==='twin'&&selected?(
            <TwinView call={selected} wsStatus={wsStatus} onBack={()=>setView('summary')}/>
          ):(
            <div style={{flex:1,display:'flex',overflow:'hidden',height:'100%'}}>
              <div style={{flex:1,overflow:'auto',padding:'14px 18px'}}>

                {/* Ops bar */}
                <div style={{background:'#0D1729',border:'1px solid #1C2A45',borderRadius:10,padding:'8px 16px',display:'flex',alignItems:'center',gap:20,marginBottom:14,flexWrap:'wrap'}}>
                  {[
                    {label:'مكالمات اليوم',value:stats.total_today,color:'#3B82F6'},
                    {label:'حُلّت تلقائياً',value:`${resolved} (${rate}%)`,color:'#22C55E'},
                    {label:'احتيال',value:stats.fraud_today,color:'#EF4444'},
                    {label:'حرجة',value:stats.critical_today,color:'#F97316'},
                    {label:'مفتوحة',value:stats.open_today,color:'#EAB308'},
                  ].map(s=>(
                    <div key={s.label} style={{display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:14,fontWeight:700,color:s.color}}>{s.value}</span>
                      <span style={{fontSize:10,color:'#CBD5E1'}}>{s.label}</span>
                      <span style={{color:'#1C2A45',marginLeft:4}}>|</span>
                    </div>
                  ))}
                </div>

                {/* Stat cards */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
                  <StatCard label="إجمالي المكالمات" value={stats.total_today} color="#3B82F6" flash={newFlash!==''} sub="اليوم"/>
                  <StatCard label="احتيال مالي" value={stats.fraud_today} color="#EF4444" sub="يحتاج مراجعة فورية"/>
                  <StatCard label="حالات حرجة" value={stats.critical_today} color="#F97316" sub="أولوية عالية"/>
                  <StatCard label="مفتوحة" value={stats.open_today} color="#EAB308" sub="تحتاج متابعة"/>
                </div>

                {/* Charts */}
                {showCharts&&calls.length>0&&<ChartsSection calls={calls}/>}

                {/* Filter + Search */}
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                  {[{k:'all',l:'الكل'},{k:'open',l:'مفتوحة'},{k:'resolved',l:'محلولة'}].map(f=>(
                    <button key={f.k} onClick={()=>setFilter(f.k as any)} style={{padding:'4px 12px',borderRadius:6,fontSize:11,fontFamily:'inherit',cursor:'pointer',background:filter===f.k?'rgba(29,78,216,0.2)':'transparent',border:filter===f.k?'1px solid rgba(29,78,216,0.5)':'1px solid #1C2A45',color:filter===f.k?'#93C5FD':'#CBD5E1',fontWeight:filter===f.k?600:400}}>{f.l}</button>
                  ))}
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث..."
                    style={{marginRight:'auto',padding:'4px 12px',background:'rgba(255,255,255,0.03)',border:'1px solid #1C2A45',borderRadius:6,color:'#E2E8F0',fontFamily:'inherit',fontSize:11,outline:'none',width:200}} dir="rtl"/>
                  <span style={{fontSize:11,color:'#94A3B8'}}>{filtered.length} سجل</span>
                </div>

                {/* Table */}
                <div style={{background:'#0F1629',borderRadius:10,border:'1px solid #1C2A45',overflow:'hidden'}}>
                  <div style={{display:'grid',gridTemplateColumns:'42px 94px 1fr 110px 90px 88px 78px 62px',padding:'9px 16px',borderBottom:'1px solid #1C2A45',background:'rgba(255,255,255,0.02)'}}>
                    {['#','التذكرة','رسالة العميل','التصنيف','الحالة النفسية','الأولوية','الحالة','الوقت'].map((h,i)=>(
                      <span key={i} style={{fontSize:11,color:'#E2E8F0',fontWeight:700}}>{h}</span>
                    ))}
                  </div>
                  {filtered.length===0&&(
                    <div style={{padding:'40px 20px',textAlign:'center'}}>
                      <p style={{fontSize:13,color:'#475569'}}>{calls.length===0?'لا توجد سجلات — ابدأ محادثة من لوحة العميل':'لا توجد نتائج'}</p>
                    </div>
                  )}
                  {filtered.map(call=>{
                    const pc=PRIORITY_STYLE[call.priority]||PRIORITY_STYLE.LOW
                    const isNew=call.ticket_number===newFlash
                    return(
                      <div key={call.id} onClick={()=>{setSelected(call);setView('summary')}}
                        style={{display:'grid',gridTemplateColumns:'42px 94px 1fr 110px 90px 88px 78px 62px',padding:'11px 16px',borderBottom:'1px solid rgba(28,42,69,0.5)',cursor:'pointer',alignItems:'center',transition:'background .12s',borderRight:`3px solid ${isNew?pc.solid:'transparent'}`}}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <span style={{fontSize:11,color:'#334155'}}>#{call.id}</span>
                        <span style={{fontSize:9,color:'#3B82F6',fontFamily:'monospace'}}>{call.ticket_number}</span>
                        <p style={{fontSize:12,color:'#CBD5E1',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingLeft:8}}>{call.customer_text||'—'}</p>
                        <span style={{fontSize:11,color:'#93C5FD'}}>{INTENT_AR[call.intent]||call.intent}</span>
                        <span style={{fontSize:11,color:EMOTION_COLOR[call.emotion]||'#7A92B8'}}>{EMOTION_AR[call.emotion]||'—'}</span>
                        <span style={{fontSize:10,fontWeight:700,padding:'3px 7px',borderRadius:5,background:pc.bg,color:pc.text,border:`1px solid ${pc.border}`,whiteSpace:'nowrap',display:'inline-block'}}>{pc.label}</span>
                        <span style={{fontSize:10,fontWeight:600,color:call.status==='resolved'?'#22C55E':'#EF4444'}}>{call.status==='resolved'?'محلولة':'مفتوحة'}</span>
                        <span style={{fontSize:10,color:'#334155',fontFamily:'monospace'}}>{fmt(call.created_at)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Summary side panel */}
              {selected&&view==='summary'&&(
                <div style={{width:420,borderRight:'1px solid #1C2A45',display:'flex',flexDirection:'column',flexShrink:0,height:'100%'}}>
                  <div style={{padding:'8px 14px',borderBottom:'1px solid #1C2A45',background:'#0F1629',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
                    <p style={{fontSize:11,fontWeight:700,color:'#E2E8F0'}}>تفاصيل المكالمة</p>
                    <button onClick={()=>{setSelected(null);setView('table')}} style={{background:'transparent',border:'none',color:'#475569',cursor:'pointer',fontSize:16}}>×</button>
                  </div>
                  <SummaryView call={selected} onBack={()=>{setSelected(null);setView('table')}} onTwin={()=>setView('twin')} wsStatus={wsStatus}/>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
