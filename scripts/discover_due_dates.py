import json
import re
from datetime import datetime, date, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "due-dates.json"

# Official sources only. GST recurring dates are generated from the GST
# Portal's published filing rules, while explicit government extensions are
# still detected from official advisories/news.
SOURCES = {
    "Income Tax": "https://www.incometax.gov.in/iec/foportal/latest-news?year=2026",
    "TDS": "https://traces61contents.tdscpc.gov.in/en/circulars-notifications-instructions.html",
    "GST": "https://www.gst.gov.in/newsandupdates",
}

DATE_PATTERNS = [
    r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
    r"\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b",
    r"\b\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}\b",
]

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
    "TDS Certificate (Form 16A)": ["FORM 16A", "FORM-16A", "TDS CERTIFICATE"],
    "ITR – AY 2026-27 (eligible non-audit cases)": ["ITR", "139(1)", "NON-AUDIT"],
    "ITR – AY 2026-27 (audit cases)": ["ITR", "AUDIT"],
    "Advance Tax – Q2": ["ADVANCE TAX", "SECOND INSTALMENT", "SECOND INSTALLMENT"],
    "TDS Payment": ["TDS", "DEPOSIT", "PAYMENT"],
}


def fetch(url):
    req = Request(url, headers={"User-Agent": "KKA-Due-Date-Discovery/3.0"})
    with urlopen(req, timeout=45) as response:
        return response.read().decode("utf-8", errors="ignore")


def clean_html(html):
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_date(value):
    value = value.strip().replace("/", "-")
    for fmt in ("%d-%m-%Y", "%d-%m-%y", "%d %B %Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    return None


def extract_extension_pairs(text):
    date_re = "(?:" + "|".join(DATE_PATTERNS) + ")"
    pattern = re.compile(
        rf"\b(?:from|extended from)\s+({date_re})\s+(?:to|till|until)\s+({date_re})\b",
        re.I,
    )
    return [(m.group(1), m.group(2), m.start(), m.end()) for m in pattern.finditer(text)]


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
    # A monthly return for the current tax month is due in the following month.
    y, m = add_months(today.year, today.month, 1)
    due = monthly_due(y, m, day)
    return due


def next_quarter_end_after(today):
    # Return the quarter containing the current month and its filing month.
    q = (today.month - 1) // 3
    quarter_end_month = q * 3 + 3
    filing_year, filing_month = add_months(today.year, quarter_end_month, 1)
    return today.year, quarter_end_month, filing_year, filing_month


def set_generated(item, due, description):
    item["date"] = due.strftime("%-d %B %Y")
    item["description"] = description
    item["source"] = "https://www.gst.gov.in/"
    item["generated_from_gst_rule"] = True


def roll_gst_recurring_dates(data, today):
    """Keep GST recurring dates current without overwriting a future extension.

    The GST Portal publishes recurring filing rules (for example, monthly
    GSTR-1 on the 11th and monthly GSTR-3B on the 20th). If a stored date has
    already passed, move it to the next applicable tax period. If an official
    extension has created a future date, leave that future date untouched.
    """
    by_title = {item.get("title"): item for item in data.get("items", [])}
    changed = []

    # Monthly returns: the return for the preceding/current tax month is due
    # in the following month. If today's date is past the stored due date,
    # advance to the next month's normal recurring date.
    monthly_rules = {
        "GSTR-7": (10, "Monthly GSTR-7 for the preceding month."),
        "GSTR-8": (10, "Monthly GSTR-8 for the preceding month."),
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
                set_generated(item, due, description)
                changed.append((title, current, due))

    # Quarterly GST returns for the quarter currently in progress.
    _, quarter_end_month, filing_year, filing_month = next_quarter_end_after(today)
    quarter_start_month = quarter_end_month - 2
    quarter_label = f"{date(today.year, quarter_start_month, 1).strftime('%b')}-{date(today.year, quarter_end_month, 1).strftime('%b')} {today.year}"

    q1 = by_title.get("GSTR-1 (Quarterly)")
    if q1:
        due = monthly_due(filing_year, filing_month, 13)
        if parse_date(q1.get("date", "")) is None or parse_date(q1.get("date", "")) < today:
            set_generated(q1, due, f"Quarterly GSTR-1 for {quarter_label} for QRMP taxpayers.")
            changed.append(("GSTR-1 (Quarterly)", None, due))

    q3 = by_title.get("GSTR-3B (Quarterly)")
    if q3:
        # The GST Portal displays 22nd/24th depending on State/UT. Keep both
        # dates visible rather than incorrectly choosing one universally.
        due = monthly_due(filing_year, filing_month, 22)
        display = f"{due.strftime('%-d %B %Y')} / {monthly_due(filing_year, filing_month, 24).strftime('%-d %B %Y')}"
        current_raw = q3.get("date", "")
        if not current_raw or current_raw < today.strftime("%-d %B %Y"):
            q3["date"] = display
            q3["description"] = f"Quarterly GSTR-3B for {quarter_label}; 22nd or 24th depending on the applicable State/UT." 
            q3["source"] = "https://www.gst.gov.in/"
            q3["generated_from_gst_rule"] = True
            changed.append(("GSTR-3B (Quarterly)", current_raw, display))

    # CMP-08 is due on the 18th of the month following the quarter.
    cmp = by_title.get("CMP-08")
    if cmp:
        due = monthly_due(filing_year, filing_month, 18)
        current = parse_date(cmp.get("date", ""))
        if current is None or current < today:
            set_generated(cmp, due, f"CMP-08 for {quarter_label} for applicable composition taxpayers.")
            changed.append(("CMP-08", current, due))

    return changed


def detect_official_extensions(data):
    detected = []
    for source_name, url in SOURCES.items():
        try:
            text = clean_html(fetch(url))
        except Exception as exc:
            print(f"{source_name}: source unavailable; extension check skipped: {exc}")
            continue

        pairs = extract_extension_pairs(text)
        for item in data.get("items", []):
            title = item.get("title", "")
            aliases = FORM_ALIASES.get(title, [title])
            current = parse_date(item.get("date", ""))
            if not current:
                continue

            for old_raw, new_raw, start, end in pairs:
                context = text[max(0, start - 1200):min(len(text), end + 1200)].upper()
                if not any(alias.upper() in context for alias in aliases):
                    continue

                old_date = parse_date(old_raw)
                new_date = parse_date(new_raw)
                if old_date and new_date and old_date == current and new_date != current:
                    new_display = new_date.strftime("%-d %B %Y")
                    item["date"] = new_display
                    item["source"] = url
                    item["change_verified"] = True
                    detected.append({
                        "title": title,
                        "old_date": current.strftime("%-d %B %Y"),
                        "new_date": new_display,
                        "source": url,
                    })
                    break
    return detected


def discover():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    original = json.dumps(data, sort_keys=True, ensure_ascii=False)

    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    generated = roll_gst_recurring_dates(data, today)
    extensions = detect_official_extensions(data)

    final = json.dumps(data, sort_keys=True, ensure_ascii=False)
    if final != original:
        data["updated"] = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%-d %B %Y")
        DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"GST recurring updates: {len(generated)}")
        for title, old, new in generated:
            print(f"  {title}: {old} -> {new}")
        if extensions:
            print("Official extensions:")
            print(json.dumps(extensions, indent=2, ensure_ascii=False))
    else:
        print("No due-date changes detected.")


if __name__ == "__main__":
    discover()
