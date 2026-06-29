"""
تسعة — FastAPI Backend
=======================
Run:
    cd backend
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from routers import analyze, tts, ws, conversation, dashboard
from core.model_loader import load_models
from core.database import init_db

app = FastAPI(
    title="تسعة API",
    description="Saudi banking voice/text assistant with customer-confirmed actions",
    version="3.0.0",
    default_response_class=ORJSONResponse,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    print("\n=== تسعة — Starting up ===")
    init_db()
    print("  ✓ Database ready")
    load_models()
    print("=== Ready ===\n")


app.include_router(analyze.router,      prefix="/analyze",      tags=["analyze"])
app.include_router(tts.router,          prefix="/tts",          tags=["tts"])
app.include_router(ws.router,           prefix="/ws",           tags=["ws"])
app.include_router(conversation.router, prefix="/conversation", tags=["conversation"])
app.include_router(dashboard.router,    prefix="/dashboard",    tags=["dashboard"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "تسعة"}
