import importlib.util
from datetime import date
from pathlib import Path

SCRIPT = Path(__file__).with_name("roll_advance_tax.py")
spec = importlib.util.spec_from_file_location("roll_advance_tax", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def titles(today):
    data = {"items": []}
    module.upsert_advance_tax(data, today)
    return [item["title"] for item in data["items"] if item.get("title", "").startswith("Advance Tax")], data


# On 15 Sep 2026, show Q2 only and mark it due today.
shown, data = titles(date(2026, 9, 15))
assert shown == ["Advance Tax – Q2"]
q2 = data["items"][0]
assert q2["date"] == "15 September 2026"
assert q2["urgent"] is True

# From 16 Sep 2026, hide Q2 and show Q3 only.
shown, data = titles(date(2026, 9, 16))
assert shown == ["Advance Tax – Q3"]
q3 = data["items"][0]
assert q3["date"] == "15 December 2026"
assert q3["urgent"] is False

# Q3 remains the only displayed deadline on its due date.
shown, data = titles(date(2026, 12, 15))
assert shown == ["Advance Tax – Q3"]
assert data["items"][0]["urgent"] is True

# From 16 Dec 2026, roll to Q4.
shown, data = titles(date(2026, 12, 16))
assert shown == ["Advance Tax – Q4"]
q4 = data["items"][0]
assert q4["date"] == "15 March 2027"
assert q4["urgent"] is False

# Q4 remains the only displayed deadline on its due date.
shown, data = titles(date(2027, 3, 15))
assert shown == ["Advance Tax – Q4"]
assert data["items"][0]["urgent"] is True

# After Q4, restart at Q2 of the following FY for this public panel.
shown, data = titles(date(2027, 3, 16))
assert shown == ["Advance Tax – Q2"]
assert data["items"][0]["date"] == "15 September 2027"

print("Advance-tax Q2 -> Q3 -> Q4 rollover tests passed.")
