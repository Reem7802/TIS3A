"""
تسعة — WebSocket Router
========================
Broadcasts finished calls to the employee dashboard in real time.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import asyncio

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        print(f"  Dashboard connected — total: {len(self.active)}")

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)
        print(f"  Dashboard disconnected — total: {len(self.active)}")

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(json.dumps(data, ensure_ascii=False))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


@router.websocket("/dashboard")
async def dashboard_ws(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            await asyncio.sleep(20)
            try:
                await ws.send_text(json.dumps({"type": "ping"}))
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(ws)


@router.post("/test")
async def test_broadcast():
    fake = {
        "type": "new_call",
        "data": {
            "ticket_number": "TIS-TEST01",
            "created_at": __import__("time").time(),
            "channel": "voice",
            "transcript": "بطاقتي ضاعت | مفقودة | اليوم الصباح | نعم",
            "customer_text": "بطاقتي ضاعت",
            "intent": "lost_card",
            "intent_confidence": 0.97,
            "intent_scores": {"lost_card": 0.97, "fraud": 0.02},
            "emotion": "panic",
            "emotion_confidence": 0.84,
            "emotion_scores": {"panic": 0.84, "worried": 0.1},
            "priority": "CRITICAL",
            "emotion_boosted": True,
            "proposed_action": "block_card",
            "customer_decision": "yes",
            "actions_taken": ["block_card_temporarily", "create_lost_card_report"],
            "status": "resolved",
            "agent_note": "",
            "audio_path": None,
            "questions_asked": ["هل البطاقة مفقودة أم مسروقة؟", "متى آخر مرة استخدمتها؟"],
            "answers_collected": ["مفقودة", "اليوم الصباح"],
        }
    }
    await manager.broadcast(fake)
    return {"ok": True, "connections": len(manager.active)}
