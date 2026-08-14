import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "due-dates.json"

# Only official government sources. A public date is changed only when an
# official source contains an explicit extension/change from the currently
# published date to a different date.
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
    "GSTR-5 / GSTR-5A": ["GSTR-5", "GSTR-5A"],
    "TDS Certificate (Form 16A)": ["FORM 16A", "FORM-16A", "TDS CERTIFICATE"],
    "ITR – AY 2026-27 (eligible non-audit cases)": ["ITR", "139(1)", "NON-AUDIT"],
    "ITR – AY 2026-27 (audit cases)": ["ITR", "AUDIT"],
    "Advance Tax – Q2": ["ADVANCE TAX", "SECOND INSTALMENT", "SECOND INSTALLMENT"],
    "TDS Payment": ["TDS", "DEPOSIT", "PAYMENT"],
}


def fetch(url):
    req = Request(url, headers={"User-Agent": "KKA-Due-Date-Discovery/2.0"})
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
    # Deliberately require explicit language such as "from X to Y". This
    # prevents ordinary page changes or unrelated dates from being published.
    pattern = re.compile(
        rf"\b(?:from|extended from)\s+({date_re})\s+(?:to|till|until)\s+({date_re})\b",
        re.I,
    )
    return [(m.group(1), m.group(2), m.start(), m.end()) for m in pattern.finditer(text)]


def discover():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    original = json.dumps(data, sort_keys=True, ensure_ascii=False)
    detected = []

    for source_name, url in SOURCES.items():
        try:
            text = clean_html(fetch(url))
        except Exception as exc:
            print(f"{source_name}: source unavailable; no public update: {exc}")
            continue

        pairs = extract_extension_pairs(text)
        for item in data.get("items", []):
            title = item.get("title", "")
            aliases = FORM_ALIASES.get(title, [title])
            current = parse_date(item.get("date", ""))
            if not current:
                continue

            for old_raw, new_raw, start, end in pairs:
                context = text[max(0, start - 900):min(len(text), end + 900)].upper()
                if not any(alias.upper() in context for alias in aliases):
                    continue

                old_date = parse_date(old_raw)
                new_date = parse_date(new_raw)
                if old_date and new_date and old_date == current and new_date != current:
                    new_display = new_date.strftime("%d %B %Y").lstrip("0")
                    item["date"] = new_display
                    item["source"] = url
                    item["change_verified"] = True
                    detected.append({
                        "title": title,
                        "old_date": item.get("date_before_change", old_raw),
                        "new_date": new_display,
                        "source": url,
                    })
                    break

    # Footer/public update date changes ONLY when a real due-date change was
    # actually detected. A normal midnight check leaves it untouched.
    if detected:
        data["updated"] = datetime.now(timezone.utc).astimezone().strftime("%-d %B %Y")
        DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("VERIFIED DUE-DATE CHANGE:")
        print(json.dumps(detected, indent=2, ensure_ascii=False))
    else:
        print("NO VERIFIED DUE-DATE CHANGE. Public due dates and footer remain unchanged.")


if __name__ == "__main__":
    discover()
