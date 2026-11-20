# Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
# Repository: https://github.com/zhongxinxuhk/VEXNAR
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Fetch only the public fields the React website needs. No credentials in output."""
import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
API = 'https://api.github.com/repos/zhongxinxuhk/VEXNAR'


def fetch(route):
    headers = {'User-Agent': 'VEXNAR-Website', 'Accept': 'application/vnd.github+json'}
    if os.getenv('GITHUB_TOKEN'):
        headers['Authorization'] = 'Bearer ' + os.environ['GITHUB_TOKEN']
    with urllib.request.urlopen(urllib.request.Request(API + route, headers=headers), timeout=30) as response:
        return json.load(response)


def prepare():
    routes = {'repo': '', 'releases': '/releases?per_page=100', 'branches': '/branches?per_page=100',
              'commits': '/commits?per_page=50', 'contributors': '/contributors?per_page=100'}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        results = dict(zip(routes, pool.map(fetch, routes.values())))
    repo = results['repo']
    data = {
        'updatedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
        'repo': {'stars': repo['stargazers_count'], 'defaultBranch': repo['default_branch']},
        'releases': [{'name': r['name'] or r['tag_name'], 'tag': r['tag_name'], 'url': r['html_url'],
                      'date': (r['published_at'] or '')[:10], 'body': r['body'] or '', 'prerelease': r['prerelease'],
                      'assets': [{'name': a['name'], 'size': a['size'], 'url': a['browser_download_url']}
                                 for a in r.get('assets', []) if a.get('state') == 'uploaded']}
                     for r in results['releases'] if not r['draft']],
        'branches': [{'name': b['name'], 'sha': b['commit']['sha']} for b in results['branches']],
        'commits': [{'sha': c['sha'], 'url': c['html_url'], 'message': c['commit']['message'].splitlines()[0],
                     'author': (c.get('author') or {}).get('login') or 'Git contributor',
                     'date': c['commit']['author']['date'][:10]} for c in results['commits']],
        'contributors': [{'name': c['login'], 'url': c['html_url'], 'contributions': c['contributions']}
                         for c in results['contributors']]
    }
    target = ROOT / '.generated' / 'github.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Prepared public GitHub snapshot:', data['updatedAt'])


if __name__ == '__main__':
    prepare()
