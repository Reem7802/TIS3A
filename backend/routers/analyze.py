"""
تسعة — Analyze Router
======================
POST /analyze — audio file -> transcript (used by the voice channel).
"""

import os
import time
import uuid
from fastapi import APIRouter, UploadFile, File
from core.classifier import transcribe_audio

router = APIRouter()

BASE_DIR        = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECORDINGS_DIR  = os.path.join(BASE_DIR, "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)


@router.post("")
async def analyze_audio(file: UploadFile = File(...)):
    ext      = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    filename = f"{int(time.time())}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(RECORDINGS_DIR, filename)

    contents = await file.read()
    with open(filepath, "wb") as f:
        f.write(contents)

    transcript = transcribe_audio(filepath)

    return {
        "transcript": transcript,
        "audio_path": filepath,
    }
