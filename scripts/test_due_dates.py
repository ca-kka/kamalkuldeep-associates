import importlib.util
from datetime import date
from pathlib import Path

SCRIPT = Path(__file__).with_name("discover_due_dates.py")
spec = importlib.util.spec_from_file_location("discover_due_dates", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def check(today, initial_payment, initial_q138, initial_q140, expected_payment, expected_q138, expected_q140):
    data = {
        "items": [
            {"title": "TDS Payment", "date": initial_payment},
            {"title": "Form 138 – TDS Return (Salary)", "date": initial_q138},
            {"title": "Form 140 – TDS Return (Non-Salary)", "date": initial_q140},
        ]
    }
    module.roll_tds_recurring_dates(data, today)
    items = {item["title"]: item for item in data["items"]}
    assert items["TDS Payment"]["date"] == expected_payment
    assert items["Form 138 – TDS Return (Salary)"]["date"] == expected_q138
    assert items["Form 140 – TDS Return (Non-Salary)"]["date"] == expected_q140


# September 2026: August TDS is due 7 October; Q2 returns are due 31 October.
check(date(2026, 9, 8), "7 September 2026", "31 July 2026", "31 July 2026", "7 October 2026", "31 October 2026", "31 October 2026")

# October 2026 after the 7th: September TDS rolls to 7 November, while Q2 returns remain due 31 October.
check(date(2026, 10, 8), "7 October 2026", "31 October 2026", "31 October 2026", "7 November 2026", "31 October 2026", "31 October 2026")

# November 2026: October TDS is due 7 December; Q3 returns roll to 31 January 2027.
check(date(2026, 11, 8), "7 November 2026", "31 October 2026", "31 October 2026", "7 December 2026", "31 January 2027", "31 January 2027")

print("Due-date rollover tests passed.")
