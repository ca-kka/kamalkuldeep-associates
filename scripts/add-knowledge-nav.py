from pathlib import Path

# Draft release helper: fail closed if the existing navigation is not exactly as expected.
p=Path('index.html')
s=p.read_text(encoding='utf-8')
if 'href="knowledge/"' in s or 'Knowledge Centre' in s:
    raise SystemExit(0)
needle='<li><a href="#latest-updates">Latest Updates</a></li>'
replacement=needle+'\n                <li><a href="knowledge/" class="knowledge-centre-link">Knowledge Centre</a></li>'
if needle not in s:
    raise SystemExit('Navigation anchor not found; refusing to modify index.html')
p.write_text(s.replace(needle,replacement,1),encoding='utf-8')
