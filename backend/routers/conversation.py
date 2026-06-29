"""
تسعة — Conversation Router
===========================
Multi-turn conversation state machine. Supports BOTH voice and text channels
(text mode for customers who can't speak).

Flow per call:
  1. POST /conversation/start   — first customer message -> greeting check -> classify -> first question
  2. POST /conversation/answer  — customer answers info-gathering questions, one at a time
  3. POST /conversation/confirm — customer says yes/no to the proposed action
       - yes -> action executes -> call saved as RESOLVED
       - no  -> call saved as OPEN (employee follow-up needed)

Every finished call (resolved or open) is saved to the database and
broadcast to the employee dashboard over WebSocket.
"""

import time
import json
from fastapi import APIRouter
from pydantic import BaseModel

from core.classifier import analyze_text
from core.flow_engine import (
    get_flow, apply_emotion_boost, get_emotion_ack, ACTION_AR,
)
from core.database import save_call
from .ws import manager

router = APIRouter()


# ── Greeting detection ──────────────────────────────────────────────────────────
GREETINGS = [
    "سلام", "السلام", "هلا", "مرحبا", "مرحباً", "هاي", "اهلين", "اهلاً", "اهلا",
    "صباح الخير", "مساء الخير", "صبح", "مسا", "كيفك", "كيف الحال", "هلو", "ألو", "الو",
    "نعم", "اه", "آه", "يو", "يا هلا", "وش", "ايش", "شلونك", "hi", "hello", "hey",
]

def is_greeting(text: str) -> bool:
    cleaned = text.strip().lower().replace("،", "").replace(".", "")
    words   = cleaned.split()
    if len(words) <= 3 and all(w in GREETINGS for w in words):
        return True
    if len(words) <= 2:
        return True
    return False


# ── Yes/No detection for confirmation step ──────────────────────────────────────
YES_WORDS = ["نعم", "اي", "إي", "ايه", "اوكي", "أوكي", "تمام", "موافق", "اكيد", "أكيد", "يلا", "خلاص", "اه", "yes", "ok"]
NO_WORDS  = ["لا", "لأ", "ابد", "أبد", "مو", "ماهو", "ما هو", "خلاص لا", "no", "نوب"]

def parse_yes_no(text: str) -> str:
    """Returns 'yes', 'no', or 'unclear'."""
    cleaned = text.strip().lower().replace("،", "").replace(".", "")
    words   = set(cleaned.split())
    if words & set(YES_WORDS):
        return "yes"
    if words & set(NO_WORDS):
        return "no"
    # fallback substring check for short replies
    if any(w in cleaned for w in YES_WORDS):
        return "yes"
    if any(w in cleaned for w in NO_WORDS):
        return "no"
    return "unclear"


# ── Schemas ───────────────────────────────────────────────────────────────────

class StartInput(BaseModel):
    text:       str
    session_id: str = ""
    channel:    str = "voice"   # 'voice' or 'text'

class AnswerInput(BaseModel):
    text:         str
    session_id:   str
    question_idx: int
    answers:      list[str]

class ConfirmInput(BaseModel):
    text:       str   # customer's yes/no reply (raw)
    session_id: str


# ── In-memory session store (per active call, until it resolves) ──────────────
sessions: dict[str, dict] = {}


# ── POST /conversation/start ────────────────────────────────────────────────────

@router.post("/start")
async def start_conversation(req: StartInput):
    if is_greeting(req.text):
        return {
            "session_id":  req.session_id or str(int(time.time() * 1000)),
            "is_greeting": True,
            "message":     "أهلاً وسهلاً! كيف أقدر أساعدك اليوم؟",
            "done":        False,
        }

    analysis = analyze_text(req.text)
    intent   = analysis["intent"]
    emotion  = analysis["emotion"]
    flow     = get_flow(intent)

    session_id = req.session_id or str(int(time.time() * 1000))

    if not flow:
        sessions[session_id] = {
            "channel": req.channel, "transcript_turns": [req.text],
            "customer_text": req.text, "analysis": analysis,
            "intent": intent, "emotion": emotion, "priority": "LOW",
            "questions": [], "answers": [],
        }
        return {
            "session_id": session_id,
            "is_greeting": False,
            "message":    "ممكن توضح لي مشكلتك أكثر؟",
            "done":       False,
        }

    boosted_priority = apply_emotion_boost(flow.priority, emotion)
    ack = get_emotion_ack(emotion)

    sessions[session_id] = {
        "channel":          req.channel,
        "transcript_turns": [req.text],
        "customer_text":    req.text,
        "analysis":         analysis,
        "intent":           intent,
        "emotion":          emotion,
        "priority":         boosted_priority,
        "questions":        flow.questions,
        "answers":          [],
        "question_idx":     0,
    }

    first_question = flow.questions[0] if flow.questions else flow.confirm_question
    message = f"{ack} {first_question}".strip() if ack else first_question

    return {
        "session_id":      session_id,
        "is_greeting":     False,
        "intent":          intent,
        "emotion":         emotion,
        "priority":        boosted_priority,
        "emotion_boosted": boosted_priority != flow.priority,
        "message":         message,
        "question_idx":    0,
        "has_questions":   len(flow.questions) > 0,
        "done":            False,
    }


# ── POST /conversation/answer ────────────────────────────────────────────────────

@router.post("/answer")
async def process_answer(req: AnswerInput):
    session = sessions.get(req.session_id)
    if not session:
        return {"error": "session not found", "done": True}

    session["transcript_turns"].append(req.text)
    answers  = req.answers + [req.text]
    next_idx = req.question_idx + 1
    flow     = get_flow(session["intent"])

    session["answers"] = answers

    if flow and next_idx < len(flow.questions):
        return {
            "message":      flow.questions[next_idx],
            "question_idx": next_idx,
            "answers":      answers,
            "ready_to_confirm": False,
            "done":         False,
        }

    # All info-gathering questions answered -> move to confirmation
    confirm_q = flow.confirm_question if flow else "تبي أسجل شكواك؟"
    return {
        "message":          confirm_q,
        "ready_to_confirm": True,
        "answers":          answers,
        "done":             False,
    }


# ── POST /conversation/confirm ───────────────────────────────────────────────────

@router.post("/confirm")
async def confirm_action(req: ConfirmInput):
    session = sessions.get(req.session_id)
    if not session:
        return {"error": "session not found", "done": True}

    session["transcript_turns"].append(req.text)
    decision = parse_yes_no(req.text)

    flow = get_flow(session["intent"])
    if not flow:
        decision_clear = "no"
    else:
        decision_clear = decision if decision != "unclear" else "no"

    ticket_number = f"TIS-{int(time.time()) % 1000000:06d}"
    full_transcript = " | ".join(session["transcript_turns"])

    if decision_clear == "yes" and flow:
        message      = flow.on_yes_message
        status       = "resolved"
        actions      = flow.on_yes_action
        agent_note   = ""
    elif flow:
        message      = flow.on_no_message
        status       = "open"
        actions      = []
        agent_note   = flow.agent_note
    else:
        message      = "تم تسجيل ملاحظتك. سيتواصل معك فريقنا قريباً."
        status       = "open"
        actions      = []
        agent_note   = "حالة غير مصنفة — تحتاج مراجعة يدوية"

    record = {
        "ticket_number":      ticket_number,
        "created_at":         time.time(),
        "channel":            session.get("channel", "voice"),
        "transcript":         full_transcript,
        "customer_text":      session.get("customer_text", ""),
        "intent":             session.get("intent", ""),
        "intent_confidence":  session["analysis"].get("intent_confidence", 0.0),
        "intent_scores":      session["analysis"].get("intent_scores", {}),
        "emotion":            session.get("emotion", ""),
        "emotion_confidence": session["analysis"].get("emotion_confidence", 0.0),
        "emotion_scores":     session["analysis"].get("emotion_scores", {}),
        "priority":           session.get("priority", "LOW"),
        "emotion_boosted":    False,
        "proposed_action":    flow.proposed_action if flow else "",
        "customer_decision":  decision_clear,
        "actions_taken":      actions,
        "status":             status,
        "agent_note":         agent_note,
        "audio_path":         session.get("audio_path"),
        "questions_asked":    flow.questions if flow else [],
        "answers_collected":  session.get("answers", []),
    }

    save_call(record)

    # Broadcast to employee dashboard
    record_for_broadcast = dict(record)
    await manager.broadcast({"type": "new_call", "data": record_for_broadcast})

    # Clean up session
    sessions.pop(req.session_id, None)

    return {
        "done":           True,
        "message":        message,
        "status":         status,
        "ticket_number":  ticket_number,
        "actions_taken":  [ACTION_AR.get(a, a) for a in actions],
    }
