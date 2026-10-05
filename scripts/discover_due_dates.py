import json
import re
from datetime import datetime, date
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "due-dates.json"
LATEST_UPDATES = ROOT / "data" / "latest-updates.json"

SOURCES = {
    "Income Tax": "https://www.incometax.gov.in/iec/foportal/latest-news",
    "TDS": "https://traces61contents.tdscpc.gov.in/en/circulars-notifications-instructions.html",
    "GST": "https://www.gst.gov.in/newsandupdates",
}

FORM_ALIASES = {
    "GSTR-3B": ["GSTR-3B"],
    "GSTR-1": ["GSTR-1"],
    "GSTR-5": ["GSTR-5"],
    "GSTR-5A": ["GSTR-5A"],
    "GSTR-6": ["GSTR-6"],
    "GSTR-7": ["GSTR-7"],
    "GSTR-8": ["GSTR-8"],
    "IFF (Optional)": ["IFF"],
    "CMP-08": ["CMP-08", "CMP 08"],
    "GSTR-1 (Quarterly)": ["GSTR-1"],
    "GSTR-3B (Quarterly)": ["GSTR-3B"],
    "TDS Certificate (Form 16A)": ["FORM 16A", "TDS CERTIFICATE"],
    "Form 138 – TDS Return (Salary)": ["FORM 138", "FORM 24Q", "24Q"],
    "Form 140 – TDS Return (Non-Salary)": ["FORM 140", "FORM 26Q", "26Q"],
    "TDS Payment": ["TDS", "DEPOSIT", "PAYMENT"],
    "ITR – AY 2026-27 (eligible non-audit cases)": ["ITR", "139(1)", "NON-AUDIT"],
    "ITR – AY 2026-27 (audit cases)": ["ITR", "AUDIT", "RETURN OF INCOME"],
    "Tax Audit Report – AY 2026-27": ["TAX AUDIT", "AUDIT REPORT", "44AB", "AUDIT CASES"],
    "Advance Tax – Q2": ["ADVANCE TAX", "SECOND INSTALMENT", "SECOND INSTALLMENT"],
    "Advance Tax – Q3": ["ADVANCE TAX", "THIRD INSTALMENT", "THIRD INSTALLMENT"],
}

EXTENSION_KEYWORDS = re.compile(
    r"\b(extend(?:ed|s|ing)?|extension|revised\s+due\s+date|due\s+date.*(?:extended|extension)|time\s+limit.*extended)\b",
    re.I,
)

DATE_PATTERNS = [
    r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}",
    r"\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}",
    r"\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}",
]
DATE_RE = re.compile(r"(?:" + "|".join(DATE_PATTERNS) + r")", re.I)


def fetch_bytes(url):
    host = (urlparse(url).hostname or "").lower()
    if host not in {
        "www.incometax.gov.in", "incometax.gov.in",
        "www.incometaxindia.gov.in", "incometaxindia.gov.in",
        "traces61contents.tdscpc.gov.in", "www.tdscpc.gov.in", "tdscpc.gov.in",
        "www.gst.gov.in", "gst.gov.in",
    }:
        raise ValueError(f"untrusted source host: {host}")
    req = Request(url, headers={"User-Agent": "KKA-Due-Date-Discovery/5.0"})
    with urlopen(req, timeout=45) as response:
        return response.headers.get("Content-Type", ""), response.read()


def clean_html(html):
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_date(value):
    value = str(value).strip().replace("/", "-")
    for fmt in ("%d-%m-%Y", "%d-%m-%y", "%d %B %Y", "%d-%b-%Y", "%d %b %Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    return None


def display_date(value):
    return value.strftime("%-d %B %Y")


def last_day(year, month):
    if month == 12:
        nxt = date(year + 1, 1, 1)
    else:
        nxt = date(year, month + 1, 1)
    return (nxt - date.resolution).day


def add_months(year, month, amount):
    index = year * 12 + (month - 1) + amount
    return index // 12, index % 12 + 1


def monthly_due(year, month, day):
    return date(year, month, min(day, last_day(year, month)))


def next_monthly_due(today, day):
    y, m = add_months(today.year, today.month, 1)
    return monthly_due(y, m, day)


def quarter_info(today):
    q = (today.month - 1) // 3
    quarter_end_month = q * 3 + 3
    filing_year, filing_month = add_months(today.year, quarter_end_month, 1)
    return today.year, quarter_end_month, filing_year, filing_month


def quarter_label(year, quarter_end_month):
    start_month = quarter_end_month - 2
    return f"{date(year, start_month, 1).strftime('%B')}–{date(year, quarter_end_month, 1).strftime('%B')} {year}"


def previous_month_label(due_date):
    y, m = add_months(due_date.year, due_date.month, -1)
    return date(y, m, 1).strftime("%B %Y")


def set_generated(item, due, description, source, marker):
    item["date"] = display_date(due)
    item["description"] = description
    item["source"] = source
    item[marker] = True


def roll_gst_recurring_dates(data, today):
    by_title = {item.get("title"): item for item in data.get("items", [])}
    changed = []
    monthly_rules = {
        "GSTR-7": (10, "Monthly GSTR-7 for the preceding month."),
        "GSTR-8": (10, "Monthly GSTR-8 for the preceding month for applicable e-commerce operators."),
        "GSTR-1": (11, "Monthly GSTR-1 for the preceding month for monthly filers."),
        "IFF (Optional)": (13, "Optional Invoice Furnishing Facility for the applicable month."),
        "GSTR-5": (13, "Monthly GSTR-5 for the preceding month for applicable non-resident taxpayers."),
        "GSTR-6": (13, "Monthly GSTR-6 for the preceding month for applicable input service distributors."),
        "GSTR-3B": (20, "Monthly GSTR-3B for the preceding month for regular monthly filers."),
        "GSTR-5A": (20, "Monthly GSTR-5A for the preceding month for applicable OIDAR service providers."),
    }
    for title, (day, description) in monthly_rules.items():
        item = by_title.get(title)
        if not item:
            continue
        current = parse_date(item.get("date", ""))
        if current is None or current < today:
            due = next_monthly_due(today, day)
            if current != due:
                set_generated(item, due, description, "https://www.gst.gov.in/", "generated_from_gst_rule")
                changed.append((title, current, due))

    year, quarter_end_month, filing_year, filing_month = quarter_info(today)
    label = quarter_label(year, quarter_end_month)
    q1 = by_title.get("GSTR-1 (Quarterly)")
    if q1:
        current = parse_date(q1.get("date", ""))
        due = monthly_due(filing_year, filing_month, 13)
        if current is None or current < today:
            set_generated(q1, due, f"Quarterly GSTR-1 for {label} for QRMP taxpayers.", "https://www.gst.gov.in/", "generated_from_gst_rule")
            changed.append(("GSTR-1 (Quarterly)", current, due))
    q3 = by_title.get("GSTR-3B (Quarterly)")
    if q3:
        current = parse_date(q3.get("date", "").split("/")[0].strip())
        due22 = monthly_due(filing_year, filing_month, 22)
        due24 = monthly_due(filing_year, filing_month, 24)
        display = f"{display_date(due22)} / {display_date(due24)}"
        if current is None or current < today:
            q3["date"] = display
            q3["description"] = f"Quarterly GSTR-3B for {label}; 22nd or 24th depending on the applicable State/UT."
            q3["source"] = "https://www.gst.gov.in/"
            q3["generated_from_gst_rule"] = True
            changed.append(("GSTR-3B (Quarterly)", current, display))
    cmp = by_title.get("CMP-08")
    if cmp:
        current = parse_date(cmp.get("date", ""))
        due = monthly_due(filing_year, filing_month, 18)
        if current is None or current < today:
            set_generated(cmp, due, f"CMP-08 for {label} for applicable composition taxpayers.", "https://www.gst.gov.in/", "generated_from_gst_rule")
            changed.append(("CMP-08", current, due))
    return changed


def roll_tds_recurring_dates(data, today):
    by_title = {item.get("title"): item for item in data.get("items", [])}
    changed = []
    payment = by_title.get("TDS Payment")
    if payment:
        current = parse_date(payment.get("date", ""))
        due = next_monthly_due(today, 7)
        if current is None or current < today:
            payment["date"] = display_date(due)
            payment["description"] = f"Deposit TDS deducted during {previous_month_label(due)} by {display_date(due)}. This is the monthly TDS payment deadline, not the quarterly TDS return filing deadline."
            payment["source"] = "https://www.incometax.gov.in/"
            payment["generated_from_tds_rule"] = True
            changed.append(("TDS Payment", current, due))

    year, quarter_end_month, filing_year, filing_month = quarter_info(today)
    quarterly_due = monthly_due(filing_year, filing_month, 31)
    quarterly_rules = {
        "Form 138 – TDS Return (Salary)": "Quarterly TDS statement in Form 138 (earlier Form 24Q) for salary TDS.",
        "Form 140 – TDS Return (Non-Salary)": "Quarterly TDS statement in Form 140 (earlier Form 26Q) for non-salary resident payments.",
    }
    for title, base_description in quarterly_rules.items():
        item = by_title.get(title)
        if not item:
            continue
        current = parse_date(item.get("date", ""))
        if current is None or current < today:
            quarter_end = date(year, quarter_end_month, last_day(year, quarter_end_month))
            item["date"] = display_date(quarterly_due)
            item["description"] = f"{base_description} for the quarter ending {display_date(quarter_end)}. Due by {display_date(quarterly_due)}."
            item["source"] = "https://www.incometax.gov.in/"
            item["generated_from_tds_rule"] = True
            changed.append((title, current, quarterly_due))
    return changed


def extract_extension_pairs(text):
    pairs = []
    # Handles the common official wording: "from 30 September 2026 to 21 October 2026".
    date_re = "(?:" + "|".join(DATE_PATTERNS) + ")"
    patterns = [
        rf"(?:from|with\s+effect\s+from)\s+({date_re})\s+(?:to|till|until)\s+({date_re})",
        rf"(?:extended|revised)[^.\n]{{0,220}}?\bto\s+({date_re})",
        rf"(?:due\s+date|date\s+for\s+furnishing)[^.\n]{{0,180}}?\b(?:shall\s+be|is\s+extended\s+to|extended\s+up\s+to)\s+({date_re})",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.I):
            if len(match.groups()) == 2:
                pairs.append((match.group(1), match.group(2), match.start(), match.end()))
            else:
                # For one-date wording, use the nearest earlier date in context as the old date.
                new_raw = match.group(1)
                before = text[max(0, match.start() - 300):match.start()]
                dates = list(DATE_RE.finditer(before))
                if dates:
                    pairs.append((dates[-1].group(0), new_raw, match.start(), match.end()))
    return pairs


def pdf_text(pdf_bytes):
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""
    try:
        from io import BytesIO
        reader = PdfReader(BytesIO(pdf_bytes))
        return " ".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        print(f"PDF parsing skipped: {exc}")
        return ""


def source_text(url):
    content_type, body = fetch_bytes(url)
    if "pdf" in content_type.lower() or url.lower().endswith(".pdf") or url.lower().endswith("-pdf"):
        return pdf_text(body), url
    html = body.decode("utf-8", errors="ignore")
    text = clean_html(html)
    # Many government notification landing pages contain a direct PDF link.
    links = re.findall(r"(?:href|src)=[\"']([^\"']+)[\"']", html, flags=re.I)
    for link in links:
        candidate = urljoin(url, link)
        if not re.search(r"\.pdf(?:$|[?#])|-pdf(?:$|[?#])", candidate, re.I):
            continue
        try:
            ctype, pdf = fetch_bytes(candidate)
            if "pdf" in ctype.lower() or pdf[:4] == b"%PDF":
                parsed = pdf_text(pdf)
                if parsed:
                    return parsed, candidate
        except Exception:
            continue
    return text, url


def load_latest_updates():
    if not LATEST_UPDATES.exists():
        return []
    try:
        payload = json.loads(LATEST_UPDATES.read_text(encoding="utf-8"))
        return payload.get("items", [])
    except Exception as exc:
        print(f"Latest-updates data unavailable: {exc}")
        return []


def candidate_notifications():
    candidates = []
    for item in load_latest_updates():
        title = item.get("title", "")
        source = item.get("source", "")
        if source != "Income Tax Department":
            continue
        if EXTENSION_KEYWORDS.search(title) or re.search(r"\b(ITR|income tax return|audit|tax audit|AY\s*2026-27)\b", title, re.I):
            url = item.get("url")
            if url:
                candidates.append((title, url))
    return candidates


def detect_official_extensions(data):
    detected = []
    candidates = candidate_notifications()
    # Also keep the three official source pages as a fallback when the latest-updates
    # collector has not yet refreshed.
    candidates.extend((name, url) for name, url in SOURCES.items() if name == "Income Tax")
    seen = set()
    for candidate_title, url in candidates:
        if url in seen:
            continue
        seen.add(url)
        try:
            text, verified_source = source_text(url)
        except Exception as exc:
            print(f"Extension check skipped for {url}: {exc}")
            continue
        if not EXTENSION_KEYWORDS.search(text) and not EXTENSION_KEYWORDS.search(candidate_title):
            continue
        upper = text.upper()
        pairs = extract_extension_pairs(text)
        for item in data.get("items", []):
            title = item.get("title", "")
            aliases = FORM_ALIASES.get(title, [title])
            current = parse_date(item.get("date", ""))
            if not current:
                continue
            original = parse_date(item.get("original_date", ""))
            for old_raw, new_raw, start, end in pairs:
                old_date = parse_date(old_raw)
                new_date = parse_date(new_raw)
                if not old_date or not new_date or old_date == new_date:
                    continue
                context = upper[max(0, start - 1600):min(len(upper), end + 1600)]
                alias_match = any(alias.upper() in context for alias in aliases)
                title_match = any(alias.upper() in candidate_title.upper() for alias in aliases)
                if not (alias_match or title_match):
                    continue
                # Accept a notification that extends either the current date or the
                # statutory original date. This prevents a second extension from being missed.
                if old_date not in {current, original}:
                    continue
                item["date"] = display_date(new_date)
                item["extended"] = True
                item["change_verified"] = True
                item["source"] = verified_source
                if not original:
                    item["original_date"] = display_date(old_date)
                item["description"] = f"Extended due date for {title}. Original due date: {display_date(original or old_date)}."
                detected.append({"title": title, "old_date": display_date(old_date), "new_date": display_date(new_date), "source": verified_source})
                break
    return detected


def update_extension_notice(data, detected):
    if not detected:
        return
    source = detected[0]["source"]
    parts = []
    for change in detected:
        parts.append(f"{change['title']} due date has been extended from {change['old_date']} to {change['new_date']}.")
    data["extension_notice"] = {
        "title": "Official due-date extension detected",
        "text": " ".join(parts),
        "source": source,
        "verified": True,
    }


def discover():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    original = json.dumps(data, sort_keys=True, ensure_ascii=False)
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()

    generated = roll_gst_recurring_dates(data, today)
    tds_generated = roll_tds_recurring_dates(data, today)
    extensions = detect_official_extensions(data)
    update_extension_notice(data, extensions)

    # Record statutory originals so later extensions can be detected even when
    # the current due date has already been extended once.
    for item in data.get("items", []):
        if item.get("extended") and not item.get("original_date"):
            match = re.search(r"Original due date:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})", item.get("description", ""))
            if match:
                item["original_date"] = match.group(1)

    final = json.dumps(data, sort_keys=True, ensure_ascii=False)
    if final != original:
        data["updated"] = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%-d %B %Y")
        DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"GST recurring updates: {len(generated)}")
        print(f"TDS recurring updates: {len(tds_generated)}")
        if extensions:
            print("Verified official extensions:")
            print(json.dumps(extensions, indent=2, ensure_ascii=False))
    else:
        print("No due-date changes detected.")


if __name__ == "__main__":
    discover()
