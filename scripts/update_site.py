import json
import re
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
DATA = ROOT / "data" / "due-dates.json"

text = INDEX.read_text(encoding="utf-8")
data = json.loads(DATA.read_text(encoding="utf-8"))
updated = data.get("updated") or datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%-d %B %Y")
today = datetime.now(ZoneInfo("Asia/Kolkata")).date()

text = re.sub(
    r'<a href="https://mail\.zoho\.com/" target="_blank" class="admin-login">Admin Login</a>',
    '<a href="http://100.88.161.44:8080/" target="_blank" rel="noopener" class="admin-login">Admin Login</a>',
    text,
    count=1,
)

# Cache-bust the dynamic date-status code on every generated site refresh.
text = re.sub(
    r'<script src="scripts/latest-updates\.js(?:\?[^\"]*)?" defer></script>',
    '<script src="scripts/latest-updates.js?v=20260915-due-status3" defer></script>',
    text,
    count=1,
)

overview_css = '<link rel="stylesheet" href="styles/firm-overview.css?v=20260814-2">'
if overview_css not in text:
    text = text.replace('</head>', '    ' + overview_css + '\n</head>', 1)

overview = '''            <div class="firm-overview" aria-labelledby="firm-overview-title">
                <p class="eyebrow">Professional Overview</p>
                <h2 id="firm-overview-title">Kamal Kuldeep &amp; Associates</h2>
                <p>We are a firm of Chartered Accountants based in Jalandhar, Punjab, providing professional services in audit, taxation, accounting and regulatory compliance.</p>
                <p>Our professional work encompasses statutory and internal audit assignments, taxation and GST compliance, financial reporting, due diligence and other professional engagements across a range of sectors.</p>
                <p>Our approach is centred on professional integrity, confidentiality, technical diligence and a practical understanding of the requirements of each engagement.</p>
            </div>\n\n'''
if 'id="firm-overview-title"' not in text:
    marker = '        <div class="content">'
    if marker not in text:
        raise SystemExit("Could not locate content container in index.html")
    text = text.replace(marker, marker + '\n' + overview, 1)


def parse_due_date(value):
    if not value:
        return None
    match = re.search(r'\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b', str(value))
    if not match:
        return None
    try:
        return datetime.strptime(match.group(0), "%d %B %Y").date()
    except ValueError:
        return None


items = []
for item in data.get("items", []):
    category = item.get("category", "")
    badge = {
        "GST": "badge-gst",
        "Income Tax": "badge-income-tax",
        "TDS": "badge-tds",
        "Tax Audit": "badge-tax-audit",
    }.get(category, "badge-gst")
    due_date = parse_due_date(item.get("date"))
    if due_date == today:
        status = "⚠️ Due Today"
    elif due_date and due_date < today:
        status = "⚠️ Overdue"
    elif item.get("urgent"):
        status = "⚠️ Upcoming"
    else:
        status = ""
    urgent = (
        '<div class="urgent-notice" style="margin-top:0.75rem;padding:0.6rem;">'
        f'<strong>{status}</strong></div>' if status else ""
    )
    extended = '<span class="extension-badge">EXTENDED</span>' if item.get("extended") else ""
    source_link = item.get("source")
    read_more = (
        f' <a href="{source_link}" target="_blank" rel="noopener noreferrer" class="due-date-read-more">Read more</a>'
        if item.get("extended") and source_link else ""
    )
    items.append(f'''                        <div class="due-date-card">
                            <h4>{item.get("title", "")}
                                <span class="category-badge {badge}">{category}</span>
                                {extended}
                            </h4>
                            <div class="date">{item.get("date", "")}</div>
                            <div class="description">{item.get("description", "")}{read_more}</div>
                            {urgent}
                        </div>''')

extension = data.get("extension_notice", {})
extension_html = ""
if extension:
    source = extension.get("source", "")
    extension_html = f'''                    <div class="deadline-extension-notice" role="note">
                        <div class="deadline-extension-heading">
                            <span class="extension-badge">EXTENDED</span>
                            <strong>{extension.get("title", "Due date extended")}</strong>
                        </div>
                        <p>{extension.get("text", "")}</p>
                        {f'<a href="{source}" target="_blank" rel="noopener noreferrer" class="extension-read-more">Read more on Income Tax Department notification →</a>' if source else ""}
                    </div>
'''

section = f'''            <section id="due-dates" class="section">
                <div class="due-dates-section">
                    <h3>📅 Important Due Dates</h3>
                    <div class="urgent-notice">
                        <strong>⚠️ Compliance Notice:</strong>
                        <p>{data.get("notice", "Please verify applicable due dates on official portals.")}</p>
                    </div>
{extension_html}                    <div class="due-dates-grid">
{chr(10).join(items)}
                    </div>
                    <div class="update-info">
                        📌 Last updated: {updated}. Due dates may change by notification or extension.<br>
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

# Add/update styles for the extension notice and the dedicated Tax Audit badge.
style_block = '''
        .badge-tax-audit {
            background-color: #b45309;
            color: white;
        }

        .extension-badge {
            display: inline-block;
            padding: 3px 9px;
            border-radius: 999px;
            background: #dc2626;
            color: #fff;
            font-size: 0.68rem;
            font-weight: 800;
            letter-spacing: 0.04em;
            vertical-align: middle;
            margin-left: 8px;
        }

        .deadline-extension-notice {
            margin: 1rem 0 1.25rem;
            padding: 1rem 1.15rem;
            border: 1px solid #f59e0b;
            border-left: 5px solid #dc2626;
            border-radius: 8px;
            background: #fff7ed;
        }

        .deadline-extension-heading {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #7c2d12;
            font-size: 1rem;
        }

        .deadline-extension-heading .extension-badge {
            margin-left: 0;
        }

        .deadline-extension-notice p {
            margin: 0.6rem 0;
            color: #7c2d12;
            line-height: 1.55;
        }

        .extension-read-more,
        .due-date-read-more {
            color: #1e3c72;
            font-weight: 700;
            text-decoration: underline;
        }

        .due-date-read-more {
            margin-left: 4px;
            white-space: nowrap;
        }
'''
if '.badge-tax-audit {' not in text:
    text = text.replace('        .due-date-card .date {', style_block + '\n        .due-date-card .date {', 1)

for pattern in [r'Last Updated\s*:\s*[^<\n]*', r'Last Updated\s*-\s*[^<\n]*']:
    text, count = re.subn(pattern, f'Last Updated: {updated}', text, count=1, flags=re.I)
    if count:
        break

INDEX.write_text(text, encoding="utf-8")
print(f"Website updated from data/due-dates.json; Last Updated = {updated}; Today = {today}")
