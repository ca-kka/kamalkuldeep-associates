import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
DATA = ROOT / "data" / "due-dates.json"

text = INDEX.read_text(encoding="utf-8")
data = json.loads(DATA.read_text(encoding="utf-8"))

# Keep the existing site intact and replace only the Admin Login target.
text = re.sub(
    r'<a href="https://mail\.zoho\.com/" target="_blank" class="admin-login">Admin Login</a>',
    '<a href="http://100.88.161.44:8080/" target="_blank" rel="noopener" class="admin-login">Admin Login</a>',
    text,
    count=1,
)

items = []
for item in data.get("items", []):
    badge = {
        "GST": "badge-gst",
        "Income Tax": "badge-income-tax",
        "TDS": "badge-tds",
    }.get(item.get("category"), "badge-gst")
    urgent = '<div class="urgent-notice" style="margin-top:0.75rem;padding:0.6rem;"><strong>⚠️ Upcoming</strong></div>' if item.get("urgent") else ""
    items.append(f'''                        <div class="due-date-card">
                            <h4>{item.get("title", "")}
                                <span class="category-badge {badge}">{item.get("category", "")}</span>
                            </h4>
                            <div class="date">{item.get("date", "")}</div>
                            <div class="description">{item.get("description", "")}</div>
                            {urgent}
                        </div>''')

section = f'''            <section id="due-dates" class="section">
                <div class="due-dates-section">
                    <h3>📅 Important Due Dates</h3>
                    <div class="urgent-notice">
                        <strong>⚠️ Compliance Notice:</strong>
                        <p>{data.get("notice", "Please verify applicable due dates on official portals.")}</p>
                    </div>
                    <div class="due-dates-grid">
{chr(10).join(items)}
                    </div>
                    <div class="update-info">
                        📌 Last updated: {data.get("updated", "")}. Due dates may change by notification or extension.<br>
                        💼 For assistance with compliance, contact us at +91-98156-81778
                    </div>
                </div>

                <div class="highlight-box" style="margin-top: 2rem;">
                    <h3>📢 Important Links</h3>
                    <ul class="experience-list">
                        <li><strong>GST Portal:</strong> <a href="https://www.gst.gov.in" target="_blank" style="color: #1e3c72;">www.gst.gov.in</a></li>
                        <li><strong>Income Tax e-Filing:</strong> <a href="https://www.incometax.gov.in" target="_blank" style="color: #1e3c72;">www.incometax.gov.in</a></li>
                        <li><strong>TDS/TCS Portal:</strong> <a href="https://www.tdscpc.gov.in" target="_blank" style="color: #1e3c72;">www.tdscpc.gov.in</a></li>
                    </ul>
                </div>
            </section>'''

text, n = re.subn(r'            <section id="due-dates" class="section">.*?            </section>\n\n            <section id="contact"', section + '\n\n            <section id="contact"', text, count=1, flags=re.S)
if n != 1:
    raise SystemExit("Could not locate due-dates section")

text = re.sub(
    r'Last Updated: October 25, 2025',
    f'Last Updated: {data.get("updated", "")}',
    text,
    count=1,
)

INDEX.write_text(text, encoding="utf-8")
print("Website updated from data/due-dates.json")
