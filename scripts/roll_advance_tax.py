import json
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "due-dates.json"
IST = ZoneInfo("Asia/Kolkata")


def advance_tax_schedule(financial_year_start):
    """Return the Q2/Q3/Q4 advance-tax deadlines used by the public due-date panel."""
    y = financial_year_start
    return [
        ("Q2", date(y, 9, 15), 45, "Second instalment"),
        ("Q3", date(y, 12, 15), 75, "Third instalment"),
        ("Q4", date(y + 1, 3, 15), 100, "Fourth instalment"),
    ]


def current_fy_start(today):
    return today.year if today.month >= 4 else today.year - 1


def display_date(d):
    return d.strftime("%-d %B %Y")


def next_display_deadline(today):
    """Return only the active/next Q2/Q3/Q4 deadline for the public panel."""
    fy_start = current_fy_start(today)

    # The public panel intentionally begins with Q2 and then rolls Q2 -> Q3 -> Q4.
    for quarter, due, cumulative, label in advance_tax_schedule(fy_start):
        if due >= today:
            return quarter, due, cumulative, label, fy_start

    # After Q4, restart at Q2 of the following FY for the public panel.
    next_fy = fy_start + 1
    quarter, due, cumulative, label = advance_tax_schedule(next_fy)[0]
    return quarter, due, cumulative, label, next_fy


def upsert_advance_tax(data, today):
    items = data.setdefault("items", [])
    selected_quarter, due, cumulative, label, fy_start = next_display_deadline(today)
    advance_titles = {f"Advance Tax – {q}" for q in ("Q2", "Q3", "Q4")}
    selected_title = f"Advance Tax – {selected_quarter}"

    # Remove all other advance-tax cards so exactly one is shown publicly.
    existing = [item for item in items if item.get("title") in advance_titles]
    first_index = next((i for i, item in enumerate(items) if item.get("title") in advance_titles), len(items))
    retained = [item for item in items if item.get("title") not in advance_titles]

    item = next((item for item in existing if item.get("title") == selected_title), None)
    if item is None:
        item = {"title": selected_title, "category": "Income Tax"}

    description = (
        f"{label} of advance tax for FY {fy_start}-{str(fy_start + 1)[-2:]}, "
        f"generally {cumulative}% of estimated annual tax liability cumulatively by {display_date(due)}."
    )
    values = {
        "title": selected_title,
        "category": "Income Tax",
        "date": display_date(due),
        "description": description,
        "urgent": due == today,
        "source": "https://www.incometax.gov.in/",
        "generated_from_advance_tax_rule": True,
    }

    changed = len(existing) != 1 or any(existing_item.get("title") != selected_title for existing_item in existing)
    for key, value in values.items():
        if item.get(key) != value:
            item[key] = value
            changed = True

    retained.insert(min(first_index, len(retained)), item)
    if retained != items:
        changed = True
    data["items"] = retained
    return changed


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    today = datetime.now(IST).date()
    changed = upsert_advance_tax(data, today)
    if changed:
        data["updated"] = datetime.now(IST).strftime("%-d %B %Y")
        data["generator_version"] = "2026-09-15-advance-tax-q4"
        DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Advance-tax panel refreshed for {today.isoformat()}.")
    else:
        print("Advance-tax panel already current.")


if __name__ == "__main__":
    main()
