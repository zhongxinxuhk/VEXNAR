<!--
Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
Repository: https://github.com/zhongxinxuhk/VEXNAR
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# VEXNAR 官方网站

独立静态官网，不依赖 Go 服务或桌面运行时。部署地址：https://zhongxinxuhk.github.io/VEXNAR/

## 本地构建与验证

```bash
python3 website/build.py
python3 website/check.py
python3 -m http.server 4173 --directory website/dist
```

Python 3.9+，无第三方依赖。构建需要访问 GitHub REST API。可通过环境变量 `GITHUB_TOKEN` 提高限额；凭据不会进入产物。构建失败不会部署不完整快照。

## 页面与数据

- `index.html`：产品介绍与探索图概念示意，非真实任务截图。
- `downloads.html`：从正式公开 Release 资产生成平台下载链接，保留资产名和版本；没有资产则显示尚未发布。预发布不作为正式下载。
- `releases.html`：最近最多 100 个公开 Release，包含预发布标记；发行说明以安全纯文本展示。
- `branches.html`：最多 100 个公开分支，显示默认分支。
- `commits.html`：默认分支最近 50 个公开提交，不展示提交者邮件。
- `contributors.html`：最多 100 个 GitHub 公开贡献者，不读取私有 collaborator 权限名单。

构建数据只来自公开仓库端点，不读取本地案例、日志、截图、凭据或开发分支。唯一品牌素材来自已公开的 `assets/logo.png`。

GitHub Actions 在官网源文件变动、Release 发布/编辑/删除、手动触发和每六小时定时触发时重建。页面显示 UTC 快照时间；访客不直接调用 GitHub API。分支和贡献数据不宣称为完整统计。

在仓库 Settings → Pages 中选择 GitHub Actions。工作流为 `.github/workflows/website-pages.yml`。子路径部署使用相对链接，兼容 `/VEXNAR/`。CSS 支持移动端、键盘焦点与减少动画偏好；字体通过 Google Fonts 加载，失败时使用系统字体。
