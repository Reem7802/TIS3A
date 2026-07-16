"""
تسعة — Conversation Router v5
================================
Fixed response library replaces Qwen for all conversation turns.
MARBERT still handles all classification.
Responses are natural, varied, instant — no LLM latency.
"""

import time
from fastapi import APIRouter
from pydantic import BaseModel

from core.classifier import analyze_text
from core.flow_engine import get_flow, apply_emotion_boost, ACTION_AR
from core.database import save_call
from core.responses import (
    get_greeting, get_gathering, build_question, get_confirm_question,
    get_counter_offer, get_yes_response, get_counter_yes_response,
    get_final_no, get_out_of_scope, get_unclear,
)
from .ws import manager

router = APIRouter()

# ── Greeting detection ────────────────────────────────────────────────────────
GREETINGS = {
    "سلام","السلام","هلا","مرحبا","مرحباً","هاي","اهلين","اهلاً","اهلا",
    "صباح الخير","مساء الخير","صبح","مسا","كيفك","كيف الحال","هلو","ألو","الو",
    "اه","آه","يا هلا","شلونك","hi","hello","hey",
}

def is_greeting(text: str) -> bool:
    cleaned = text.strip().lower().replace("،","").replace(".","")
    words = cleaned.split()
    # Single word only — "هلا" "سلام" etc
    if len(words) == 1 and words[0] in GREETINGS:
        return True
    # Multiple words but ALL are greeting words
    if len(words) <= 4 and all(w in GREETINGS for w in words):
        return True
    return False

# ── Yes/No detection ──────────────────────────────────────────────────────────
YES_WORDS = {"نعم","اي","إي","ايه","اوكي","أوكي","تمام","موافق","اكيد","أكيد",
             "يلا","خلاص","اه","yes","ok","ايوه","طبعاً","بالتأكيد","وافق","اوكيه","ايوا"}
NO_WORDS  = {"لا","لأ","ابد","أبد","مو","no","نوب","ماله","مالي","مب","لا يهمني"}

QUESTION_WORDS = {"ايش","وش","كيف","ليش","متى","وين","هل","شو","معناه","يعني",
                  "فيه","ممكن","يمكن","اقدر","تقدر","عندك","عندكم"}

QUESTION_SUBSTRINGS = [
    "مافيه","ماعندك","ماعندكم","فيه حل","ممكن حل","يمكن حل",
    "فيه بديل","فيه خيار","حل ثاني","بديل ثاني","خيار ثاني",
    "غير كذا","بدل كذا","وش يصير","ايش يصير","كيف يصير",
    "فيه شي ثاني","فيه طريقه","فيه طريقة","ما فيه","مافي غير",
    "فيه حل ثاني","فيه بديل ثاني","غير هذا","ما عندك غير",
]

# Out-of-scope keywords — not banking emergency
OUT_OF_SCOPE_KEYWORDS = [
    "سعر","أسعار","قرض","قروض","تمويل","بطاقة ائتمانية","بطاقات ائتمانية",
    "فيزا","ماستركارد","حساب جديد","فتح حساب","استثمار","صندوق",
    "رسوم","عمولة","فائدة","معدل",
]

def is_out_of_scope(text: str) -> bool:
    cleaned = text.lower()
    return any(kw in cleaned for kw in OUT_OF_SCOPE_KEYWORDS)

def parse_yes_no(text: str) -> str:
    cleaned = text.strip().lower().replace("،","").replace(".","").replace("؟","")
    words   = set(cleaned.split())

    if text.strip().endswith("؟") or text.strip().endswith("?"):
        return "question"

    # Multiple ? = frustrated customer asking a question
    if text.count("؟") > 1 or text.count("?") > 1:
        return "question"

    for sub in QUESTION_SUBSTRINGS:
        if sub in cleaned:
            return "question"

    if words & QUESTION_WORDS and len(words) <= 8:
        return "question"

    if words & YES_WORDS:  return "yes"
    if words & NO_WORDS:   return "no"
    if any(w in cleaned for w in YES_WORDS): return "yes"
    if any(w in cleaned for w in NO_WORDS):  return "no"

    return "unclear"

# ── Schemas ───────────────────────────────────────────────────────────────────
class StartInput(BaseModel):
    text:       str
    session_id: str = ""
    channel:    str = "voice"

class AnswerInput(BaseModel):
    text:         str
    session_id:   str
    question_idx: int
    answers:      list[str] = []

class ConfirmInput(BaseModel):
    text:       str
    session_id: str

# ── Sessions ──────────────────────────────────────────────────────────────────
sessions: dict[str, dict] = {}

def _new_session(channel, text, analysis, flow):
    intent   = analysis.get("intent","")
    emotion  = analysis.get("emotion","calm")
    priority = apply_emotion_boost(flow.priority if flow else "LOW", emotion)
    return {
        "channel":           channel,
        "customer_text":     text,
        "analysis":          analysis,
        "intent":            intent,
        "emotion":           emotion,
        "priority":          priority,
        "questions":         flow.questions if flow else [],
        "answers":           [],
        "negotiation_stage": "main",
        "question_idx":      0,
        "customer_turns":    [text],
        "assistant_turns":   [],
        "transcript_turns":  [text],
    }

def _record_turn(session, customer_text, assistant_text):
    session.setdefault("customer_turns",  []).append(customer_text)
    session.setdefault("assistant_turns", []).append(assistant_text)
    session.setdefault("transcript_turns",[]).append(customer_text)


# ── Smart classification threshold ───────────────────────────────────────────
def _should_classify(text: str, analysis: dict) -> bool:
    """
    Decide if we have enough signal to classify and start the flow.
    Returns False if the message is too vague — system will ask for more info.
    """
    words = text.strip().split()
    confidence = analysis.get("intent_confidence", 0)
    intent = analysis.get("intent", "")

    # Always classify if message is long enough (5+ words with clear content)
    if len(words) >= 5 and confidence >= 0.70:
        return True

    # Always classify high-confidence even on short messages
    if confidence >= 0.88:
        return True

    # Very short messages with low confidence — need more info
    if len(words) <= 3 and confidence < 0.80:
        return False

    # Medium length with decent confidence
    if len(words) >= 4 and confidence >= 0.75:
        return True

    return False


# ── POST /conversation/start ───────────────────────────────────────────────────
@router.post("/start")
async def start_conversation(req: StartInput):
    session_id = req.session_id or str(int(time.time()*1000))

    # Greeting
    if is_greeting(req.text):
        msg = get_greeting()
        sessions[session_id] = {
            "channel":req.channel,"customer_text":req.text,"analysis":{},
            "intent":"","emotion":"calm","priority":"LOW",
            "questions":[],"answers":[],"negotiation_stage":"main","question_idx":0,
            "customer_turns":[req.text],"assistant_turns":[msg],"transcript_turns":[req.text],
        }
        return {"session_id":session_id,"is_greeting":True,"message":msg,"done":False}

    # Out of scope
    if is_out_of_scope(req.text):
        msg = get_out_of_scope()
        sessions[session_id] = {
            "channel":req.channel,"customer_text":req.text,"analysis":{},
            "intent":"","emotion":"calm","priority":"LOW",
            "questions":[],"answers":[],"negotiation_stage":"main","question_idx":0,
            "customer_turns":[req.text],"assistant_turns":[msg],"transcript_turns":[req.text],
        }
        return {"session_id":session_id,"is_greeting":True,"message":msg,"done":False}

    # Check if we have a pending gathering session (customer sent short message before)
    existing = sessions.get(session_id)

    if existing and existing.get("gathering"):
        # Customer sent more info after we asked — classify ONLY the new message
        # The first message was too vague, ignore it for classification
        analysis = analyze_text(req.text)
        intent   = analysis["intent"]
        emotion  = analysis["emotion"]
        # If STILL unclear, classify anyway — we already asked once
        flow     = get_flow(intent)
        session  = _new_session(req.channel, req.text, analysis, flow)
        session["customer_text"] = req.text
        priority = session["priority"]
    else:
        # Fresh start — classify the current message
        analysis = analyze_text(req.text)
        intent   = analysis["intent"]
        emotion  = analysis["emotion"]

        # Check if we have enough signal to classify
        if not _should_classify(req.text, analysis):
            # Not enough info — ask for more details (only ask once)
            msg = get_gathering()
            sessions[session_id] = {
                "channel":req.channel,"customer_text":req.text,"analysis":analysis,
                "intent":"","emotion":emotion,"priority":"LOW",
                "questions":[],"answers":[],"negotiation_stage":"main","question_idx":0,
                "customer_turns":[req.text],"assistant_turns":[msg],"transcript_turns":[req.text],
                "gathering": True,
            }
            return {"session_id":session_id,"is_greeting":True,"message":msg,"done":False}

        flow     = get_flow(intent)
        session  = _new_session(req.channel, req.text, analysis, flow)
        priority = session["priority"]
    has_q    = bool(flow and flow.questions)

    if has_q:
        msg = build_question(intent, 0, emotion)
    else:
        msg = get_confirm_question(intent)

    session["assistant_turns"].append(msg)
    sessions[session_id] = session

    return {
        "session_id":         session_id,
        "is_greeting":        False,
        "intent":             intent,
        "intent_confidence":  analysis["intent_confidence"],
        "intent_scores":      analysis["intent_scores"],
        "emotion":            emotion,
        "emotion_confidence": analysis["emotion_confidence"],
        "emotion_scores":     analysis["emotion_scores"],
        "priority":           priority,
        "emotion_boosted":    priority != (flow.priority if flow else "LOW"),
        "message":            msg,
        "question_idx":       0,
        "has_questions":      has_q,
        "done":               False,
    }

# ── POST /conversation/answer ──────────────────────────────────────────────────
@router.post("/answer")
async def process_answer(req: AnswerInput):
    session = sessions.get(req.session_id)
    if not session:
        return {"error":"session not found","done":True}

    flow    = get_flow(session["intent"])
    intent  = session["intent"]
    emotion = session["emotion"]

    # If customer is asking a question instead of answering — repeat current question
    if parse_yes_no(req.text) == "question":
        current_idx = req.question_idx
        msg = build_question(intent, current_idx, emotion)
        _record_turn(session, req.text, msg)
        return {
            "message":msg,"question_idx":current_idx,
            "answers":session.get("answers",[]),"ready_to_confirm":False,"done":False
        }

    session["answers"] = session.get("answers",[]) + [req.text]
    answers  = session["answers"]
    next_idx = req.question_idx + 1

    if flow and next_idx < len(flow.questions):
        msg = build_question(intent, next_idx, emotion)
        _record_turn(session, req.text, msg)
        return {
            "message":msg,"question_idx":next_idx,
            "answers":answers,"ready_to_confirm":False,"done":False
        }

    # All questions done — propose action
    msg = get_confirm_question(intent)
    _record_turn(session, req.text, msg)
    return {"message":msg,"ready_to_confirm":True,"answers":answers,"done":False}

# ── POST /conversation/confirm ─────────────────────────────────────────────────
@router.post("/confirm")
async def confirm_action(req: ConfirmInput):
    session = sessions.get(req.session_id)
    if not session:
        return {"error":"session not found","done":True}

    decision  = parse_yes_no(req.text)
    flow      = get_flow(session["intent"])
    neg_stage = session.get("negotiation_stage","main")

    if not flow:
        return await _finalize(req.session_id, session, req.text,
            decision_clear="no", msg=get_final_no(),
            status="open", actions=[], agent_note="حالة غير مصنفة")

    # Customer asked a question about the action
    if decision == "question":
        # Answer briefly then re-ask confirmation
        msg = get_confirm_question(session["intent"])
        _record_turn(session, req.text, msg)
        return {"done":False,"message":msg,"negotiation_round":"clarification"}

    # Unclear — ask for clearer answer
    if decision == "unclear":
        msg = get_unclear()
        _record_turn(session, req.text, msg)
        return {"done":False,"message":msg,"negotiation_round":"clarification"}

    # Main offer
    if neg_stage == "main":
        if decision == "yes":
            msg = get_yes_response(session["intent"])
            return await _finalize(req.session_id, session, req.text,
                decision_clear="yes", msg=msg,
                status="resolved", actions=flow.on_yes_action, agent_note="")
        else:
            session["negotiation_stage"] = "counter"
            msg = get_counter_offer(session["intent"])
            _record_turn(session, req.text, msg)
            return {"done":False,"message":msg,"negotiation_round":"counter_offer"}

    # Counter offer
    if decision == "yes":
        msg = get_counter_yes_response(session["intent"])
        return await _finalize(req.session_id, session, req.text,
            decision_clear="yes_counter", msg=msg,
            status="resolved", actions=flow.counter_offer_action, agent_note="")
    else:
        msg = get_final_no()
        return await _finalize(req.session_id, session, req.text,
            decision_clear="no", msg=msg,
            status="open", actions=[], agent_note=flow.agent_note)


async def _finalize(session_id, session, customer_text, decision_clear,
                    msg, status, actions, agent_note):
    flow    = get_flow(session["intent"])
    analysis= session["analysis"]

    _record_turn(session, customer_text, msg)

    full_transcript = " | ".join(
        t for pair in zip(
            session.get("customer_turns",[]),
            session.get("assistant_turns",[])+[""]
        ) for t in pair if t
    )

    ticket = f"TIS-{int(time.time())%1000000:06d}"
    record = {
        "ticket_number":      ticket,
        "created_at":         time.time(),
        "channel":            session.get("channel","voice"),
        "transcript":         full_transcript,
        "customer_text":      session.get("customer_text",""),
        "intent":             session.get("intent",""),
        "intent_confidence":  analysis.get("intent_confidence",0.0),
        "intent_scores":      analysis.get("intent_scores",{}),
        "emotion":            session.get("emotion",""),
        "emotion_confidence": analysis.get("emotion_confidence",0.0),
        "emotion_scores":     analysis.get("emotion_scores",{}),
        "priority":           session.get("priority","LOW"),
        "emotion_boosted":    False,
        "proposed_action":    flow.proposed_action if flow else "",
        "customer_decision":  decision_clear,
        "actions_taken":      actions,
        "status":             status,
        "agent_note":         agent_note,
        "audio_path":         session.get("audio_path"),
        "questions_asked":    flow.questions if flow else [],
        "answers_collected":  session.get("answers",[]),
    }

    save_call(record)
    await manager.broadcast({"type":"new_call","data":dict(record)})
    sessions.pop(session_id, None)

    return {
        "done":True,"message":msg,"status":status,
        "ticket_number":ticket,
        "actions_taken":[ACTION_AR.get(a,a) for a in actions],
        "negotiated":decision_clear=="yes_counter",
    }