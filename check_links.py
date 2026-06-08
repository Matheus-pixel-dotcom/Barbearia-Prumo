from pathlib import Path
from bs4 import BeautifulSoup
from urllib.parse import urlparse

root = Path(__file__).resolve().parent
html_files = sorted(root.glob('*.html'))
errors = []

for html_file in html_files:
    soup = BeautifulSoup(html_file.read_text(encoding='utf-8'), 'html.parser')
    for tag in soup.find_all(['a', 'link', 'script', 'img']):
        attr = 'href' if tag.name in {'a', 'link'} else 'src'
        value = tag.get(attr)
        if not value or value.startswith(('#', 'mailto:', 'tel:', 'javascript:')):
            continue
        parsed = urlparse(value)
        if parsed.scheme in {'http', 'https'}:
            continue
        local = value.split('#', 1)[0].split('?', 1)[0]
        if not local:
            continue
        target = (html_file.parent / local).resolve()
        if not target.exists():
            errors.append(f'{html_file.name}: {attr}="{value}" -> arquivo não encontrado')

if errors:
    print('LINKS QUEBRADOS:')
    print('\n'.join(errors))
    raise SystemExit(1)

print(f'OK: {len(html_files)} páginas HTML verificadas, nenhum link local quebrado encontrado.')
