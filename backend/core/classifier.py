"""
تسعة — Classifier
==================
Core inference: text -> intent + emotion scores.
Also handles Whisper transcription.
"""

import torch
import torch.nn.functional as F
from core.model_loader import (
    get_intent_model, get_emotion_model, get_whisper,
    get_device, get_max_len,
)


def _predict(text: str, tokenizer, model, id2label: dict) -> dict:
    device  = get_device()
    max_len = get_max_len()

    inputs = tokenizer(
        text, return_tensors="pt", truncation=True,
        padding=True, max_length=max_len,
    ).to(device)

    with torch.no_grad():
        outputs = model(**inputs)
        probs   = F.softmax(outputs.logits, dim=-1)[0]

    scores = {id2label[i]: float(probs[i]) for i in range(len(probs))}
    top_label = max(scores, key=scores.get)

    return {
        "label":      top_label,
        "confidence": scores[top_label],
        "scores":     scores,
    }


def classify_intent(text: str) -> dict:
    tokenizer, model, id2label = get_intent_model()
    if model is None:
        return {"label": "", "confidence": 0.0, "scores": {}}
    return _predict(text, tokenizer, model, id2label)


def classify_emotion(text: str) -> dict:
    tokenizer, model, id2label = get_emotion_model()
    if model is None:
        return {"label": "calm", "confidence": 0.0, "scores": {}}
    return _predict(text, tokenizer, model, id2label)


def transcribe_audio(file_path: str, language: str = "ar") -> str:
    model = get_whisper()
    result = model.transcribe(file_path, language=language, task="transcribe", fp16=False)
    return result.get("text", "").strip()


def analyze_text(text: str) -> dict:
    """Combined intent + emotion analysis for a piece of text."""
    intent_result  = classify_intent(text)
    emotion_result = classify_emotion(text)
    return {
        "transcript":         text,
        "intent":             intent_result["label"],
        "intent_confidence":  intent_result["confidence"],
        "intent_scores":      intent_result["scores"],
        "emotion":            emotion_result["label"],
        "emotion_confidence": emotion_result["confidence"],
        "emotion_scores":     emotion_result["scores"],
    }
