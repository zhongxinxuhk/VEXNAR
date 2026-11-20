# Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
# Repository: https://github.com/zhongxinxuhk/VEXNAR
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Check internal routes, HTML structure, public metadata and download truth."""
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent / 'dist'
class Links(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for key in ['href', 'src']:
            value = attrs.get(key, '')
            parsed = urlparse(value)
            if value and not parsed.scheme and parsed.path:
                assert not parsed.path.startswith('/'), value
                assert (ROOT / unquote(parsed.path)).is_file(), value
        if tag == 'a' and attrs.get('target') == '_blank':
            assert 'noopener' in attrs.get('rel', ''), attrs

for page in ROOT.glob('*.html'):
    content = page.read_text()
    assert '<html lang="zh-CN">' in content
    assert '<main id="main">' in content
    assert content.count('aria-current=page') == 1
    Links().feed(content)
data = json.loads((ROOT/'data.json').read_text())
assert len(list(ROOT.glob('*.html'))) == 8
if not data['releases']:
    assert (ROOT/'downloads.html').read_text().count('尚未发布') == 3
    assert '第一份发行说明' in (ROOT/'releases.html').read_text()
print('PASS: 7 pages + 404; relative routes/assets; navigation; safe links; release empty states')

credits = (ROOT / 'credits.html').read_text()
assert credits.index('href="contributors.html"') < credits.index('href="credits.html"')
for section in ['INTRODUCTION', 'OPEN SOURCE PROJECTS', 'Usage · 用途', 'LICENSE', 'ACKNOWLEDGEMENTS']:
    assert section in credits, section
catalog = json.loads((ROOT.parent / 'credits.json').read_text())
assert len(catalog['projects']) == credits.count('class="credit-card"')
assert len({p['github'] for p in catalog['projects']}) == len(catalog['projects'])
for project in catalog['projects']:
    for key in ['name', 'author', 'usage', 'license', 'license_url', 'github', 'logo_kind']:
        assert project[key], (project['name'], key)
    assert project['github'].startswith('https://github.com/')
    assert project['license'] != 'NOASSERTION'
print('PASS: credits navigation order, all five sections, catalog fields, unique sources and local logos')
