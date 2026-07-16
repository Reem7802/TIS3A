"""
تسعة — Flow Engine
===================
Defines per-intent conversation flows:
  - questions to ask
  - the proposed action (must be confirmed by the CUSTOMER before executing)
  - a softer COUNTER-OFFER if the customer declines the first proposal
  - emotion-based priority adjustments

Core idea: the AI talks to the customer directly (voice or text).
When it reaches a consequential action (block card, escalate, etc.),
it asks the CUSTOMER "do you want me to do this?" — not an employee.

  - If customer says YES to the main proposal -> action executes -> RESOLVED
  - If customer says NO  -> AI offers a softer counter-offer (negotiation step)
        - YES to counter-offer -> softer action executes -> RESOLVED (counter)
        - NO to counter-offer  -> ticket created -> OPEN (needs employee follow-up)
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
    intent:                str
    priority:              str
    questions:              List[str]
    proposed_action:        str
    confirm_question:       str
    on_yes_action:           List[str]
    on_yes_message:          str

    counter_offer_question: str
    counter_offer_action:    List[str]
    on_counter_yes_message:  str
    on_final_no_message:     str
    agent_note:               str


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

        counter_offer_question = "أتفهم إنك ما تبي توقف البطاقة بشكل نهائي. بناءً على حالات مشابهة، خطورة استمرار استخدامها عالية. تبي أجمدها بشكل مؤقت لمدة 24 ساعة بس لحد نتحقق من العملية؟",
        counter_offer_action   = ["freeze_card_24h", "create_fraud_report"],
        on_counter_yes_message = "تم. جمدت بطاقتك لمدة 24 ساعة وفتحت بلاغ احتيال. بيتواصل معك أخصائي خلال هذا الوقت.",
        on_final_no_message    = "تمام، فهمت رغبتك. بسجل طلبك وبيتواصل معك أخصائي احتيال قريباً جداً لمراجعة الحالة معك مباشرة.",
        agent_note       = "⚠️ عميل اشتبه باحتيال ورفض إيقاف وتجميد البطاقة — يحتاج تواصل فوري وعاجل",
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

        counter_offer_question = "أتفهم إنك تبي تحتفظ بإمكانية استخدامها. تبي أحدد بدلها حد أقصى للسحب اليومي 200 ريال لحد ما تتأكد من وضع البطاقة؟",
        counter_offer_action   = ["set_daily_limit_200", "create_lost_card_report"],
        on_counter_yes_message = "تم. حددت حد السحب اليومي بـ200 ريال على بطاقتك وسجلت بلاغ الفقدان.",
        on_final_no_message    = "تمام، فهمت. سجلت بلاغ الفقدان بدون أي إجراء على البطاقة الحين، وبيتواصل معك فريقنا للمتابعة.",
        agent_note       = "بلاغ فقدان بطاقة — العميل رفض الإيقاف والحد اليومي — يحتاج متابعة عاجلة",
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

        counter_offer_question = "أتفهم تردّدك. على الأقل، تقدر توافق إنه نرسل لك تنبيه فوري لو حصل أي تسجيل دخول جديد على حسابك؟",
        counter_offer_action   = ["enable_login_alerts"],
        on_counter_yes_message = "تم تفعيل تنبيهات تسجيل الدخول. بترسل لك رسالة فورية بأي محاولة دخول جديدة.",
        on_final_no_message    = "تمام، ما راح أتخذ إجراء الحين. بس سجلت ملاحظة على حسابك وبيتواصل معك أخصائي أمان للمتابعة.",
        agent_note       = "نشاط مشبوه — العميل رفض تأمين الحساب وتنبيهات الدخول — يحتاج مراجعة عاجلة",
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

        counter_offer_question = "تمام، ما راح أرسل الرمز الحين. تبي بدالها أحجز لك موعد مع فرع قريب لحل الموضوع شخصياً؟",
        counter_offer_action   = ["schedule_branch_appointment"],
        on_counter_yes_message = "تم. بيتواصل معك فريق الفروع لتحديد أقرب موعد متاح.",
        on_final_no_message    = "تمام، فهمت. سجلت طلبك وبيتواصل معك فريق الدعم لمناقشة الخيارات المتاحة.",
        agent_note       = "حساب موقوف — العميل رفض OTP وموعد الفرع — يحتاج متابعة",
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

        counter_offer_question = "أتفهم. بدالها، تبي أتواصل أنا مباشرة مع البنك المستلم بالأصالة عنك لمحاولة استرجاع المبلغ بشكل ودي قبل فتح اعتراض رسمي؟",
        counter_offer_action   = ["initiate_informal_recall_request"],
        on_counter_yes_message = "تم. بدأت بالتواصل مع البنك المستلم لمحاولة استرجاع المبلغ. بنحدثك بالنتيجة خلال 48 ساعة.",
        on_final_no_message    = "تمام، فهمت. سجلت الحالة بدون أي إجراء حالياً وبيتواصل معك أخصائي لمناقشة التفاصيل والخيارات.",
        agent_note       = "تحويل خاطئ — العميل رفض الاعتراض الرسمي والاسترجاع الودي — يحتاج مراجعة",
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

        counter_offer_question = "ولا يهمك. تبي بدالها أراجع السجلات فقط وأرسل لك تأكيد كتابي بدون فتح شكوى رسمية الحين؟",
        counter_offer_action   = ["send_records_confirmation"],
        on_counter_yes_message = "تم. راجعت السجلات وبيوصلك تأكيد كتابي بالتفاصيل قريباً.",
        on_final_no_message    = "تمام، ما راح أتخذ إجراء الحين. سجلت ملاحظة وبإمكانك التواصل معنا أي وقت.",
        agent_note       = "خصم مكرر — العميل لم يطلب شكوى أو مراجعة — للمتابعة عند الحاجة",
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

        counter_offer_question = "تمام. تبي بدالها أرسل لك رابط لتعبئة البلاغ بنفسك مع إمكانية إرفاق صورة من إيصال العملية إذا متوفر؟",
        counter_offer_action   = ["send_self_report_link"],
        on_counter_yes_message = "تم إرسال الرابط لهاتفك. عبّيه بالتفاصيل وراح تتابع حالته من نفس الرابط.",
        on_final_no_message    = "تمام، ما راح أفتح بلاغ الحين. بإمكانك التواصل معنا أي وقت إذا تكررت المشكلة.",
        agent_note       = "مشكلة صراف آلي — العميل لم يطلب بلاغ — ملاحظة فقط",
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

        counter_offer_question = "ولا يهمك. تبي بدالها نسوي إعادة تفعيل للبطاقة عن بعد أولاً؟ ممكن تحل المشكلة بدون الحاجة لبطاقة جديدة.",
        counter_offer_action   = ["remote_card_reactivation"],
        on_counter_yes_message = "تم. أعدت تفعيل البطاقة. جرّبها بعد دقيقتين وأخبرنا إذا استمرت المشكلة.",
        on_final_no_message    = "تمام، ما راح أطلب بديلة الحين. جرب تستخدمها بجهاز ثاني وتواصل معنا إذا استمرت المشكلة.",
        agent_note       = "بطاقة معطلة — العميل لم يطلب بديلة أو إعادة تفعيل — ملاحظة فقط",
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


ACTION_AR: dict[str, str] = {
    "block_card_immediately":      "تم إيقاف البطاقة فوراً",
    "block_card_temporarily":      "تم إيقاف البطاقة مؤقتاً",
    "freeze_card_24h":             "تم تجميد البطاقة لمدة 24 ساعة",
    "set_daily_limit_200":         "تم تحديد حد سحب يومي 200 ريال",
    "create_fraud_report":         "تم فتح بلاغ احتيال",
    "create_lost_card_report":     "تم تسجيل بلاغ الفقدان",
    "flag_account":                "تم تأمين الحساب",
    "force_password_reset":        "تم طلب تغيير كلمة المرور",
    "enable_login_alerts":         "تم تفعيل تنبيهات تسجيل الدخول",
    "send_otp_verification":       "تم إرسال رمز التحقق",
    "schedule_branch_appointment": "تم حجز موعد فرع",
    "check_transaction_status":    "تم التحقق من العملية",
    "open_dispute_if_completed":   "تم فتح طلب اعتراض",
    "initiate_informal_recall_request": "تم بدء طلب استرجاع ودي",
    "check_duplicate_records":     "تم مراجعة السجلات",
    "auto_create_complaint":       "تم إنشاء الشكوى",
    "send_records_confirmation":   "تم إرسال تأكيد السجلات",
    "create_atm_report":           "تم فتح بلاغ الصراف",
    "notify_atm_team":             "تم إبلاغ فريق الصيانة",
    "send_self_report_link":       "تم إرسال رابط البلاغ الذاتي",
    "run_card_diagnostics":        "تم تشخيص البطاقة",
    "issue_replacement_card":      "تم طلب بطاقة بديلة",
    "remote_card_reactivation":    "تم إعادة تفعيل البطاقة عن بعد",
}
