"""
تسعة — Dashboard Router v2
============================
All dashboard data endpoints + PDF report generation.
"""

import os
import re
import time
from collections import Counter
from fastapi import APIRouter
from fastapi.responses import FileResponse, Response

from core.database import (
    get_today_stats, list_calls, get_call,
    get_intent_distribution, get_emotion_distribution,
    get_daily_counts, get_all_customer_texts,
)
from core.pdf_report import generate_call_report, generate_daily_report
from core.quality import compute_quality, generate_smart_summary

router = APIRouter()

STOPWORDS = {
    "من","في","على","إلى","عن","مع","هذا","هذه","ذلك","التي","الذي",
    "أن","إن","كان","كانت","يكون","وأن","لا","ما","لم","لن","هو","هي",
    "أنا","انت","أنت","نحن","هم","انا","ايش","وش","كيف","متى","ليش",
    "و","ف","ب","ل","ال","يا","او","أو","ثم","حتى","كل","بعض",
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


# ── PDF Reports ───────────────────────────────────────────────────────────────

@router.get("/calls/{ticket_number}/report")
async def call_pdf_report(ticket_number: str):
    """Download a branded PDF report for a single call."""
    call = get_call(ticket_number)
    if not call:
        return {"error": "not found"}
    try:
        pdf_bytes = generate_call_report(call)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="tis3a-{ticket_number}.pdf"',
                "Content-Length": str(len(pdf_bytes)),
            }
        )
    except Exception as e:
        return {"error": f"PDF generation failed: {e}"}


@router.get("/report/daily")
async def daily_pdf_report():
    """Download a branded daily summary PDF report."""
    calls = list_calls(limit=500)
    stats = get_today_stats()
    try:
        pdf_bytes = generate_daily_report(calls, stats)
        today = time.strftime("%Y-%m-%d")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="tis3a-daily-{today}.pdf"',
                "Content-Length": str(len(pdf_bytes)),
            }
        )
    except Exception as e:
        return {"error": f"PDF generation failed: {e}"}


@router.get("/calls/{ticket_number}/quality")
async def call_quality(ticket_number: str):
    """Compute AI quality metrics + smart summary for a call."""
    call = get_call(ticket_number)
    if not call:
        return {"error": "not found"}
    return {
        "quality": compute_quality(call),
        "summary": generate_smart_summary(call),
    }


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
        words = re.findall(r"[\u0600-\u06FF]+", text)
        for w in words:
            if len(w) >= 2 and w not in STOPWORDS:
                word_counts[w] += 1
    top = word_counts.most_common(limit)
    return {"words": [{"text": w, "value": c} for w, c in top]}
