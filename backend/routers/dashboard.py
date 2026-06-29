"""
تسعة — Dashboard Router
========================
Endpoints the employee dashboard reads from:
  GET /dashboard/stats           — 4 top stat boxes
  GET /dashboard/calls           — table data, paginated, filterable by status
  GET /dashboard/calls/{ticket}  — single call detail (for the audio/transcript view)
  GET /dashboard/analytics       — charts data (intent dist, emotion dist, daily counts)
  GET /dashboard/wordcloud       — word frequency for word cloud
"""

import os
import re
from collections import Counter
from fastapi import APIRouter
from fastapi.responses import FileResponse

from core.database import (
    get_today_stats, list_calls, get_call,
    get_intent_distribution, get_emotion_distribution, get_daily_counts,
    get_all_customer_texts,
)

router = APIRouter()


# ── Arabic stopwords — excluded from word cloud ────────────────────────────────
STOPWORDS = {
    "من", "في", "على", "إلى", "عن", "مع", "هذا", "هذه", "ذلك", "التي", "الذي",
    "أن", "إن", "كان", "كانت", "يكون", "وأن", "لا", "ما", "لم", "لن", "هو", "هي",
    "أنا", "انت", "أنت", "نحن", "هم", "انا", "ايش", "وش", "كيف", "متى", "ليش",
    "و", "ف", "ب", "ل", "ال", "يا", "او", "أو", "ثم", "حتى", "كل", "بعض",
}


@router.get("/stats")
async def dashboard_stats():
    return get_today_stats()


@router.get("/calls")
async def dashboard_calls(limit: int = 100, offset: int = 0, status: str = None):
    return {"calls": list_calls(limit=limit, offset=offset, status=status)}


@router.get("/calls/{ticket_number}")
async def dashboard_call_detail(ticket_number: str):
    call = get_call(ticket_number)
    if not call:
        return {"error": "not found"}
    return call


@router.get("/calls/{ticket_number}/audio")
async def dashboard_call_audio(ticket_number: str):
    call = get_call(ticket_number)
    if not call or not call.get("audio_path") or not os.path.exists(call["audio_path"]):
        return {"error": "audio not found"}
    return FileResponse(call["audio_path"])


@router.get("/analytics")
async def dashboard_analytics():
    return {
        "intent_distribution":  get_intent_distribution(),
        "emotion_distribution": get_emotion_distribution(),
        "daily_counts":         get_daily_counts(days=14),
    }


@router.get("/wordcloud")
async def dashboard_wordcloud(limit: int = 60):
    texts = get_all_customer_texts()
    word_counts: Counter = Counter()

    for text in texts:
        words = re.findall(r"[\u0600-\u06FF]+", text)  # Arabic unicode range only
        for w in words:
            if len(w) >= 2 and w not in STOPWORDS:
                word_counts[w] += 1

    top = word_counts.most_common(limit)
    return {"words": [{"text": w, "value": c} for w, c in top]}
