#!/usr/bin/env python3
import html
import json
import re
import subprocess
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'latest-updates.json'
INDEX = ROOT / 'index.html'

HEADERS = {
    'User-Agent': 'KKA-Official-Updates/1.0 (+https://ca-kka.com/)'
}

ALLOWED_HOSTS = {
    'www.incometax.gov.in', 'incometax.gov.in',
    'www.icai.org', 'icai.org', 'resource.cdn.icai.org',
    'www.rbi.org.in', 'rbi.org.in',
    'www.sebi.gov.in', 'sebi.gov.in'
}

RSS_SOURCES = [
    ('RBI', 'https://www.rbi.org.in/pressreleases_rss.xml'),
    ('RBI', 'https://www.rbi.org.in/notifications_rss.xml'),
    ('SEBI', 'https://www.sebi.gov.in/sebirss.xml'),
]

HTML_SOURCES = [
    ('Income Tax Department', 'https://www.incometax.gov.in/iec/foportal/latest-news', 'income-tax'),
    ('ICAI', 'https://www.icai.org/category/notifications', 'icai'),
    ('ICAI', 'https://www.icai.org/category/announcements', 'icai'),
]


def clean_title(value: str) -> str:
    value = html.unescape(re.sub(r'\s+', ' ', value or '')).strip()
    value = re.sub(r'^\s*[-–—|]+\s*', '', value)
    return value[:240].rstrip(' .') + ('.' if value and not value.endswith(('.', '?', '!')) else '')


def valid_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return parsed.scheme == 'https' and parsed.hostname in ALLOWED_HOSTS
    except Exception:
        return False


def get(url: str) -> str:
    response = requests.get(url, headers=HEADERS, timeout=20)
    response.raise_for_status()
    return response.text


def parse_date(value: str):
    if not value:
        return None
    value = value.strip()
    for fmt in ('%d-%b-%Y', '%d-%m-%Y', '%d/%m/%Y', '%d.%m.%Y'):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    try:
        return parsedate_to_datetime(value).astimezone(timezone.utc)
    except Exception:
        return None


def rss_items(source: str, url: str):
    soup = BeautifulSoup(get(url), 'xml')
    items = []
    for node in soup.find_all(['item', 'entry'])[:12]:
        title_node = node.find('title')
        link_node = node.find('link')
        if not title_node or not link_node:
            continue
        link = link_node.get('href') or link_node.get_text(strip=True)
        link = urljoin(url, link)
        title = clean_title(title_node.get_text(' ', strip=True))
        date_node = node.find(['pubDate', 'published', 'updated'])
        published = parse_date(date_node.get_text(' ', strip=True) if date_node else '')
        if title and valid_url(link):
            items.append({'title': title, 'url': link, 'source': source, '_date': published})
    return items


def income_tax_items(url: str):
    soup = BeautifulSoup(get(url), 'html.parser')
    items = []
    for anchor in soup.find_all('a'):
        label = anchor.get_text(' ', strip=True)
        if label.lower() != 'click here':
            continue
        href = urljoin(url, anchor.get('href') or '')
        if not valid_url(href):
            continue
        parent = anchor.parent
        text = parent.get_text(' ', strip=True) if parent else ''
        text = re.sub(r'\bClick here\b', '', text, flags=re.I).strip(' -|')
        date_match = re.search(r'(\d{2}-[A-Za-z]{3}-\d{4})', text)
        published = parse_date(date_match.group(1)) if date_match else None
        if date_match:
            text = text.replace(date_match.group(1), '', 1)
        title = clean_title(text)
        if 20 <= len(title) <= 240:
            items.append({'title': title, 'url': href, 'source': 'Income Tax Department', '_date': published})
    return items


def icai_items(url: str):
    soup = BeautifulSoup(get(url), 'html.parser')
    items = []
    for anchor in soup.find_all('a'):
        title = clean_title(anchor.get_text(' ', strip=True))
        href = urljoin(url, anchor.get('href') or '')
        if not valid_url(href) or len(title) < 25 or len(title) > 240:
            continue
        date_match = re.search(r'\(\s*(\d{2}-\d{2}-\d{4}|\d{2}-[A-Za-z]{3}-\d{4})\s*\)', title)
        if not date_match:
            continue
        published = parse_date(date_match.group(1))
        title = clean_title(re.sub(r'\s*\(\s*(?:\d{2}-\d{2}-\d{4}|\d{2}-[A-Za-z]{3}-\d{4})\s*\)\s*$', '', title))
        items.append({'title': title, 'url': href, 'source': 'ICAI', '_date': published})
    return items


def dedupe(items):
    seen = set()
    result = []
    for item in sorted(items, key=lambda x: x.get('_date') or datetime.min.replace(tzinfo=timezone.utc), reverse=True):
        key = (item['title'].lower(), item['url'])
        if key in seen:
            continue
        seen.add(key)
        item.pop('_date', None)
        result.append(item)
    return result[:8]


def update_index():
    text = INDEX.read_text(encoding='utf-8')
    nav_marker = '                <li><a href="#due-dates">Due Dates</a></li>'
    nav_item = '                <li><a href="#latest-updates">Latest Updates</a></li>'
    if nav_item not in text:
        if nav_marker not in text:
            raise RuntimeError('Could not find the existing Due Dates navigation item; refusing to modify index.html.')
        text = text.replace(nav_marker, nav_marker + '\n' + nav_item, 1)

    section_marker = '    <footer class="footer">'
    if '<section id="latest-updates"' not in text:
        section = '''    <section id="latest-updates" class="latest-updates-section" aria-labelledby="latest-updates-title">\n        <div class="container">\n            <div class="latest-updates-panel">\n                <div class="latest-updates-heading" id="latest-updates-title">\n                    <span class="latest-updates-dot" aria-hidden="true"></span>\n                    LATEST UPDATES\n                </div>\n                <div class="latest-updates-window" aria-live="polite">\n                    <div class="latest-updates-track"></div>\n                </div>\n            </div>\n            <p class="latest-updates-disclaimer">Information displayed here is for general information only and is sourced from official government/regulatory publications. Click an update to view the original source. Please verify the complete notification, circular, order or announcement on the official website before relying on it.</p>\n        </div>\n    </section>\n\n'''
        if section_marker not in text:
            raise RuntimeError('Could not find the existing footer marker; refusing to modify index.html.')
        text = text.replace(section_marker, section_marker if False else section, 1) + ''
        # The replacement above intentionally inserts the section immediately before the footer.
        text = text.replace(section + section_marker, section + section_marker, 1) if section + section_marker in text else text

    script_tag = '    <script src="scripts/latest-updates.js" defer></script>'
    if script_tag not in text:
        inline_marker = '    <script>\n        // Hamburger menu toggle'
        if inline_marker not in text:
            raise RuntimeError('Could not find the existing inline script marker; refusing to modify index.html.')
        text = text.replace(inline_marker, script_tag + '\n\n' + inline_marker, 1)

    INDEX.write_text(text, encoding='utf-8')


def main():
    items = []
    failures = []
    for source, url in RSS_SOURCES:
        try:
            items.extend(rss_items(source, url))
        except Exception as exc:
            failures.append(f'{source} RSS: {exc}')
    for source, url, kind in HTML_SOURCES:
        try:
            if kind == 'income-tax':
                items.extend(income_tax_items(url))
            else:
                items.extend(icai_items(url))
        except Exception as exc:
            failures.append(f'{source} HTML: {exc}')

    final_items = dedupe(items)
    # Fail closed: do not erase known-good published data if every official source failed.
    if not final_items:
        raise RuntimeError('All official sources returned no usable verified items. Existing data was left unchanged. ' + '; '.join(failures))

    OUT.write_text(json.dumps({
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'items': final_items,
        'sourceFailures': failures
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    update_index()

    subprocess.run(['git', 'config', 'user.name', 'github-actions[bot]'], check=True)
    subprocess.run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], check=True)
    subprocess.run(['git', 'add', 'index.html', 'data/latest-updates.json'], check=True)
    diff = subprocess.run(['git', 'diff', '--cached', '--quiet'], check=False)
    if diff.returncode != 0:
        subprocess.run(['git', 'commit', '-m', 'Auto-update official latest updates [skip ci]'], check=True)
        subprocess.run(['git', 'push'], check=True)


if __name__ == '__main__':
    main()
