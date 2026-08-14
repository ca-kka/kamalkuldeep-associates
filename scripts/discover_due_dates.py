import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "due-dates.json"
REPORT = ROOT / "data" / "due-date-discovery.json"

SOURCES = {
    "Income Tax": "https://www.incometax.gov.in/iec/foportal/",
    "GST": "https://www.gst.gov.in/",
    "TDS": "https://www.tdscpc.gov.in/",
}

KEYWORDS = [
    "due date", "due dates", "extension", "extended", "last date",
    "GSTR-1", "GSTR-3B", "TDS", "Form 16A", "ITR", "advance tax"
]


def fetch(url):
    req = Request(url, headers={"User-Agent": "KKA-Due-Date-Discovery/1.0"})
    with urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8", errors="ignore")


def clean_html(html):
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def discover():
    previous = {}
    if REPORT.exists():
        try:
            previous = json.loads(REPORT.read_text(encoding="utf-8"))
        except Exception:
            previous = {}

    results = {}
    changed = []

    for name, url in SOURCES.items():
        result = {"url": url, "ok": False, "changed": False, "keyword_hits": [], "error": None}
        try:
            html = fetch(url)
            text = clean_html(html)
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            old_digest = previous.get("sources", {}).get(name, {}).get("sha256")
            result["ok"] = True
            result["sha256"] = digest
            result["changed"] = bool(old_digest and old_digest != digest)
            result["keyword_hits"] = [k for k in KEYWORDS if k.lower() in text.lower()]
            if result["changed"]:
                changed.append(name)
        except Exception as exc:
            result["error"] = str(exc)
        results[name] = result

    report = {
        "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "checked_at_ist": datetime.now(timezone.utc).astimezone().isoformat(),
        "changed_sources": changed,
        "note": "This is a discovery/change-detection pass. Official-source changes are not silently published to the public due-date list unless they can be validated against the applicable return/category.",
        "sources": results,
    }
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    discover()
