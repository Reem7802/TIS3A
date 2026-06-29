"""
تسعة — Flow Engine
===================
Defines per-intent conversation flows:
  - questions to ask
  - the proposed action (must be confirmed by the CUSTOMER before executing)
  - resolution text for both "yes" and "no" branches
  - emotion-based priority adjustments

Core idea: the AI talks to the customer directly (voice or text).
When it reaches a consequential action (block card, escalate, etc.),
it asks the CUSTOMER "do you want me to do this?" — not an employee.

  - If customer says YES  -> action executes -> call marked RESOLVED
  - If customer says NO   -> ticket created   -> call marked OPEN (needs employee follow-up)
"""

from dataclasses import dataclass, field
from typing import List, Optional


CRITICAL = "CRITICAL"
HIGH     = "HIGH"
MEDIUM   = "MEDIUM"
LOW      = "LOW"

PRIORITY_LEVELS = [LOW, MEDIUM, HIGH, CRITICAL]


@dataclass
class IntentFlow:
    intent:            str
    priority:          str
    questions:         List[str]   # info-gathering questions, asked first
    proposed_action:   str         # short label e.g. "block_card"
    confirm_question:  str         # the yes/no question asked to the customer
    on_yes_action:     List[str]   # auto-actions executed if customer says yes
    on_yes_message:    str         # what the AI says after a "yes"
    on_no_message:     str         # what the AI says after a "no" (case stays open)
    agent_note:        str         # note shown to employee if case stays open


FLOWS: dict[str, IntentFlow] = {

    "fraud": IntentFlow(
        intent           = "fraud",
        priority         = CRITICAL,
        questions = [
            "هل لاحظت أي عمليات مشبوهة على حسابك؟",
            "ما هو المبلغ التقريبي للعملية المشبوهة؟",
            "هل البطاقة لا تزال بحوزتك الآن؟",
        ],
        proposed_action  = "block_card",
        confirm_question = "بناءً على ما وصفته، أفضل إجراء هو إيقاف بطاقتك فوراً لحمايتك. تبي أوقف البطاقة الآن؟",
        on_yes_action    = ["block_card_immediately", "create_fraud_report"],
        on_yes_message   = "تم. أوقفت بطاقتك وفتحت بلاغ احتيال. بطاقة بديلة بتوصلك خلال 3-5 أيام عمل.",
        on_no_message    = "تمام، ما بوقف البطاقة. بسجل طلبك وبيتواصل معك أخصائي قريباً لمراجعة الحالة.",
        agent_note       = "⚠️ عميل اشتبه باحتيال ورفض إيقاف البطاقة — يحتاج تواصل فوري",
    ),

    "lost_card": IntentFlow(
        intent           = "lost_card",
        priority         = HIGH,
        questions = [
            "هل البطاقة مفقودة أم مسروقة؟",
            "متى آخر مرة استخدمتها؟",
        ],
        proposed_action  = "block_card",
        confirm_question = "أفضل شي إنه نوقف بطاقتك احترازياً لحد ما تطلب بديلة. تبي أوقفها الحين؟",
        on_yes_action    = ["block_card_temporarily", "create_lost_card_report"],
        on_yes_message   = "تم إيقاف البطاقة. بطاقة بديلة بتوصلك خلال 3-5 أيام عمل.",
        on_no_message    = "تمام، ما بوقف البطاقة الحين. بسجل بلاغ الفقدان وبيتواصل معك فريقنا للمتابعة.",
        agent_note       = "بلاغ فقدان بطاقة — العميل رفض الإيقاف الفوري — يحتاج متابعة",
    ),

    "suspicious_activity": IntentFlow(
        intent           = "suspicious_activity",
        priority         = HIGH,
        questions = [
            "ما نوع النشاط المشبوه الذي لاحظته؟",
            "هل وصلك رمز تحقق لم تطلبه؟",
        ],
        proposed_action  = "secure_account",
        confirm_question = "أنصح بتأمين حسابك مؤقتاً لحد ما نتحقق من الموضوع. تبي أأمن الحساب الحين؟",
        on_yes_action    = ["flag_account", "force_password_reset"],
        on_yes_message   = "تم تأمين حسابك. تأكد من تغيير كلمة المرور من التطبيق.",
        on_no_message    = "تمام. بسجل الحالة وبيتواصل معك أخصائي أمان قريباً.",
        agent_note       = "نشاط مشبوه — العميل رفض تأمين الحساب فوراً — يحتاج مراجعة عاجلة",
    ),

    "account_blocked": IntentFlow(
        intent           = "account_blocked",
        priority         = HIGH,
        questions = [
            "هل ظهرت رسالة خطأ محددة؟",
            "هل جربت تسجيل الدخول أكثر من مرة؟",
        ],
        proposed_action  = "send_otp",
        confirm_question = "أقدر أرسل لك رمز تحقق الحين لإعادة فتح الحساب. تبي أرسله؟",
        on_yes_action    = ["send_otp_verification"],
        on_yes_message   = "تم إرسال رمز التحقق لهاتفك. إذا واجهت مشكلة، تواصل معنا مرة ثانية.",
        on_no_message    = "تمام، ما بأرسل الرمز الحين. بسجل طلبك ويتواصل معك فريق الدعم.",
        agent_note       = "حساب موقوف — العميل لم يطلب OTP فوراً — يحتاج متابعة",
    ),

    "wrong_transfer": IntentFlow(
        intent           = "wrong_transfer",
        priority         = HIGH,
        questions = [
            "ما قيمة المبلغ الذي تم تحويله؟",
            "هل التحويل لنفس البنك أم لبنك آخر؟",
        ],
        proposed_action  = "open_dispute",
        confirm_question = "بناءً على كلامك، أفضل خطوة إنه نفتح طلب اعتراض على هذا التحويل. تبي أفتح الطلب؟",
        on_yes_action    = ["check_transaction_status", "open_dispute_if_completed"],
        on_yes_message   = "تم فتح طلب الاعتراض. بنتابع معك بالنتيجة خلال 3-5 أيام عمل.",
        on_no_message    = "تمام، ما بفتح طلب الحين. بسجل الحالة ويتواصل معك أخصائي لمناقشة التفاصيل.",
        agent_note       = "تحويل خاطئ — العميل رفض فتح طلب اعتراض فوري — يحتاج مراجعة",
    ),

    "duplicate_transaction": IntentFlow(
        intent           = "duplicate_transaction",
        priority         = MEDIUM,
        questions = [
            "ما وقت العملية؟",
            "هل العملية من متجر أم تحويل؟",
        ],
        proposed_action  = "create_complaint",
        confirm_question = "بفتح لك شكوى بخصوص الخصم المكرر هذا. تبي أفتح الشكوى؟",
        on_yes_action    = ["check_duplicate_records", "auto_create_complaint"],
        on_yes_message   = "تم فتح الشكوى. إذا تأكد الخصم المكرر، بيتم إرجاع المبلغ خلال 24 ساعة.",
        on_no_message    = "تمام، ما بفتح شكوى الحين. سجلت ملاحظة وبإمكانك التواصل معنا أي وقت.",
        agent_note       = "خصم مكرر — العميل لم يطلب فتح شكوى — للمتابعة عند الحاجة",
    ),

    "atm_issue": IntentFlow(
        intent           = "atm_issue",
        priority         = MEDIUM,
        questions = [
            "أين موقع جهاز الصراف؟",
            "هل تم خصم المبلغ دون استلام النقد؟",
        ],
        proposed_action  = "report_atm",
        confirm_question = "بفتح بلاغ لجهاز الصراف هذا ونتابع الموضوع. تبي أفتح البلاغ؟",
        on_yes_action    = ["create_atm_report", "notify_atm_team"],
        on_yes_message   = "تم فتح البلاغ وتحويله لفريق الصيانة. بنتواصل معك بالنتيجة.",
        on_no_message    = "تمام، ما بفتح بلاغ الحين. بإمكانك التواصل معنا أي وقت إذا تكررت المشكلة.",
        agent_note       = "مشكلة صراف آلي — العميل لم يطلب فتح بلاغ — ملاحظة فقط",
    ),

    "card_not_working": IntentFlow(
        intent           = "card_not_working",
        priority         = LOW,
        questions = [
            "هل المشكلة أثناء السحب أم الدفع؟",
            "هل جربت البطاقة في جهاز آخر؟",
        ],
        proposed_action  = "issue_replacement",
        confirm_question = "يبدو أن البطاقة فيها مشكلة تقنية. تبي أطلب لك بطاقة بديلة؟",
        on_yes_action    = ["run_card_diagnostics", "issue_replacement_card"],
        on_yes_message   = "تم. بطاقة بديلة بتوصلك خلال 3-5 أيام عمل.",
        on_no_message    = "تمام، ما بطلب بديلة الحين. جرب تستخدمها بجهاز ثاني وتواصل معنا إذا استمرت المشكلة.",
        agent_note       = "بطاقة معطلة — العميل لم يطلب بديلة — ملاحظة فقط",
    ),
}


EMOTION_RULES = {
    "panic":      { "priority_boost": 2, "ack_message": "لا تقلق، أنا معك وبنحل هذا الحين." },
    "angry":      { "priority_boost": 1, "ack_message": "أتفهم انزعاجك تماماً، خلني أساعدك." },
    "worried":    { "priority_boost": 1, "ack_message": "ما عليك، حسابك بأمان وبنرتب الموضوع." },
    "frustrated": { "priority_boost": 0, "ack_message": "أفهم إنه محبط، بحل لك المشكلة بأسرع وقت." },
    "confused":   { "priority_boost": 0, "ack_message": "ولا يهمك، بشرح لك كل شي بالتفصيل." },
    "calm":       { "priority_boost": 0, "ack_message": "" },
}


def apply_emotion_boost(base_priority: str, emotion: str) -> str:
    boost = EMOTION_RULES.get(emotion, {}).get("priority_boost", 0)
    if boost == 0:
        return base_priority
    idx     = PRIORITY_LEVELS.index(base_priority)
    new_idx = min(idx + boost, len(PRIORITY_LEVELS) - 1)
    return PRIORITY_LEVELS[new_idx]


def get_flow(intent: str) -> Optional[IntentFlow]:
    return FLOWS.get(intent)


def get_emotion_ack(emotion: str) -> str:
    return EMOTION_RULES.get(emotion, {}).get("ack_message", "")


# ── Action label translation (for dashboard display) ──────────────────────────
ACTION_AR: dict[str, str] = {
    "block_card_immediately":  "تم إيقاف البطاقة فوراً",
    "block_card_temporarily":  "تم إيقاف البطاقة مؤقتاً",
    "create_fraud_report":     "تم فتح بلاغ احتيال",
    "create_lost_card_report": "تم تسجيل بلاغ الفقدان",
    "flag_account":            "تم تأمين الحساب",
    "force_password_reset":   "تم طلب تغيير كلمة المرور",
    "send_otp_verification":  "تم إرسال رمز التحقق",
    "check_transaction_status":"تم التحقق من العملية",
    "open_dispute_if_completed":"تم فتح طلب اعتراض",
    "check_duplicate_records": "تم مراجعة السجلات",
    "auto_create_complaint":   "تم إنشاء الشكوى",
    "create_atm_report":       "تم فتح بلاغ الصراف",
    "notify_atm_team":         "تم إبلاغ فريق الصيانة",
    "run_card_diagnostics":    "تم تشخيص البطاقة",
    "issue_replacement_card":  "تم طلب بطاقة بديلة",
}
