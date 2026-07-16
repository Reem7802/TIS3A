"""
تسعة — Analyze Router
======================
POST /analyze — audio file -> transcript (used by the voice channel).
Converts audio to WAV before passing to Whisper for maximum compatibility.
"""

import os
import time
import uuid
import subprocess
from fastapi import APIRouter, UploadFile, File
from core.classifier import transcribe_audio

router = APIRouter()

BASE_DIR        = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECORDINGS_DIR  = os.path.join(BASE_DIR, "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)


def convert_to_wav(input_path: str) -> str:
    """Convert any audio format to WAV 16kHz mono for Whisper."""
    wav_path = input_path.rsplit(".", 1)[0] + "_converted.wav"
    try:
        result = subprocess.run([
            "ffmpeg", "-y", "-i", input_path,
            "-ar", "16000", "-ac", "1", "-f", "wav",
            wav_path
        ], capture_output=True, timeout=30)
        if result.returncode == 0 and os.path.exists(wav_path):
            return wav_path
    except Exception as e:
        print(f"  ffmpeg conversion failed: {e}")
    return input_path  # fallback to original


@router.post("")
async def analyze_audio(file: UploadFile = File(...)):
    # Detect real extension from content type
    content_type = file.content_type or ""
    if "ogg" in content_type:
        ext = ".ogg"
    elif "mp4" in content_type or "m4a" in content_type:
        ext = ".mp4"
    elif "wav" in content_type:
        ext = ".wav"
    else:
        ext = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"

    filename = f"{int(time.time())}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(RECORDINGS_DIR, filename)

    contents = await file.read()
    with open(filepath, "wb") as f:
        f.write(contents)

    print(f"  Audio received: {ext}, size: {len(contents)} bytes")

    # Convert to WAV for best Whisper compatibility
    wav_path = convert_to_wav(filepath)

    transcript = transcribe_audio(wav_path)
    print(f"  Transcript: {transcript[:60] if transcript else 'EMPTY'}")

    return {
        "transcript": transcript,
        "audio_path": filepath,
    }
