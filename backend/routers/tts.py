"""
تسعة — TTS Router
==================
POST /tts — Arabic text -> speech.
Priority: XTTS-v2 (self-hosted, cloned voice) -> ElevenLabs -> Edge TTS.
"""

import os
import io
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import edge_tts
import httpx

router = APIRouter()

ELEVENLABS_API_KEY  = os.environ.get("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "")
EDGE_VOICE          = "ar-SA-HamedNeural"

BASE_DIR        = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REFERENCE_VOICE = os.path.join(BASE_DIR, "voices", "reference_ar.wav")
XTTS_ENABLED    = os.environ.get("XTTS_ENABLED", "true").lower() == "true"

_xtts_model  = None
_xtts_failed = False


def _get_xtts():
    global _xtts_model, _xtts_failed
    if _xtts_failed or not XTTS_ENABLED:
        return None
    if _xtts_model is not None:
        return _xtts_model
    if not os.path.exists(REFERENCE_VOICE):
        print(f"  ⚠ XTTS reference voice not found at {REFERENCE_VOICE} — skipping XTTS")
        _xtts_failed = True
        return None
    try:
        import torch
        from TTS.api import TTS
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"  Loading XTTS-v2 on {device} (first call only)...")
        _xtts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
        print("  ✓ XTTS-v2 loaded")
        return _xtts_model
    except Exception as e:
        print(f"  ⚠ XTTS failed to load: {e}")
        _xtts_failed = True
        return None


class TTSRequest(BaseModel):
    text: str
    voice: str = ""


async def _xtts_tts(text: str):
    model = _get_xtts()
    if model is None:
        return None
    try:
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            model.tts_to_file(text=text, speaker_wav=REFERENCE_VOICE, language="ar", file_path=tmp.name)
            with open(tmp.name, "rb") as f:
                data = f.read()
            os.unlink(tmp.name)
            return data
    except Exception as e:
        print(f"  XTTS generation failed: {e}")
        return None


async def _elevenlabs_tts(text: str) -> bytes:
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
    headers = {"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"}
    payload = {
        "text": text, "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.3, "use_speaker_boost": True},
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        return resp.content


async def _edge_tts(text: str, voice: str) -> bytes:
    communicate = edge_tts.Communicate(text, voice or EDGE_VOICE)
    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    return buf.getvalue()


@router.post("")
async def text_to_speech(request: TTSRequest):
    text = request.text.strip()
    if not text:
        return {"error": "text is empty"}

    audio_bytes = await _xtts_tts(text)
    media_type  = "audio/wav"

    if audio_bytes is None and ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID:
        try:
            audio_bytes = await _elevenlabs_tts(text)
            media_type  = "audio/mpeg"
        except Exception as e:
            print(f"  ElevenLabs failed: {e}")
            audio_bytes = None

    if audio_bytes is None:
        audio_bytes = await _edge_tts(text, request.voice)
        media_type  = "audio/mpeg"

    return StreamingResponse(io.BytesIO(audio_bytes), media_type=media_type, headers={"Cache-Control": "no-cache"})
