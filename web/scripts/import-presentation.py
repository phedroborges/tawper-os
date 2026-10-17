"""Importa texto por slide, sem executar HTML/scripts nem consultar recursos externos."""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path


class Slides(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.slides = []
        self.current = None
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style'):
            self.skip += 1
        if tag == 'section' and 'slide' in attrs.get('class', '').split():
            self.current = {'id': attrs.get('id'), 'title': attrs.get('data-title', ''), 'parts': []}
        if self.current and tag in ('br', 'p', 'li', 'h1', 'h2', 'h3', 'h4', 'tr', 'td', 'th', 'div'):
            self.current['parts'].append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = max(0, self.skip - 1)
        if self.current and tag in ('p', 'li', 'h1', 'h2', 'h3', 'h4', 'tr', 'td', 'th', 'div'):
            self.current['parts'].append('\n')
        elif self.current and tag == 'span':
            self.current['parts'].append(' ')
        if tag == 'section' and self.current:
            lines = [re.sub(r'\s+', ' ', line).strip() for line in ''.join(self.current.pop('parts')).splitlines()]
            self.current['text'] = '\n'.join(line for line in lines if line)
            self.slides.append(self.current)
            self.current = None

    def handle_data(self, data):
        if self.current and not self.skip:
            self.current['parts'].append(data)


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument('source', type=Path)
    cli.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'src/server/assistant/knowledge/presentation.json')
    args = cli.parse_args()
    raw = args.source.read_bytes()
    parser = Slides()
    parser.feed(raw.decode('utf-8-sig'))
    if not parser.slides or len({s['id'] for s in parser.slides}) != len(parser.slides):
        raise ValueError('Slides ausentes ou IDs duplicados')
    payload = {
        'id': 'tawper-apresentacao-2026-10-17',
        'title': 'Apresentação comercial Tawper',
        'importedOn': '2026-10-17',
        'sourceFile': 'apresentacao.html',
        'sha256': hashlib.sha256(raw).hexdigest(),
        'coverage': 'Fonte parcial fornecida pelo usuário. Apenas texto dos slides; imagens não foram transcritas. Não comprova estoque, preços, disponibilidade nem catálogo técnico completo.',
        'slides': parser.slides,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Importados {len(parser.slides)} slides; hash {payload['sha256']}")


if __name__ == '__main__':
    main()
