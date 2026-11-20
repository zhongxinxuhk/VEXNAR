# Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
# Repository: https://github.com/zhongxinxuhk/VEXNAR
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Render the curated, source-verified third-party credits catalog."""
import html
import json
from pathlib import Path


def render_credits(root: Path) -> str:
    catalog = json.loads((root / 'credits.json').read_text(encoding='utf-8'))
    esc = lambda value: html.escape(str(value), quote=True)
    cards = []
    for item in catalog['projects']:
        searchable = ' '.join(str(item[k]) for k in ['name', 'author', 'category', 'kind', 'usage', 'license'])
        is_symbol = 'Simple Icons' in item['logo_kind']
        image = (f'<img class="credit-logo {"symbol" if is_symbol else ""}" src="{esc(item["logo"])}" '
                 f'alt="{esc(item["name"])} {esc(item["logo_kind"])}" width="48" height="48" loading="lazy">') if item['logo'] else '<span class="credit-monogram" aria-label="项目名称标识">DS</span>'
        note = f'<p class="credit-note">{esc(item["note"])}</p>' if item['note'] else ''
        cards.append(f'''<article class="credit-card" data-category="{esc(item['category'])}" data-search="{esc(searchable)}">
<div class="credit-card-top"><div class="credit-logo-wrap">{image}</div><span class="badge">{esc(item['kind'])}</span></div>
<h3>{esc(item['name'])}</h3><p class="credit-author">{esc(item['author'])}</p>
<dl><dt>Usage · 用途</dt><dd>{esc(item['usage'])}</dd><dt>License · 许可证</dt><dd><a class="credit-license" href="{esc(item['license_url'])}" target="_blank" rel="noopener noreferrer">{esc(item['license'])}</a></dd></dl>
{note}<a class="credit-github" href="{esc(item['github'])}" target="_blank" rel="noopener noreferrer"><span>GitHub</span><span>{esc(item['github'].removeprefix('https://github.com/'))}</span></a></article>''')
    categories = ['全部', 'UI 与交互', '编辑器与终端', 'Agent 与工具', '数据与运行时', '参考与借鉴']
    filters = ''.join(f'<button type="button" data-filter="{esc(category)}" aria-pressed="{"true" if category == "全部" else "false"}">{esc(category)}</button>' for category in categories)
    return f'''<section class="credits-intro" aria-labelledby="credits-introduction"><div><span class="eyebrow">INTRODUCTION</span><h2 id="credits-introduction">站在开源的肩膀上。</h2></div><div><p>VEXNAR 的开发离不开开源软件：从界面、编辑器与终端，到 Agent、数据库与运行时；也离不开其他项目分享的架构与交互经验。这里记录我们直接使用、集成、参考和借鉴的项目，向原作者与社区致谢。</p><p>每张卡片分别列明用途、作者或维护者、GitHub 地址与许可证，并标注使用关系。研究参考表示开发资料，不代表将其代码或运行时集成进 VEXNAR。</p></div></section>
<section class="credits-projects" aria-labelledby="credits-projects-title"><div class="credits-section-heading"><div><div class="eyebrow">OPEN SOURCE PROJECTS</div><h2 id="credits-projects-title">开放的技术，共同的基石。</h2></div><span class="credit-count" aria-live="polite" id="credit-count">共 {len(cards)} 个项目</span></div>
<div class="credits-toolbar" hidden><label class="credit-search">搜索项目<input type="search" id="credit-search" placeholder="搜索名称、作者、用途或许可证" autocomplete="off"></label><div class="credit-filters" role="group" aria-label="按用途筛选项目">{filters}</div></div>
<div class="credits-grid">{''.join(cards)}</div><p id="credit-empty" class="credit-empty" hidden>没有匹配的项目，请尝试其他关键词或分类。</p></section>
<section class="credits-license" aria-labelledby="credits-license-title"><div><div class="eyebrow">LICENSE</div><h2 id="credits-license-title">尊重每一份开放。</h2></div><div><p>VEXNAR 自有代码采用 AGPL-3.0-or-later。第三方项目保留各自的版权与许可证；MIT、Apache-2.0、AGPL-3.0、ISC、PostgreSQL 和其他条款分别在卡片中链接到上游原文。</p><p>许可证与来源于 {esc(catalog['verified_at'])} 核对；具体版本以项目所用版本的许可证文件为准。此页展示主要组件及开发参考，不是完整的传递依赖清单。Web 模板的原始 MIT 声明保留在 <a href="https://github.com/zhongxinxuhk/VEXNAR/blob/main/web/LICENSE">web/LICENSE</a>。</p><p class="credit-note">项目专用 Logo 来自原仓库；部分标识来自 <a href="https://github.com/simple-icons/simple-icons">Simple Icons</a>（<a href="assets/credits/simple-icons-LICENSE.txt">CC0-1.0</a>）。无专用 Logo 时使用维护者头像或名称标识。Logo 与名称用于来源识别，不表示合作或背书。</p></div></section>
<section class="credits-thanks" aria-labelledby="credits-thanks-title"><div class="eyebrow">ACKNOWLEDGEMENTS</div><h2 id="credits-thanks-title">感谢，把创造分享出来的人。</h2><p>感谢每一位开源作者、维护者与贡献者。<br>你们在代码、文档、问题反馈和技术探索上的投入，让 VEXNAR 得以从已有成果出发，继续向前。</p><a class="button secondary" href="https://github.com/zhongxinxuhk/VEXNAR" target="_blank" rel="noopener noreferrer">参与 VEXNAR 开源建设</a></section>'''
