# تسعة · Tis3a
### AI-Powered Banking Voice & Text Assistant | مصرف الإنماء

<p align="center">
  <img src="https://img.shields.io/badge/Intent_Accuracy-99.58%25_F1-3B82F6?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Emotion_Detection-89.56%25_F1-8B5CF6?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Avg_Resolution-90_seconds-22C55E?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Cost_Per_Call-0_SAR-B85042?style=for-the-badge" />
</p>

---

## What is Tis3a?

Tis3a (تسعة) is an AI banking assistant that handles customer complaints in **Saudi Arabic dialect** — voice or text — classifies the problem, negotiates a solution, and sends the full analysis to the agent dashboard in real time.

**The problem it solves:** Saudi banking call centers spend millions annually on agents handling routine issues. Existing chatbots fail because they don't understand Saudi dialect. Tis3a is the third option — no human agent, no wait time, 90 seconds to resolution.

---

## Key Features

- **Saudi dialect understanding** — fine-tuned MARBERT models trained on real Saudi banking complaints
- **Dual AI classification** — intent (8 classes) + emotion (6 states) running simultaneously
- **Smart negotiation** — if customer declines, AI offers a counter-offer before escalating
- **Emotion-driven priority** — panic auto-escalates to CRITICAL, angry/worried boost priority
- **Real-time agent dashboard** — WebSocket push, 6 live charts, Twin View, Smart Summary, AI Quality Score
- **PDF reports** — per-call and daily summary, instant download
- **100% local** — no external API, no cost per call, no data leaves the bank

---

## Model Performance

| Model | Task | F1 Score | Classes | Training Examples |
|---|---|---|---|---|
| MARBERT Intent | Banking intent classification | **99.58%** | 8 | 1,200 |
| MARBERT Emotion | Emotional state detection | **89.56%** | 6 | 720 |

### Intent Classes
`fraud` · `lost_card` · `duplicate_transaction` · `suspicious_activity` · `account_blocked` · `wrong_transfer` · `card_not_working` · `atm_issue`

### Emotion Classes
`panic` · `angry` · `worried` · `frustrated` · `confused` · `calm`

---

## Tech Stack

```
AI Models       MARBERT (UBC-NLP) — fine-tuned × 2
                Whisper (OpenAI) — Saudi dialect STT
                Edge TTS — Arabic voice output

Backend         FastAPI + Uvicorn
                PyTorch (CUDA on Linux, CPU on Mac)
                SQLite + WebSocket
                ReportLab — PDF generation

Frontend        Next.js 14 + TypeScript
                RTL Arabic layout
                SVG charts (no external chart library)
```

---

## Project Structure

```
TIS3A/
├── backend/
│   ├── main.py
│   ├── core/
│   │   ├── classifier.py       # Whisper + MARBERT inference
│   │   ├── database.py         # SQLite CRUD + analytics
│   │   ├── flow_engine.py      # Per-intent conversation policy
│   │   ├── model_loader.py     # Auto-detect Mac/Linux paths
│   │   ├── responses.py        # Fixed Saudi dialect response library
│   │   ├── quality.py          # AI quality evaluator + smart summary
│   │   └── pdf_report.py       # Per-call and daily PDF reports
│   └── routers/
│       ├── analyze.py          # POST /analyze — audio → transcript
│       ├── conversation.py     # Multi-turn conversation state machine
│       ├── dashboard.py        # GET /dashboard/* + PDF endpoints
│       ├── tts.py              # POST /tts
│       └── ws.py               # WebSocket broadcast
├── frontend/
│   ├── pages/
│   │   ├── index.tsx           # Customer chat/voice interface
│   │   └── agent.tsx           # Agent dashboard (all-in-one)
│   └── utils/
│       └── tts.ts              # TTS playback utility
└── models/
    ├── intent_model/           # Fine-tuned MARBERT (not in repo — too large)
    └── emotion_model/          # Fine-tuned MARBERT (not in repo — too large)
```

---

## Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- ffmpeg (`brew install ffmpeg` on Mac / `apt install ffmpeg` on Linux)
- GPU recommended for production (CUDA); Mac CPU works for demo

### Backend

```bash
cd backend
python3 -m venv ../venv
source ../venv/bin/activate

pip install fastapi==0.111.0 uvicorn==0.29.0 python-multipart==0.0.9 \
    transformers==4.40.0 "torch==2.2.2" pydantic==2.7.0 \
    "numpy==1.23.5" pandas==2.2.2 scikit-learn==1.4.2 \
    edge-tts httpx orjson reportlab arabic-reshaper python-bidi

pip install openai-whisper --no-deps
pip install more-itertools tqdm tiktoken regex numba==0.56.4 llvmlite==0.39.1

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install

# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
echo "NEXT_PUBLIC_WS_URL=ws://localhost:8000" >> .env.local

npm run dev -- --hostname 0.0.0.0
```

### Open in browser
- **Customer interface:** `http://localhost:3000`
- **Agent dashboard:** `http://localhost:3000/agent`

---

## Model Paths

The models are not included in the repo due to size. Place them at:

| Machine | Intent Model | Emotion Model |
|---|---|---|
| Mac (reem) | `~/Desktop/TIS3A-main/models/intent_model` | `~/Desktop/TIS3A-main/models/emotion_model` |
| Linux (wakeb) | `/home/wakeb/Desktop/nine/models/intent_model` | `/home/wakeb/Desktop/nine/models/emotion_model` |

`model_loader.py` auto-detects the machine via `platform.system()`.

Each model directory must contain:
```
intent_model/
├── config.json
├── pytorch_model.bin   (or model.safetensors)
├── tokenizer_config.json
├── vocab.txt
└── label_map.json      # {"id2label": {"0": "fraud", ...}}
```

---

## Conversation Flow

```
Customer message
      ↓
is_greeting? → greet and wait
is_out_of_scope? → redirect to sales
too_short + low_confidence? → ask for more info (gathering phase)
      ↓
MARBERT classifies intent + emotion
Emotion boosts priority (panic +2, angry/worried +1)
      ↓
/conversation/start → first question
/conversation/answer × N → collect answers
/conversation/confirm:
    YES → execute action → RESOLVED
    NO  → counter-offer
        YES → execute counter action → RESOLVED
        NO  → mark OPEN → escalate to agent
      ↓
Save to SQLite → WebSocket broadcast → Agent dashboard
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/analyze` | Audio file → transcript |
| POST | `/conversation/start` | Start conversation, classify first message |
| POST | `/conversation/answer` | Submit answer to question |
| POST | `/conversation/confirm` | Customer yes/no/question on proposed action |
| POST | `/tts` | Text → audio stream |
| GET | `/dashboard/calls` | List all calls |
| GET | `/dashboard/stats` | Today's statistics |
| GET | `/dashboard/calls/{ticket}/quality` | AI quality evaluation + smart summary |
| GET | `/dashboard/calls/{ticket}/report` | PDF report for one call |
| GET | `/dashboard/report/daily` | Daily summary PDF |
| WS | `/ws/dashboard` | Real-time call broadcast |

---

## Data Pipeline

Training data was generated synthetically in 4 augmentation stages:

1. **Phrasing variation** — same meaning expressed multiple ways
2. **Dialect vocabulary** — regional word substitutions (Najdi, Hijazi, Southern)
3. **Natural filler injection** — conversational padding real customers use
4. **STT error simulation** — misspellings and informal writing Whisper might produce

Split: **85% training / 15% evaluation** — strict separation, zero leakage.

---

## Voice on Mobile

Voice mode requires HTTPS. For demo on iPhone:

```bash
# Install ngrok
brew install ngrok/ngrok/ngrok
ngrok config add-authtoken YOUR_TOKEN
ngrok http 3000
```

Open the `https://xxx.ngrok-free.app` URL on iPhone Safari.

---

## Team

**ريم العمري — Reem Alomari**
AI/Computer Vision Engineer & Researcher — Wakeb

---

## License

This project was developed as part of a hackathon for مصرف الإنماء (Inma Bank).
All banking actions are simulated — no real bank API integration.
