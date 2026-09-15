import json
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "due-dates.json"
IST = ZoneInfo("Asia/Kolkata")


def advance_tax_schedule(financial_year_start):
    """Return statutory advance-tax instalments for an FY.

    FY 2026-27 => 15 Jun 2026, 15 Sep 2026, 15 Dec 2026, 15 Mar 2027.
    The same schedule is derived for future FYs; it is never hard-coded to
    the current calendar year.
    """
    y = financial_year_start
    return [
        ("Q1", date(y, 6, 15), 15, "First instalment"),
        ("Q2", date(y, 9, 15), 45, "Second instalment"),
        ("Q3", date(y, 12, 15), 75, "Third instalment"),
        ("Q4", date(y + 1, 3, 15), 100, "Fourth and final instalment"),
    ]


def current_fy_start(today):
    return today.year if today.month >= 4 else today.year - 1


def display_date(d):
    return d.strftime("%-d %B %Y")


def upsert_advance_tax(data, today):
    fy_start = current_fy_start(today)
    schedule = advance_tax_schedule(fy_start)
    items = data.setdefault("items", [])
    by_title = {item.get("title"): item for item in items}

    changed = False
    for quarter, due, cumulative, label in schedule:
        title = f"Advance Tax – {quarter}"
        item = by_title.get(title)
        if item is None:
            item = {"title": title, "category": "Income Tax"}
            items.append(item)
            by_title[title] = item
            changed = True

        description = (
            f"{label} of advance tax for FY {fy_start}-{str(fy_start + 1)[-2:]}, "
            f"generally {cumulative}% of estimated annual tax liability cumulatively by {display_date(due)}."
        )
        urgent = due >= today and (due - today).days <= 1
        values = {
            "date": display_date(due),
            "description": description,
            "urgent": urgent,
            "source": "https://www.incometax.gov.in/",
            "generated_from_advance_tax_rule": True,
        }
        for key, value in values.items():
            if item.get(key) != value:
                item[key] = value
                changed = True

    return changed


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    today = datetime.now(IST).date()
    changed = upsert_advance_tax(data, today)
    if changed:
        data["updated"] = datetime.now(IST).strftime("%-d %B %Y")
        data["generator_version"] = "2026-09-15-advance-tax-dynamic"
        DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Advance-tax schedule refreshed for FY starting {current_fy_start(today)}.")
    else:
        print("Advance-tax schedule already current.")


if __name__ == "__main__":
    main()
