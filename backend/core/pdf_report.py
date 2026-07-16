"""
تسعة — PDF Report Generator (Clean English)
"""

import os, time, io
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table,
    TableStyle, HRFlowable, KeepTogether
)
from reportlab.lib.styles import ParagraphStyle

NAVY   = colors.HexColor("#0D1B3E")
TERRA  = colors.HexColor("#B85042")
WHITE  = colors.white
LIGHT  = colors.HexColor("#F5F2EF")
LIGHT2 = colors.HexColor("#E8E3DC")
MUTED  = colors.HexColor("#7A92B8")
GREEN  = colors.HexColor("#2E7D32")
RED    = colors.HexColor("#C62828")
ORANGE = colors.HexColor("#E65100")
YELLOW = colors.HexColor("#F9A825")
BLUE   = colors.HexColor("#1565C0")
PURPLE = colors.HexColor("#6A1B9A")

F  = "Helvetica"
FB = "Helvetica-Bold"

def S(name, **kw):
    base = dict(fontName=F, fontSize=10, leading=15, textColor=NAVY)
    base.update(kw)
    return ParagraphStyle(name, **base)

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
PRIORITY_EN = {"CRITICAL":"Critical","HIGH":"High","MEDIUM":"Medium","LOW":"Low"}
DECISION_EN = {
    "yes":"Accepted primary offer",
    "yes_counter":"Accepted counter-offer",
    "no":"Declined — Escalated to agent",
}
ACTION_EN = {
    "block_card_immediately":"Block card immediately",
    "block_card_temporarily":"Block card temporarily",
    "freeze_card_24h":"Freeze card for 24 hours",
    "set_daily_limit_200":"Set daily limit to 200 SAR",
    "create_fraud_report":"Open fraud report",
    "create_lost_card_report":"Register lost card report",
    "flag_account":"Flag and secure account",
    "force_password_reset":"Request password reset",
    "enable_login_alerts":"Enable login alerts",
    "send_otp_verification":"Send OTP verification",
    "schedule_branch_appointment":"Schedule branch appointment",
    "check_transaction_status":"Check transaction status",
    "open_dispute_if_completed":"Open dispute request",
    "initiate_informal_recall_request":"Initiate informal bank recall",
    "check_duplicate_records":"Review duplicate records",
    "auto_create_complaint":"Create complaint ticket",
    "send_records_confirmation":"Send records confirmation",
    "create_atm_report":"Open ATM report",
    "notify_atm_team":"Notify ATM maintenance team",
    "send_self_report_link":"Send self-service report link",
    "run_card_diagnostics":"Run card diagnostics",
    "issue_replacement_card":"Issue replacement card",
    "remote_card_reactivation":"Remote card reactivation",
}

def _pc(p):
    return {"CRITICAL":RED,"HIGH":ORANGE,"MEDIUM":YELLOW,"LOW":GREEN}.get(p, MUTED)

def _ftime(ts):
    return time.strftime("%Y-%m-%d %H:%M", time.localtime(ts))

def _divider(story, color=TERRA, thick=2, space=8):
    story.append(HRFlowable(width="100%", thickness=thick,
                             color=color, spaceBefore=space, spaceAfter=space))

def _section(story, title, color=NAVY):
    story.append(Spacer(1, 0.2*cm))
    story.append(Table(
        [[Paragraph(title, S(f"sh{title}", fontName=FB, fontSize=10,
                             textColor=WHITE))]],
        colWidths=[17*cm]
    ))
    # rewrite with proper background
    story[-1].setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1), color),
        ("ROWPADDING",(0,0),(-1,-1), 6),
        ("LEFTPADDING",(0,0),(-1,-1), 10),
    ]))
    story.append(Spacer(1, 0.1*cm))

def _hdr_table(left, center, right):
    t = Table([[
        Paragraph(left,   S("l", fontSize=9,  textColor=colors.HexColor("#CADCFC"))),
        Paragraph(center, S("c", fontSize=14, fontName=FB, textColor=WHITE)),
        Paragraph(right,  S("r", fontSize=10, fontName=FB, textColor=TERRA)),
    ]], colWidths=[4*cm, 9*cm, 4*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1), NAVY),
        ("ALIGN",(0,0),(-1,-1),"CENTER"),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("ROWPADDING",(0,0),(-1,-1), 14),
    ]))
    return t

def _grid_table(rows, col_widths, header_color=NAVY):
    t = Table(rows, colWidths=col_widths)
    style = [
        ("BACKGROUND",(0,0),(-1,0), header_color),
        ("TEXTCOLOR",(0,0),(-1,0), WHITE),
        ("FONTNAME",(0,0),(-1,0), FB),
        ("FONTNAME",(0,1),(-1,-1), F),
        ("FONTSIZE",(0,0),(-1,-1), 9),
        ("ALIGN",(0,0),(-1,-1),"CENTER"),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("ROWPADDING",(0,0),(-1,-1), 7),
        ("BOX",(0,0),(-1,-1), 0.5, LIGHT2),
        ("INNERGRID",(0,0),(-1,-1), 0.5, LIGHT2),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[LIGHT,WHITE]),
    ]
    t.setStyle(TableStyle(style))
    return t


# ════════════════════════════════════════════════════════════════════
#  PER-CALL REPORT
# ════════════════════════════════════════════════════════════════════
def generate_call_report(call: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=1.5*cm, bottomMargin=1.5*cm)

    story = []

    # ── Header ───────────────────────────────────────────────────────
    story.append(_hdr_table(
        "INMA BANK\nمصرف الإنماء",
        f"CALL REPORT\nTIS3A AI Banking Assistant",
        f"Ticket: {call.get('ticket_number','')}\n{_ftime(call.get('created_at',0))}"
    ))
    _divider(story, TERRA, 3, 0)

    # ── Status strip ─────────────────────────────────────────────────
    pc = _pc(call.get("priority","LOW"))
    status = "RESOLVED" if call.get("status")=="resolved" else "OPEN — Follow Up"
    sc = GREEN if call.get("status")=="resolved" else RED

    strip = Table([[
        [Paragraph("INTENT",   S("s1",fontSize=8,textColor=MUTED,fontName=FB)),
         Paragraph(INTENT_EN.get(call.get("intent",""), call.get("intent","")),
                   S("s1v",fontName=FB,fontSize=11))],
        [Paragraph("EMOTION",  S("s2",fontSize=8,textColor=MUTED,fontName=FB)),
         Paragraph(EMOTION_EN.get(call.get("emotion",""), call.get("emotion","")),
                   S("s2v",fontName=FB,fontSize=11))],
        [Paragraph("PRIORITY", S("s3",fontSize=8,textColor=MUTED,fontName=FB)),
         Paragraph(PRIORITY_EN.get(call.get("priority",""), ""),
                   S("s3v",fontName=FB,fontSize=11,textColor=pc))],
        [Paragraph("DECISION", S("s4",fontSize=8,textColor=MUTED,fontName=FB)),
         Paragraph(DECISION_EN.get(call.get("customer_decision",""), "—"),
                   S("s4v",fontName=FB,fontSize=10))],
        [Paragraph("STATUS",   S("s5",fontSize=8,textColor=MUTED,fontName=FB)),
         Paragraph(status, S("s5v",fontName=FB,fontSize=11,textColor=sc))],
    ]], colWidths=[3.4*cm]*5)
    strip.setStyle(TableStyle([
        ("BOX",(0,0),(-1,-1),0.5,LIGHT2),
        ("INNERGRID",(0,0),(-1,-1),0.5,LIGHT2),
        ("BACKGROUND",(0,0),(-1,-1),LIGHT),
        ("ALIGN",(0,0),(-1,-1),"CENTER"),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("ROWPADDING",(0,0),(-1,-1),10),
    ]))
    story.append(Spacer(1, 0.3*cm))
    story.append(strip)

    # ── AI Classification ─────────────────────────────────────────────
    _section(story, "AI CLASSIFICATION — MARBERT DEEP LEARNING MODELS")
    ic = round((call.get("intent_confidence",0))*100)
    ec = round((call.get("emotion_confidence",0))*100)

    cls = _grid_table([
        ["Model", "Result", "Confidence", "Architecture"],
        ["MARBERT Intent", INTENT_EN.get(call.get("intent",""), call.get("intent","")),
         f"{ic}%", "Fine-tuned Transformer | 8 classes | F1: 99.58%"],
        ["MARBERT Emotion", EMOTION_EN.get(call.get("emotion",""), call.get("emotion","")),
         f"{ec}%", "Fine-tuned Transformer | 6 classes | F1: 89.56%"],
    ], [4*cm, 3.5*cm, 2*cm, 7.5*cm])
    story.append(cls)

    # Confidence bars
    story.append(Spacer(1, 0.15*cm))
    for label, conf, color in [
        (f"Intent Confidence: {ic}%", ic, BLUE),
        (f"Emotion Confidence: {ec}%", ec, PURPLE),
    ]:
        bar_filled = max(1, int(conf / 100 * 34))
        bar_empty  = 34 - bar_filled
        bar_str = "█" * bar_filled + "░" * bar_empty
        story.append(Paragraph(
            f"<font name='Helvetica-Bold' color='#455A64'>{label:35s}</font>"
            f"<font color='#{color.hexval()[2:]}' name='Helvetica'>{bar_str}</font>",
            S(f"bar{label}", fontSize=9, leading=13)
        ))

    # ── Q&A ───────────────────────────────────────────────────────────
    questions = call.get("questions_asked",[])
    answers   = call.get("answers_collected",[])
    if questions:
        _section(story, "INFORMATION GATHERED — Q&A")
        rows = [["#", "Question", "Customer Response"]]
        for i, q in enumerate(questions):
            rows.append([str(i+1), q, answers[i] if i < len(answers) else "—"])
        story.append(_grid_table(rows, [0.7*cm, 8.5*cm, 7.8*cm]))

    # ── Actions ───────────────────────────────────────────────────────
    actions = call.get("actions_taken",[])
    if actions:
        _section(story, "ACTIONS EXECUTED AUTOMATICALLY", GREEN)
        for a in actions:
            story.append(Paragraph(
                f"  [OK]   {ACTION_EN.get(a, a)}",
                S(f"a{a}", fontSize=10, textColor=GREEN, leading=18)
            ))

    # ── Negotiation ───────────────────────────────────────────────────
    dec = call.get("customer_decision","")
    if dec == "yes_counter":
        _section(story, "NEGOTIATION RESULT — COUNTER-OFFER ACCEPTED", BLUE)
        story.append(Paragraph(
            "Customer declined the primary proposed action. "
            "Tis3a AI presented a softer alternative (counter-offer). "
            "Customer accepted the counter-offer. Case resolved.",
            S("neg", fontSize=10, textColor=BLUE, leading=16)
        ))
    elif dec == "no":
        _section(story, "ESCALATION — BOTH OFFERS DECLINED", RED)
        story.append(Paragraph(
            "Customer declined both the primary offer and the counter-offer. "
            "Case escalated to human agent for follow-up.",
            S("esc", fontSize=10, textColor=RED, leading=16)
        ))

    # ── Agent note ────────────────────────────────────────────────────
    note = call.get("agent_note","")
    if note:
        _section(story, "AGENT NOTE — ACTION REQUIRED", RED)
        story.append(Paragraph(note, S("note", fontSize=10,
                                       textColor=RED, leading=16)))

    # ── Footer ────────────────────────────────────────────────────────
    _divider(story, TERRA)
    story.append(Paragraph(
        f"Generated by Tis3a AI System  |  Inma Bank  |  "
        f"{time.strftime('%Y-%m-%d %H:%M')}  |  "
        f"Ticket: {call.get('ticket_number','')}  |  CONFIDENTIAL",
        S("foot", fontSize=8, textColor=MUTED, alignment=1)
    ))

    doc.build(story)
    return buf.getvalue()


# ════════════════════════════════════════════════════════════════════
#  DAILY SUMMARY REPORT
# ════════════════════════════════════════════════════════════════════
def generate_daily_report(calls: list, stats: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=1.5*cm, bottomMargin=1.5*cm)

    story = []
    today = time.strftime("%Y-%m-%d")

    # ── Header ───────────────────────────────────────────────────────
    story.append(_hdr_table(
        "INMA BANK\nمصرف الإنماء",
        f"DAILY OPERATIONS REPORT\nTIS3A AI System  —  {today}",
        "Tis3a\nتسعة"
    ))
    _divider(story, TERRA, 3, 0)

    # ── KPIs ─────────────────────────────────────────────────────────
    total    = stats.get("total_today", len(calls))
    resolved = sum(1 for c in calls if c.get("status")=="resolved")
    fraud    = stats.get("fraud_today", 0)
    open_c   = stats.get("open_today", 0)
    rate     = round(resolved/total*100) if total else 0
    neg      = sum(1 for c in calls if c.get("customer_decision")=="yes_counter")

    def _kpi_cell(label, value, color):
        return Table([
            [Paragraph(label, S(f"kl{label}", fontSize=8, textColor=MUTED, fontName=FB,
                                alignment=1))],
            [Paragraph(str(value), S(f"kv{label}", fontSize=32, fontName=FB,
                                      textColor=color, alignment=1, leading=36))],
        ], colWidths=[4.1*cm])

    kpi_row1 = Table([[
        _kpi_cell("TOTAL CALLS",   total,    NAVY),
        _kpi_cell("AUTO-RESOLVED", f"{resolved} ({rate}%)", GREEN),
        _kpi_cell("FRAUD CASES",   fraud,    RED),
        _kpi_cell("OPEN CASES",    open_c,   ORANGE),
    ]], colWidths=[4.1*cm]*4)
    kpi_row1.setStyle(TableStyle([
        ("BOX",(0,0),(-1,-1),1,LIGHT2),
        ("INNERGRID",(0,0),(-1,-1),1,LIGHT2),
        ("BACKGROUND",(0,0),(-1,-1),LIGHT),
        ("ALIGN",(0,0),(-1,-1),"CENTER"),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("ROWPADDING",(0,0),(-1,-1),16),
    ]))

    kpi_row2 = Table([[
        _kpi_cell("NEGOTIATED",    neg,      BLUE),
        _kpi_cell("RESOLVED",      resolved, GREEN),
        _kpi_cell("OPEN RATE",     f"{100-rate}%", ORANGE),
        _kpi_cell("CHANNELS",      "Text/Voice", MUTED),
    ]], colWidths=[4.1*cm]*4)
    kpi_row2.setStyle(TableStyle([
        ("BOX",(0,0),(-1,-1),1,LIGHT2),
        ("INNERGRID",(0,0),(-1,-1),1,LIGHT2),
        ("BACKGROUND",(0,0),(-1,-1),WHITE),
        ("ALIGN",(0,0),(-1,-1),"CENTER"),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("ROWPADDING",(0,0),(-1,-1),16),
    ]))

    story.append(Spacer(1,0.3*cm))
    story.append(kpi_row1)
    story.append(Spacer(1,0.15*cm))
    story.append(kpi_row2)

    # ── Resolution rate bar ───────────────────────────────────────────
    story.append(Spacer(1,0.2*cm))
    filled = max(1, int(rate/100*34))
    bar = "█"*filled + "░"*(34-filled)
    story.append(Paragraph(
        f"<font name='Helvetica-Bold'>Auto-Resolution Rate: {rate}%   </font>"
        f"<font color='#2E7D32'>{bar}</font>",
        S("ratebar", fontSize=10, leading=16)
    ))

    # ── Intent distribution ───────────────────────────────────────────
    _section(story, "PROBLEM DISTRIBUTION BY INTENT")
    intent_counts: dict = {}
    for c in calls:
        k = INTENT_EN.get(c.get("intent",""), c.get("intent","Unknown"))
        intent_counts[k] = intent_counts.get(k,0)+1

    if intent_counts:
        max_count = max(intent_counts.values())
        rows = [["Intent", "Count", "%", "Volume"]]
        for intent, count in sorted(intent_counts.items(), key=lambda x: -x[1]):
            bar_len = max(1, int(count/max_count*20))
            rows.append([
                intent,
                str(count),
                f"{round(count/total*100)}%" if total else "0%",
                "█"*bar_len,
            ])
        t = _grid_table(rows, [5.5*cm, 2*cm, 2*cm, 7.5*cm])
        # Color the bar column
        for i in range(1, len(rows)):
            t.setStyle(TableStyle([("TEXTCOLOR",(3,i),(3,i), BLUE)]))
        story.append(t)

    # ── Emotion breakdown ─────────────────────────────────────────────
    _section(story, "EMOTION BREAKDOWN")
    emotion_counts: dict = {}
    for c in calls:
        k = EMOTION_EN.get(c.get("emotion",""), c.get("emotion","Unknown"))
        emotion_counts[k] = emotion_counts.get(k,0)+1

    if emotion_counts:
        rows = [["Emotion", "Count", "% of Calls"]]
        for em, count in sorted(emotion_counts.items(), key=lambda x: -x[1]):
            rows.append([em, str(count), f"{round(count/total*100)}%" if total else "0%"])
        story.append(_grid_table(rows, [5*cm, 3*cm, 9*cm]))

    # ── Open cases ────────────────────────────────────────────────────
    open_calls = [c for c in calls if c.get("status")=="open"]
    if open_calls:
        _section(story, "OPEN CASES — REQUIRE AGENT FOLLOW-UP", RED)
        rows = [["Ticket", "Time", "Intent", "Priority", "Channel", "Decision"]]
        for c in open_calls:
            rows.append([
                c.get("ticket_number",""),
                time.strftime("%H:%M", time.localtime(c.get("created_at",0))),
                INTENT_EN.get(c.get("intent",""), c.get("intent","")),
                PRIORITY_EN.get(c.get("priority",""), ""),
                "Voice" if c.get("channel")=="voice" else "Text",
                DECISION_EN.get(c.get("customer_decision",""), "—"),
            ])
        t = _grid_table(rows, [2.8*cm, 1.5*cm, 3.5*cm, 2*cm, 1.8*cm, 5.4*cm], RED)
        story.append(t)

    # ── All calls ─────────────────────────────────────────────────────
    _section(story, "ALL CALLS TODAY")
    rows = [["Ticket","Time","Intent","Emotion","Priority","Status","Decision"]]
    for c in calls:
        rows.append([
            c.get("ticket_number",""),
            time.strftime("%H:%M", time.localtime(c.get("created_at",0))),
            INTENT_EN.get(c.get("intent",""),""),
            EMOTION_EN.get(c.get("emotion",""),""),
            PRIORITY_EN.get(c.get("priority",""),""),
            "Resolved" if c.get("status")=="resolved" else "Open",
            DECISION_EN.get(c.get("customer_decision",""), "—"),
        ])
    story.append(_grid_table(
        rows,
        [2.8*cm, 1.5*cm, 3*cm, 1.8*cm, 1.8*cm, 1.8*cm, 4.3*cm]
    ))

    # ── Footer ────────────────────────────────────────────────────────
    _divider(story, TERRA)
    story.append(Paragraph(
        f"Generated by Tis3a AI System  |  Inma Bank  |  "
        f"{time.strftime('%Y-%m-%d %H:%M')}  |  CONFIDENTIAL",
        S("foot", fontSize=8, textColor=MUTED, alignment=1)
    ))

    doc.build(story)
    return buf.getvalue()
