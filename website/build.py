# Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
# Repository: https://github.com/zhongxinxuhk/VEXNAR
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Build a dependency-free, multipage GitHub Pages website from public metadata."""
import datetime
import html
import json
import os
from pathlib import Path
import shutil
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'dist'
REPO = 'https://github.com/zhongxinxuhk/VEXNAR'
API = 'https://api.github.com/repos/zhongxinxuhk/VEXNAR'
PAGES = [('index', '总览'), ('downloads', '下载中心'), ('releases', '版本更新'), ('branches', '分支'), ('commits', '提交记录'), ('contributors', '合作者')]

def fetch(route):
    headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'VEXNAR-Website'}
    if os.getenv('GITHUB_TOKEN'):
        headers['Authorization'] = 'Bearer ' + os.environ['GITHUB_TOKEN']
    with urllib.request.urlopen(urllib.request.Request(API + route, headers=headers), timeout=30) as r:
        return json.load(r)

def e(value):
    return html.escape(str(value or ''), quote=True)

def link(url, label, cls=''):
    if not url.startswith('https://github.com/'):
        raise ValueError('Unexpected public URL: ' + url)
    return f'<a class="{cls}" href="{e(url)}" target="_blank" rel="noopener noreferrer">{label}</a>'

def empty(title, text, url, action):
    return f'<div class="empty"><span class="empty-icon">◇</span><h2>{title}</h2><p>{text}</p>{link(url, action, "button secondary")}</div>'

def build():
    data = {key: fetch(route) for key, route in [('repo',''), ('releases','/releases?per_page=100'), ('branches','/branches?per_page=100'), ('commits','/commits?per_page=50'), ('contributors','/contributors?per_page=100')]}
    data['releases'] = [r for r in data['releases'] if not r['draft']]
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    if OUT.exists(): shutil.rmtree(OUT)
    shutil.copytree(ROOT / 'assets', OUT / 'assets')
    for name in ['style.css', 'app.js']: shutil.copy(ROOT / name, OUT / name)
    (OUT / '.nojekyll').touch()
    (OUT / 'data.json').write_text(json.dumps({'updated_at': stamp, 'releases': [{'tag_name': r['tag_name'], 'html_url': r['html_url']} for r in data['releases']], 'counts': {key: len(data[key]) for key in ['branches', 'commits', 'contributors']}}, ensure_ascii=False), encoding='utf-8')
    stars = data['repo']['stargazers_count']
    latest = next((r for r in data['releases'] if not r['prerelease']), None)
    stats = f'<div class="stats"><div><strong>{stars}</strong><span>GitHub Stars</span></div><div><strong>{len(data["contributors"])}</strong><span>公开贡献者</span></div><div><strong>Go + AI</strong><span>统一服务内核</span></div><div><strong>AGPL 3.0</strong><span>开源许可证</span></div></div>'
    hero = '''<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="signal"></span> AUTONOMOUS SECURITY, CONNECTED.</div><h1>洞察攻击面<br>让<span class="gradient">每一步</span><br>都有据可循<span class="period">.</span></h1><p class="lead">VEXNAR，让 AI 探索、工具执行与漏洞验证连成闭环。<br class="desktop-break">从一个目标出发，看见完整的安全脉络。</p><div class="actions"><a class="button primary" href="downloads.html">获取 VEXNAR</a><a class="button secondary" href="https://github.com/zhongxinxuhk/VEXNAR" target="_blank" rel="noopener noreferrer">在 GitHub 探索</a></div><div class="hero-note">开源可审阅 · 证据可追溯 · 人始终在环</div></div><div class="orbit" role="img" aria-label="探索图概念示意：从目标到探索、执行、验证和证据归档"><div class="orbit-grid"></div><div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div><div class="axis axis-one"></div><div class="axis axis-two"></div><div class="core"><img src="assets/logo.png" alt=""><span>VEXNAR</span></div><div class="node n1"><i></i>目标资产<small>ATTACK SURFACE</small></div><div class="node n2"><i></i>自主探索<small>EXPLORATION</small></div><div class="node n3"><i></i>工具执行<small>EXECUTION</small></div><div class="node n4"><i></i>独立验证<small>VERIFICATION</small></div><div class="orbit-caption"><span>EXPLORATION GRAPH</span><span>概念示意 / 非任务实况</span></div></div></section>'''
    features = [('⌘','自主探索，持续推进','从目标拆解到工具执行，planner 与 worker 协同推进任务；探索结果回写，支撑下一轮决策。','PLANNING & EXECUTION'),('◎','双图连接意图与事实','探索图保留推理与验证脉络，资产图沉淀目标上下文。沿着关联，看清发现来自哪里。','CONNECTED CONTEXT'),('⌁','保留证据，验证发现','记录请求与响应，结合漏洞基线、带外回连与独立验证器，让判断落在可回溯的证据上。','EVIDENCE FIRST'),('◇','自动执行，人可介入','审批、对话与过程记录构成控制边界。在任务运行中介入、纠偏，让自主探索保持可控。','HUMAN IN THE LOOP')]
    feature_html = ''.join(f'<article class="feature"><span class="feature-icon">{icon}</span><span class="kicker">{tag}</span><h3>{title}</h3><p>{desc}</p></article>' for icon,title,desc,tag in features)
    home = hero + stats + f'''<section id="capabilities" class="section"><div class="section-heading"><div><div class="eyebrow">BUILT FOR THE FULL PICTURE</div><h2>从零散线索，到完整脉络。</h2></div><p>把探索、执行和验证放在同一个工作流中。<br>少一点上下文切换，多一点对事实的把握。</p></div><div class="features">{feature_html}</div></section><section class="workflow section"><div><div class="eyebrow">ONE CONTINUOUS WORKFLOW</div><h2>一次探索。<br><span class="muted">完整的证据链。</span></h2><p>以任务为起点，以可复核的发现为交付。<br>每一轮探索，都会成为下一步的上下文。</p><a class="text-link" href="{REPO}#安装">阅读部署指南</a></div><div class="flow-list"><div><b>设定目标与范围</b><p>接入目标资产，配置模型与执行环境。</p><span>scope</span></div><div><b>规划与工具执行</b><p>Agent 拆解意图，调用工具推进探索。</p><span>explore</span></div><div><b>验证与证据留存</b><p>关联流量、验证过程与发现，保留来源。</p><span>verify</span></div><div><b>报告与集成交付</b><p>导出报告，通过 Webhook 等方式连接团队。</p><span>deliver</span></div></div></section><section class="open-section section"><div class="eyebrow">OPEN SOURCE. OPEN PROGRESS.</div><h2>每一次演进，都公开可见。</h2><p>查看分支、追踪提交、认识贡献者。项目的下一步，也可以有你的参与。</p><div class="open-links"><a href="branches.html">分支与开发</a><a href="commits.html">最近提交</a><a href="contributors.html">合作者</a></div></section>'''
    assets = [(r,a) for r in data['releases'] if not r['prerelease'] for a in r.get('assets',[]) if a.get('state') == 'uploaded']
    cards = ''
    for osname, token, symbol in [('macOS','mac','⌘'), ('Windows','win','⊞'), ('Linux','linux','△')]:
        matches = [(r,a) for r,a in assets if ((any(x in a['name'].lower() for x in ['.dmg','mac','darwin']) if token=='mac' else any(x in a['name'].lower() for x in ['windows','win32','.exe','.msi']) if token=='win' else any(x in a['name'].lower() for x in ['linux','.appimage','.deb','.rpm'])))]
        links = ''.join(link(a['browser_download_url'], f'{e(a["name"])} <small>{a["size"]/1024/1024:.1f} MB · {e(r["tag_name"])}</small>', 'asset') for r,a in matches[:8])
        cards += f'<article class="download-card"><div class="os-icon">{symbol}</div><h2>{osname}</h2><p>公开发行包</p>{links if links else "<span class=badge>尚未发布</span><p>当前没有此平台的正式公开安装包。<br>发布后将在这里显示真实下载链接。</p>"}</article>'
    downloads = f'<div class="download-grid">{cards}</div><div class="notice"><h2>从源码开始</h2><p>你也可以使用仓库中的安装脚本、Docker Compose 或源码构建。服务端部署需要 PostgreSQL 与模型配置，具体要求以仓库文档为准。</p>{link(REPO+"#安装", "查看安装指南", "button secondary")}{link(REPO+"/releases", "所有发行版本", "text-link")}</div>'
    releases = ''.join(f'<article class="release"><div class="release-meta"><span class="badge">{"预发布" if r["prerelease"] else "正式发行"}</span><time>{e((r["published_at"] or "")[:10])}</time></div><h2>{link(r["html_url"], e(r["name"] or r["tag_name"]))}</h2><pre class="release-body">{e(r["body"] or "此版本没有填写发行说明。")}</pre>{link(r["html_url"],"查看完整发行说明", "text-link")}</article>' for r in data['releases']) or empty('第一份发行说明，即将写下。','项目目前没有公开 Release。版本发布后，这里会同步版本号、发行时间和官方说明。',REPO+'/releases','前往 GitHub Releases')
    branches = '<div class="list">'+''.join(f'<article class="branch-row"><div><span class="branch-icon">⑂</span><h2>{link(REPO+"/tree/"+urllib.parse.quote(b["name"],safe=""),e(b["name"]))}</h2>{"<span class=badge>默认分支</span>" if b["name"]==data["repo"]["default_branch"] else ""}</div><span class="mono">{e(b["commit"]["sha"][:8])}</span>{link(REPO+"/commits/"+urllib.parse.quote(b["name"],safe=""),"查看提交", "text-link")}</article>' for b in data['branches'])+'</div><p class="data-note">最多展示 100 个公开分支。默认分支标识来自仓库元数据。</p>'
    commits = '<div class="commit-list">'+''.join(f'<article class="commit"><div class="commit-mark"></div><div><h2>{link(c["html_url"],e(c["commit"]["message"].splitlines()[0]))}</h2><p>{e((c.get("author") or {}).get("login") or "Git contributor")} <span>·</span> <time>{e(c["commit"]["author"]["date"][:10])}</time></p></div>{link(c["html_url"],e(c["sha"][:8]),"sha mono")}</article>' for c in data['commits'])+'</div><p class="data-note">展示默认分支最近 50 次公开提交。完整历史请查看 GitHub。</p>'
    contributors = '<div class="people">'+''.join(f'<a class="person" href="{e(c["html_url"])}" target="_blank" rel="noopener noreferrer"><img src="https://github.com/{e(c["login"])}.png?size=160" width="80" height="80" alt="{e(c["login"])} 的头像" loading="lazy"><h2>{e(c["login"])}</h2><p>{c["contributions"]} 次提交贡献</p><span class="text-link">GitHub 主页</span></a>' for c in data['contributors'])+'</div><div class="notice"><h2>一起构建下一步。</h2><p>这里展示 GitHub 的公开代码贡献者，不代表仓库的私有协作者或访问权限名单。欢迎通过 Issue、Pull Request 与文档改进参与项目。</p>'+link(REPO+'/issues','参与讨论','button secondary')+'</div>'
    contents = {'index':home,'downloads':downloads,'releases':releases,'branches':branches,'commits':commits,'contributors':contributors}
    subtitles = {'downloads':('DESIGNED FOR YOUR WORKSPACE','你的工作台，准备就绪。','选择适合你的平台。下载链接直接指向 GitHub 官方 Release 资产。'), 'releases':('THE CHANGELOG','持续演进，步步可见。','跟随每一次公开发行，了解 VEXNAR 的能力与变化。'),'branches':('DEVELOPMENT BRANCHES','看见开发的每一条路径。','从默认分支到功能分支，探索项目正在发生的变化。'),'commits':('A RECORD OF PROGRESS','每一次提交，都是向前。','阅读默认分支的真实提交，追踪项目的细节与进展。'),'contributors':('BUILT TOGETHER','由每一份贡献，连接而成。','感谢参与代码建设的开源贡献者。让安全探索的工具持续变好。')}
    header = '<!--\nCopyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>\nRepository: https://github.com/zhongxinxuhk/VEXNAR\nSPDX-License-Identifier: AGPL-3.0-or-later\n-->'
    for name,title in PAGES:
        nav=''.join(f'<a href="{slug}.html" {"aria-current=page" if slug==name else ""}>{label}</a>' for slug,label in PAGES)
        intro='' if name=='index' else f'<section class="page-intro"><div class="eyebrow">{subtitles[name][0]}</div><h1>{subtitles[name][1]}</h1><p>{subtitles[name][2]}</p><div class="snapshot">GitHub 公开数据快照 · {stamp}</div></section>'
        doc=f'''<!doctype html>
{header}
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#07090e"><meta name="description" content="VEXNAR 官方网站：AI 自主渗透测试系统，探索图、资产图、证据追溯与人在环路。客户端下载、版本更新与开源协作动态。"><meta property="og:title" content="VEXNAR · {title}"><meta property="og:description" content="洞察攻击面，让每一步都有据可循。"><meta property="og:type" content="website"><title>{title} · VEXNAR — AI 自主安全探索</title><link rel="icon" href="assets/logo.png"><link rel="stylesheet" href="style.css"><script src="app.js" defer></script></head><body><a class="skip" href="#main">跳转到正文</a><header class="header"><div class="nav-shell"><a class="brand" href="index.html" aria-label="VEXNAR 首页"><img src="assets/logo.png" alt="" width="34" height="34"><span>VEXNAR</span></a><button class="menu-toggle" aria-label="打开导航菜单" aria-expanded="false" aria-controls="navigation">☰</button><nav id="navigation" aria-label="主导航">{nav}</nav>{link(REPO,"GitHub","github-link")}</div></header><main id="main">{intro}{contents[name]}</main><footer><div class="footer-top"><a class="brand" href="index.html"><img src="assets/logo.png" alt="" width="30" height="30">VEXNAR</a><p>探索有迹。验证有据。</p><a href="{REPO}" target="_blank" rel="noopener noreferrer">GitHub</a><a href="{REPO}/blob/main/LICENSE">AGPL-3.0-or-later</a></div><div class="footer-bottom"><span>© 2026 xuzhongxin · VEXNAR</span><span>AI 自主安全探索 · 开源共建</span></div></footer></body></html>'''
        (OUT / (name+'.html')).write_text(doc, encoding='utf-8')
    shutil.copy(OUT/'index.html', OUT/'404.html')
    (OUT/'robots.txt').write_text('User-agent: *\nAllow: /\nSitemap: https://zhongxinxuhk.github.io/VEXNAR/sitemap.xml\n')
    (OUT/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join(f'<url><loc>https://zhongxinxuhk.github.io/VEXNAR/{n}.html</loc></url>' for n,_ in PAGES)+'</urlset>')
    print(f'Built {len(PAGES)} pages; {len(data["releases"])} releases; {len(data["branches"])} branches; {stamp}')

if __name__ == '__main__':
    build()
