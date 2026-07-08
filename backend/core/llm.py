"""
تسعة — LLM Response Generator v4
===================================
Key fixes:
1. Explicitly tells Qwen what its last response was → prevents repetition
2. Per-intent specific fallbacks → even if Qwen fails, response is correct
3. Higher temperature for more variety + presence_penalty equivalent via repeat_penalty
4. Cleaner prompt structure with clearer instructions
"""

import httpx

OLLAMA_URL   = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen3:8b"

SYSTEM_PROMPT = """أنت "تسعة"، موظف خدمة عملاء في مصرف الإنماء السعودي.
تتحدث بالعامية السعودية فقط.

قواعد لا تُكسر:
1. رد واحد قصير — جملة أو جملتان فقط، لا أكثر
2. سؤال واحد فقط في كل رد
3. لا تكرر أي جملة قلتها سابقاً — تحقق من المحادثة السابقة
4. اذكر المشكلة بالاسم في ردك — لا تقل "المشكلة" فقط
5. لا تبدأ ردك بـ "فهمت" أو "حسناً" أو "بالتأكيد"
6. إذا السؤال خارج نطاق خدمتك قل: "هذا لقسم المبيعات، أنا للمشاكل الطارئة — وش المشكلة؟"
7. لا تكتب أفكارك الداخلية — فقط الرد المباشر للعميل"""


# ── Per-intent specific responses (used when Qwen is unclear) ─────────────────
INTENT_QUESTIONS = {
    "fraud": [
        "وش نوع العملية المشبوهة اللي شفتها؟",
        "كم المبلغ اللي انخصم بدون إذنك؟",
        "هل البطاقة لا زالت معك الحين؟",
    ],
    "lost_card": [
        "البطاقة مفقودة ولا مسروقة؟",
        "متى آخر مرة استخدمتها؟",
    ],
    "suspicious_activity": [
        "وش نوع النشاط المشبوه اللي لاحظته؟",
        "وصلك رمز تحقق ما طلبته؟",
    ],
    "account_blocked": [
        "ظهرت لك رسالة خطأ معينة؟",
        "حاولت تدخل أكثر من مرة؟",
    ],
    "wrong_transfer": [
        "كم المبلغ اللي حولته؟",
        "التحويل لنفس البنك ولا بنك ثاني؟",
    ],
    "duplicate_transaction": [
        "وقت العملية المكررة متى كان؟",
        "العملية من متجر ولا تحويل؟",
    ],
    "atm_issue": [
        "وين موقع جهاز الصراف؟",
        "انخصم المبلغ من حسابك؟",
    ],
    "card_not_working": [
        "المشكلة في السحب ولا الدفع؟",
        "جربت البطاقة في جهاز ثاني؟",
    ],
}

INTENT_CONFIRM = {
    "fraud":                "شفت عمليات مشبوهة على بطاقتك — أوقف البطاقة الحين وأفتح بلاغ احتيال. تبي؟",
    "lost_card":            "أوقف بطاقتك احترازياً وأسجل بلاغ الفقدان. تبي أوقفها الحين؟",
    "suspicious_activity":  "أأمن حسابك وأغير كلمة المرور فوراً. تبي؟",
    "account_blocked":      "أرسل لك رمز تحقق الحين لفتح حسابك. تبي أرسله؟",
    "wrong_transfer":       "أفتح طلب اعتراض على التحويل الخاطئ. تبي أفتحه؟",
    "duplicate_transaction":"أفتح شكوى للخصم المكرر هذا. تبي؟",
    "atm_issue":            "أفتح بلاغ لجهاز الصراف ونتابع المبلغ. تبي؟",
    "card_not_working":     "أطلب لك بطاقة بديلة. تبي؟",
}

INTENT_COUNTER = {
    "fraud":                "تبي أجمد البطاقة 24 ساعة بس لحد نتحقق؟",
    "lost_card":            "تبي أحدد حد سحب يومي 200 ريال بدل الإيقاف الكامل؟",
    "suspicious_activity":  "تبي على الأقل نفعل تنبيهات أي دخول جديد للحساب؟",
    "account_blocked":      "تبي أحجز لك موعد في أقرب فرع؟",
    "wrong_transfer":       "تبي أتواصل مع البنك الثاني ودياً قبل الاعتراض الرسمي؟",
    "duplicate_transaction":"تبي أراجع السجلات وأرسل لك تأكيد كتابي بدون شكوى رسمية؟",
    "atm_issue":            "تبي أرسل لك رابط لتعبئة البلاغ بنفسك مع صورة الإيصال؟",
    "card_not_working":     "تبي نجرب نعيد تفعيل البطاقة عن بعد أول؟",
}


async def generate_response(
    intent: str,
    intent_confidence: float,
    emotion: str,
    emotion_confidence: float,
    priority: str,
    stage: str,
    conversation_history: list[dict],
    current_message: str,
    extra_context: str = "",
    timeout: float = 20.0,
) -> str:

    intent_map = {
        "fraud": "احتيال مالي",
        "lost_card": "فقدان البطاقة",
        "duplicate_transaction": "خصم مكرر",
        "suspicious_activity": "نشاط مشبوه",
        "account_blocked": "حساب موقوف",
        "wrong_transfer": "تحويل خاطئ",
        "card_not_working": "بطاقة لا تعمل",
        "atm_issue": "مشكلة صراف آلي",
    }
    emotion_tone = {
        "panic":      "العميل في هلع — ابدأ بتطمينه أولاً",
        "angry":      "العميل غاضب — تعاطف سريع ثم الحل",
        "worried":    "العميل قلق — طمنه وثم اسأله",
        "frustrated": "العميل محبط — لا تطول، اسأله مباشرة",
        "confused":   "العميل مرتبك — اشرح بوضوح",
        "calm":       "العميل هادئ — مهني ومباشر",
    }

    # Build history text + extract last AI response to prevent repetition
    history_text = ""
    last_ai_response = ""
    for t in conversation_history[-6:]:
        role = "العميل" if t["role"] == "customer" else "تسعة"
        history_text += f"{role}: {t['text']}\n"
        if t["role"] == "assistant":
            last_ai_response = t["text"]

    # Anti-repetition instruction
    anti_repeat = ""
    if last_ai_response:
        anti_repeat = f'\n⚠️ لا تكرر هذه الجملة أو ما يشابهها: "{last_ai_response[:60]}"'

    # Stage-specific instruction
    stage_instructions = {
        "greeting":     "رحب بالعميل واسأله عن مشكلته — جملة واحدة",
        "questions":    f"اسأل العميل هذا السؤال بأسلوب طبيعي: {extra_context}",
        "confirm":      f"قل للعميل بالضبط ماذا ستفعل واسأله إذا يوافق: {extra_context}",
        "counter_offer":f"العميل رفض — اعرض البديل الأخف: {extra_context}",
        "final_no":     "العميل رفض كل الحلول — اشكره وأخبره موظف سيتصل به اليوم",
    }

    prompt = f"""[سياق داخلي]
المشكلة: {intent_map.get(intent, 'غير محددة')} | ثقة: {intent_confidence*100:.0f}%
العاطفة: {emotion} — {emotion_tone.get(emotion, '')}
المطلوب: {stage_instructions.get(stage, extra_context)}{anti_repeat}

[المحادثة]
{history_text or 'بداية المحادثة'}
العميل: {current_message}
تسعة:"""

    payload = {
        "model":  OLLAMA_MODEL,
        "prompt": prompt,
        "system": SYSTEM_PROMPT,
        "stream": False,
        "options": {
            "temperature":    0.75,
            "top_p":          0.92,
            "repeat_penalty": 1.4,    # penalizes repeating tokens from history
            "num_predict":    90,
            "stop":           ["العميل:", "تسعة:", "\n\n", "[سياق", "⚠️"],
            "think":          False,
        }
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(OLLAMA_URL, json=payload)
            resp.raise_for_status()
            data = resp.json()
            text = data.get("response", "").strip()

            # Clean leakage
            for prefix in ["تسعة:", "العميل:", "<think>", "</think>", "[سياق", "⚠️"]:
                if text.startswith(prefix):
                    text = text[len(prefix):].strip()

            text = text.split("\n\n")[0].strip()
            lines = [l.strip() for l in text.split("\n") if l.strip()]
            text = " ".join(lines[:2])

            # If response is too short or clearly wrong, use smart fallback
            if len(text) < 10:
                return _smart_fallback(stage, emotion, intent,
                                       len(conversation_history))

            # If response repeats the last AI response almost exactly
            if last_ai_response and text.strip()[:40] == last_ai_response.strip()[:40]:
                return _smart_fallback(stage, emotion, intent,
                                       len(conversation_history))

            return text

    except Exception as e:
        print(f"  ⚠ Ollama error: {e}")
        return _smart_fallback(stage, emotion, intent, len(conversation_history))


def _smart_fallback(stage: str, emotion: str, intent: str, turn: int = 0) -> str:
    """
    Specific, correct fallback for every stage and intent.
    Never returns the same generic sentence.
    """
    # Emotional opening
    emo_open = {
        "panic": "لا تقلق، أنا معك. ",
        "angry": "أتفهم انزعاجك. ",
        "worried": "ما عليك، ",
    }.get(emotion, "")

    if stage == "greeting":
        return "أهلاً! وش المشكلة اللي تواجهها اليوم؟"

    if stage == "questions":
        questions = INTENT_QUESTIONS.get(intent, ["وش اللي صار بالتحديد؟"])
        idx = min(max(turn // 2, 0), len(questions) - 1)
        return emo_open + questions[idx]

    if stage == "confirm":
        return emo_open + INTENT_CONFIRM.get(intent, "تبي أكمل في هذا الإجراء؟")

    if stage == "counter_offer":
        return INTENT_COUNTER.get(intent, "عندي خيار ثاني أخف، تبي تسمعه؟")

    if stage == "final_no":
        return "تمام، سجلت طلبك وبيتواصل معك أخصائي متخصص اليوم. مع السلامة."

    return emo_open + "خبرني أكثر عن المشكلة."