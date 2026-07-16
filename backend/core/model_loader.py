"""
تسعة — Model Loader
====================
Loads intent model, emotion model, and Whisper once at startup.
Supports both Linux (wakeb) and Mac (reem) paths automatically.
"""

import json
import os
import torch
import whisper
from transformers import AutoTokenizer, AutoModelForSequenceClassification

_intent_tokenizer  = None
_intent_model      = None
_intent_id2label   = None
_emotion_tokenizer = None
_emotion_model     = None
_emotion_id2label  = None
_whisper_model     = None

# ── Auto-detect machine and set paths ─────────────────────────────────────────
import platform, pathlib

_home = pathlib.Path.home()

# Mac (reem)
if platform.system() == "Darwin":
    INTENT_MODEL_DIR  = str(_home / "Desktop/TIS3A-main/models/intent_model")
    EMOTION_MODEL_DIR = str(_home / "Desktop/TIS3A-main/models/emotion_model")
    DEVICE            = torch.device("cpu")
    WHISPER_MODEL     = "base"   # faster on Intel Mac CPU
# Linux (wakeb)
else:
    INTENT_MODEL_DIR  = "/home/wakeb/Desktop/nine/models/intent_model"
    EMOTION_MODEL_DIR = "/home/wakeb/Desktop/nine/models/emotion_model"
    DEVICE            = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    WHISPER_MODEL     = "large-v3" if torch.cuda.is_available() else "base"

MAX_LEN = 128


def load_models():
    global _intent_tokenizer, _intent_model, _intent_id2label
    global _emotion_tokenizer, _emotion_model, _emotion_id2label
    global _whisper_model

    print(f"  Machine : {platform.system()} ({platform.node()})")
    print(f"  Device  : {DEVICE}")

    # Intent model
    if os.path.exists(INTENT_MODEL_DIR):
        print(f"  Loading intent model from {INTENT_MODEL_DIR} ...")
        _intent_tokenizer = AutoTokenizer.from_pretrained(INTENT_MODEL_DIR)
        _intent_model     = AutoModelForSequenceClassification.from_pretrained(INTENT_MODEL_DIR)
        _intent_model.to(DEVICE)
        _intent_model.eval()
        label_map_path = os.path.join(INTENT_MODEL_DIR, "label_map.json")
        if os.path.exists(label_map_path):
            with open(label_map_path, encoding="utf-8") as f:
                data = json.load(f)
            _intent_id2label = {int(k): v for k, v in data["id2label"].items()}
        print("  ✓ Intent model loaded")
    else:
        print(f"  ⚠ Intent model not found at {INTENT_MODEL_DIR}")

    # Emotion model
    if os.path.exists(EMOTION_MODEL_DIR):
        print(f"  Loading emotion model from {EMOTION_MODEL_DIR} ...")
        _emotion_tokenizer = AutoTokenizer.from_pretrained(EMOTION_MODEL_DIR)
        _emotion_model     = AutoModelForSequenceClassification.from_pretrained(EMOTION_MODEL_DIR)
        _emotion_model.to(DEVICE)
        _emotion_model.eval()
        label_map_path = os.path.join(EMOTION_MODEL_DIR, "label_map.json")
        if os.path.exists(label_map_path):
            with open(label_map_path, encoding="utf-8") as f:
                data = json.load(f)
            _emotion_id2label = {int(k): v for k, v in data["id2label"].items()}
        print("  ✓ Emotion model loaded")
    else:
        print(f"  ⚠ Emotion model not found at {EMOTION_MODEL_DIR}")

    # Whisper
    print(f"  Loading Whisper ({WHISPER_MODEL}) on {DEVICE} ...")
    _whisper_model = whisper.load_model(WHISPER_MODEL, device=str(DEVICE))
    print("  ✓ Whisper loaded")


def get_intent_model():
    return _intent_tokenizer, _intent_model, _intent_id2label

def get_emotion_model():
    return _emotion_tokenizer, _emotion_model, _emotion_id2label

def get_whisper():
    return _whisper_model

def get_device():
    return DEVICE

def get_max_len():
    return MAX_LEN
