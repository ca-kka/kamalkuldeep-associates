import importlib.util
from datetime import date
from pathlib import Path

SCRIPT = Path(__file__).with_name("roll_advance_tax.py")
spec = importlib.util.spec_from_file_location("roll_advance_tax", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def dates(today):
    data = {"items": []}
    module.upsert_advance_tax(data, today)
    items = {item["title"]: item for item in data["items"]}
    return items


# On 15 Sep 2026, Q2 is due today and Q3 is the next instalment.
items = dates(date(2026, 9, 15))
assert items["Advance Tax – Q2"]["date"] == "15 September 2026"
assert items["Advance Tax – Q2"]["urgent"] is True
assert items["Advance Tax – Q3"]["date"] == "15 December 2026"
assert items["Advance Tax – Q3"]["urgent"] is False

# From 16 Sep, Q2 rolls to the next FY while Q3 becomes the next/current deadline.
items = dates(date(2026, 9, 16))
assert items["Advance Tax – Q2"]["date"] == "15 September 2027"
assert items["Advance Tax – Q2"]["urgent"] is False
assert items["Advance Tax – Q3"]["date"] == "15 December 2026"
assert items["Advance Tax – Q3"]["urgent"] is False

# After Q3, it rolls to the next FY and Q2 remains the next instalment.
items = dates(date(2026, 12, 16))
assert items["Advance Tax – Q2"]["date"] == "15 September 2027"
assert items["Advance Tax – Q3"]["date"] == "15 December 2027"

print("Advance-tax rollover tests passed.")
