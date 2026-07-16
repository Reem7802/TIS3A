"""
تسعة — AI Quality Evaluator + Smart Summary Generator
========================================================
Computes quality metrics for each call and generates a 6-line smart summary.
All computed from existing call data — no extra input needed.
"""

import time


INTENT_EN = {
    "fraud":"Fraud", "lost_card":"Lost Card",
    "duplicate_transaction":"Duplicate Transaction",
    "suspicious_activity":"Suspicious Activity",
    "account_blocked":"Account Blocked",
    "wrong_transfer":"Wrong Transfer",
    "card_not_working":"Card Not Working",
    "atm_issue":"ATM Issue",
}
EMOTION_EN = {
    "panic":"Panic", "angry":"Angry", "frustrated":"Frustrated",
    "calm":"Calm", "confused":"Confused", "worried":"Worried",
}
ACTION_EN = {
    "block_card_immediately":"Block card immediately",
    "block_card_temporarily":"Block card temporarily",
    "freeze_card_24h":"Freeze card for 24 hours",
    "set_daily_limit_200":"Set daily limit to 200 SAR",
    "create_fraud_report":"Open fraud report",
    "create_lost_card_report":"Register lost card report",
    "flag_account":"Flag and secure account",
    "send_otp_verification":"Send OTP verification",
    "open_dispute_if_completed":"Open dispute request",
    "auto_create_complaint":"Create complaint ticket",
    "create_atm_report":"Open ATM report",
    "issue_replacement_card":"Issue replacement card",
    "remote_card_reactivation":"Remote card reactivation",
    "enable_login_alerts":"Enable login alerts",
    "send_self_report_link":"Send self-service report link",
}

NEXT_STEPS = {
    "fraud": {
        "yes":         "Monitor account for 48h. Send replacement card if blocked.",
        "yes_counter": "Unfreeze card after 24h verification. Follow up with fraud team.",
        "no":          "URGENT: Call customer within 1 hour. High fraud risk detected.",
    },
    "lost_card": {
        "yes":         "Issue replacement card. Estimated delivery 3-5 business days.",
        "yes_counter": "Monitor daily limit usage. Follow up if card not found in 24h.",
        "no":          "Call customer to confirm card status. Risk of unauthorized use.",
    },
    "suspicious_activity": {
        "yes":         "Monitor account for 72h. Review recent transactions.",
        "yes_counter": "Review login alerts daily for 1 week.",
        "no":          "Manual account review required within 2 hours.",
    },
    "account_blocked": {
        "yes":         "Confirm OTP was received and account is accessible.",
        "yes_counter": "Confirm branch appointment. Prepare required documents list.",
        "no":          "Schedule urgent branch appointment or remote verification.",
    },
    "wrong_transfer": {
        "yes":         "Track dispute status. Update customer within 3-5 business days.",
        "yes_counter": "Follow up with receiving bank within 48h.",
        "no":          "Contact customer to gather more details for manual processing.",
    },
    "duplicate_transaction": {
        "yes":         "Process refund within 24h if duplicate confirmed.",
        "yes_counter": "Send written confirmation within 24h.",
        "no":          "Manual transaction review required.",
    },
    "atm_issue": {
        "yes":         "Coordinate with ATM team. Update customer within 24h.",
        "yes_counter": "Follow up on submitted report within 48h.",
        "no":          "Contact ATM maintenance team directly.",
    },
    "card_not_working": {
        "yes":         "Track replacement card delivery. Contact if not received in 5 days.",
        "yes_counter": "Confirm card reactivation successful after 2 minutes.",
        "no":          "Schedule technical review or branch visit.",
    },
}

RESOLUTION_REASON = {
    "yes":         "Customer accepted the primary proposed action.",
    "yes_counter": "Customer initially declined, then accepted the counter-offer after AI negotiation.",
    "no":          "Customer declined both offers. Escalated to human agent.",
}

TRANSFER_REASON = {
    "yes":         None,
    "yes_counter": None,
    "no":          "Customer declined all automated resolution options. Manual follow-up required.",
}


def compute_quality(call: dict) -> dict:
    """
    Compute AI quality metrics for a completed call.
    Returns a dict ready to send to the frontend.
    """
    decision   = call.get("customer_decision", "")
    status     = call.get("status", "open")
    intent     = call.get("intent", "")
    emotion    = call.get("emotion", "calm")
    priority   = call.get("priority", "LOW")
    ic         = call.get("intent_confidence", 0)
    ec         = call.get("emotion_confidence", 0)
    actions    = call.get("actions_taken", [])
    created_at = call.get("created_at", time.time())

    # ── Was problem resolved? ─────────────────────────────────────────
    resolved = status == "resolved"

    # ── Human intervention needed? ────────────────────────────────────
    human_needed = decision == "no"
    human_reason = TRANSFER_REASON.get(decision)

    # ── Negotiation happened? ─────────────────────────────────────────
    negotiated = decision == "yes_counter"

    # ── Resolution time (estimated — from session start to now) ───────
    elapsed_sec = int(time.time() - created_at)
    if elapsed_sec < 60:
        resolution_time = f"{elapsed_sec}s"
    else:
        resolution_time = f"{elapsed_sec // 60}m {elapsed_sec % 60}s"

    # ── Expected customer satisfaction ────────────────────────────────
    # Based on: emotion + decision + whether negotiation was needed
    if decision == "yes" and emotion in ("calm", "confused"):
        satisfaction = 95
        satisfaction_label = "Very High"
    elif decision == "yes" and emotion in ("worried", "frustrated"):
        satisfaction = 82
        satisfaction_label = "High"
    elif decision == "yes" and emotion in ("angry", "panic"):
        satisfaction = 74
        satisfaction_label = "Moderate-High"
    elif decision == "yes_counter":
        satisfaction = 68
        satisfaction_label = "Moderate"
    elif decision == "no":
        satisfaction = 35
        satisfaction_label = "Low — Needs Follow-up"
    else:
        satisfaction = 60
        satisfaction_label = "Unknown"

    # ── Model confidence rating ───────────────────────────────────────
    avg_conf = (ic + ec) / 2
    if avg_conf >= 0.90:
        confidence_rating = "Excellent"
    elif avg_conf >= 0.75:
        confidence_rating = "Good"
    elif avg_conf >= 0.60:
        confidence_rating = "Acceptable"
    else:
        confidence_rating = "Low — Review Recommended"

    # ── Classification accuracy proxy ─────────────────────────────────
    # High confidence + resolved = likely correct classification
    if ic >= 0.85 and resolved:
        classification_quality = "Likely Correct"
        classification_color   = "green"
    elif ic >= 0.70:
        classification_quality = "Probable"
        classification_color   = "yellow"
    else:
        classification_quality = "Uncertain — Verify"
        classification_color   = "red"

    # ── Next steps ────────────────────────────────────────────────────
    next_steps = NEXT_STEPS.get(intent, {}).get(
        decision,
        "Review call details and contact customer if needed."
    )

    return {
        "resolved":               resolved,
        "human_needed":           human_needed,
        "human_reason":           human_reason,
        "negotiated":             negotiated,
        "resolution_time":        resolution_time,
        "satisfaction_score":     satisfaction,
        "satisfaction_label":     satisfaction_label,
        "confidence_rating":      confidence_rating,
        "classification_quality": classification_quality,
        "classification_color":   classification_color,
        "resolution_reason":      RESOLUTION_REASON.get(decision, "—"),
        "next_steps":             next_steps,
        "actions_count":          len(actions),
    }


def generate_smart_summary(call: dict) -> dict:
    """
    Generate a 6-field smart summary for the employee.
    Readable in under 10 seconds.
    """
    intent   = call.get("intent", "")
    emotion  = call.get("emotion", "calm")
    decision = call.get("customer_decision", "")
    status   = call.get("status", "open")
    actions  = call.get("actions_taken", [])
    note     = call.get("agent_note", "")
    priority = call.get("priority", "LOW")
    ic       = call.get("intent_confidence", 0)
    ec       = call.get("emotion_confidence", 0)

    # ── Problem ───────────────────────────────────────────────────────
    intent_label = INTENT_EN.get(intent, intent)
    emotion_label = EMOTION_EN.get(emotion, emotion)
    problem = f"{intent_label} — Customer was {emotion_label.lower()} ({round(ic*100)}% confidence)"

    # ── Cause / Context ───────────────────────────────────────────────
    cause_map = {
        "fraud":                "Customer reported unauthorized transaction on their account.",
        "lost_card":            "Customer reported their card is lost or stolen.",
        "duplicate_transaction":"Customer noticed the same charge appeared twice.",
        "suspicious_activity":  "Customer noticed suspicious account activity or received unrequested OTP.",
        "account_blocked":      "Customer is unable to access their account or app.",
        "wrong_transfer":       "Customer transferred funds to an incorrect recipient.",
        "atm_issue":            "ATM deducted funds without dispensing cash or retained card.",
        "card_not_working":     "Card is being declined across multiple terminals.",
    }
    cause = cause_map.get(intent, "Customer reported a banking issue.")

    # ── Actions taken ─────────────────────────────────────────────────
    if actions:
        actions_text = " | ".join([ACTION_EN.get(a, a) for a in actions])
    else:
        actions_text = "No automated actions executed."

    # ── Customer decision ─────────────────────────────────────────────
    decision_map = {
        "yes":         "Accepted — Customer approved the primary proposed action immediately.",
        "yes_counter": "Negotiated — Customer initially declined, then accepted the counter-offer.",
        "no":          "Declined — Customer rejected both offers. Requires human follow-up.",
    }
    customer_decision = decision_map.get(decision, "Unknown")

    # ── Outcome ───────────────────────────────────────────────────────
    if status == "resolved":
        outcome = f"RESOLVED automatically by Tis3a AI. {len(actions)} action(s) executed."
    else:
        outcome = f"OPEN — Escalated to agent. {note if note else 'Manual follow-up required.'}"

    # ── Next steps ────────────────────────────────────────────────────
    next_steps = NEXT_STEPS.get(intent, {}).get(
        decision,
        "Review call details and follow up with customer."
    )

    return {
        "problem":           problem,
        "cause":             cause,
        "actions":           actions_text,
        "customer_decision": customer_decision,
        "outcome":           outcome,
        "next_steps":        next_steps,
    }
