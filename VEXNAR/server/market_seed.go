// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package server

import "log"

// builtinMarketJSON 是官方市场的本地兜底目录：断网、GitHub 被墙或速率被限时，
// 市场页仍然有可安装的条目，而不是一片空白。远端 market/market.json 同步成功时
// 不会使用这份内置数据（避免与远端条目重复）。
const builtinMarketJSON = `{
  "schema": "vexnar.market/v1",
  "name": "VEXNAR 内置目录",
  "mcp": [
    {
      "name": "filesystem",
      "description": "读写指定目录下的文件（安装后把路径改成你自己的目录）",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/workspace"],
      "tags": ["官方", "文件"]
    },
    {
      "name": "memory",
      "description": "基于知识图谱的持久记忆，跨会话保留事实与关系",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "tags": ["官方", "记忆"]
    },
    {
      "name": "sequential-thinking",
      "description": "可回溯的分步推理草稿，适合复杂排查链路",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      "tags": ["官方", "推理"]
    },
    {
      "name": "playwright",
      "description": "浏览器自动化：导航、点击、截图、抓取动态页面",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"],
      "tags": ["浏览器", "自动化"]
    },
    {
      "name": "github",
      "description": "读写仓库：Issue、PR、代码检索（需要 Personal Access Token）",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "" },
      "tags": ["官方", "代码"]
    },
    {
      "name": "context7",
      "description": "按需拉取第三方库的最新文档与代码示例",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"],
      "tags": ["文档"]
    },
    {
      "name": "postgres",
      "description": "只读 SQL 查询 PostgreSQL（安装时填连接串）",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:pass@localhost:5432/db"],
      "tags": ["官方", "数据库"]
    },
    {
      "name": "puppeteer",
      "description": "Puppeteer 驱动的网页抓取与操作",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"],
      "tags": ["浏览器"]
    },
    {
      "name": "brave-search",
      "description": "Brave 搜索与网页抓取（需要 API Key）",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": { "BRAVE_API_KEY": "" },
      "tags": ["搜索"]
    },
    {
      "name": "fetch",
      "description": "抓取网页并转成适合模型阅读的 Markdown",
      "transport": "stdio",
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "tags": ["官方", "网络", "Python"]
    },
    {
      "name": "git",
      "description": "本地仓库操作：状态、diff、提交历史、分支",
      "transport": "stdio",
      "command": "uvx",
      "args": ["mcp-server-git", "--repository", "/path/to/repo"],
      "tags": ["官方", "代码", "Python"]
    },
    {
      "name": "time",
      "description": "时区转换与当前时间（本机 AEST 场景常用）",
      "transport": "stdio",
      "command": "uvx",
      "args": ["mcp-server-time"],
      "tags": ["官方", "工具", "Python"]
    },
    {
      "name": "sqlite",
      "description": "查询本地 SQLite 数据库文件",
      "transport": "stdio",
      "command": "uvx",
      "args": ["mcp-server-sqlite", "--db-path", "/path/to/db.sqlite"],
      "tags": ["官方", "数据库", "Python"]
    },
    {
      "name": "everything",
      "description": "官方示例服务器：用来验证 MCP 链路与工具发现是否正常",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"],
      "tags": ["官方", "调试"]
    }
  ],
  "skills": [
    {
      "name": "pdf",
      "description": "PDF 全流程：提取文本/表格、合并拆分、旋转、加水印、填表、加解密、OCR",
      "repo": "anthropics/skills",
      "path": "skills/pdf",
      "tags": ["文档", "官方"]
    },
    {
      "name": "docx",
      "description": "创建、读取、编辑 Word 文档与模板（目录、页眉页脚、批注、修订）",
      "repo": "anthropics/skills",
      "path": "skills/docx",
      "tags": ["文档", "官方"]
    },
    {
      "name": "xlsx",
      "description": "电子表格读写与建模：公式、格式、数据透视",
      "repo": "anthropics/skills",
      "path": "skills/xlsx",
      "tags": ["表格", "官方"]
    },
    {
      "name": "pptx",
      "description": "生成与修改演示文稿，含版式与图表",
      "repo": "anthropics/skills",
      "path": "skills/pptx",
      "tags": ["文档", "官方"]
    },
    {
      "name": "mcp-builder",
      "description": "按最佳实践编写 MCP 服务器（Python FastMCP / Node SDK）",
      "repo": "anthropics/skills",
      "path": "skills/mcp-builder",
      "tags": ["开发", "官方"]
    },
    {
      "name": "skill-creator",
      "description": "创建、改进并评测技能包，优化触发描述",
      "repo": "anthropics/skills",
      "path": "skills/skill-creator",
      "tags": ["开发", "官方"]
    },
    {
      "name": "canvas-design",
      "description": "画布式视觉设计：海报、版式、配色方案",
      "repo": "anthropics/skills",
      "path": "skills/canvas-design",
      "tags": ["设计", "官方"]
    },
    {
      "name": "webapp-testing",
      "description": "用 Playwright 驱动 Web 应用做端到端验证与截图",
      "repo": "anthropics/skills",
      "path": "skills/webapp-testing",
      "tags": ["测试", "官方"]
    },
    {
      "name": "doc-coauthoring",
      "description": "与作者协作打磨文档结构与措辞",
      "repo": "anthropics/skills",
      "path": "skills/doc-coauthoring",
      "tags": ["写作", "官方"]
    },
    {
      "name": "internal-comms",
      "description": "内部沟通文案：公告、周报、事故复盘",
      "repo": "anthropics/skills",
      "path": "skills/internal-comms",
      "tags": ["写作", "官方"]
    }
  ]
}`

var builtinMarketCache = func() map[string][]marketItem {
	out := map[string][]marketItem{"mcp": {}, "skills": {}}
	items, err := parseMarketIndex([]byte(builtinMarketJSON), "zhongxinxuhk/VEXNAR")
	if err != nil {
		log.Printf("[market] 内置目录解析失败: %v", err)
		return out
	}
	for _, it := range items {
		it.Builtin = true
		it.Official = true
		it.SourceName = "内置目录"
		it.SourceRepo = "zhongxinxuhk/VEXNAR"
		if it.Repo == "" {
			it.Repo = "zhongxinxuhk/VEXNAR"
		}
		out[it.Kind] = append(out[it.Kind], it)
	}
	return out
}()

// builtinMarketItems 返回内置目录里某一类的条目（副本，调用方可自由改）。
func builtinMarketItems(kind string) []marketItem {
	src := builtinMarketCache[kind]
	out := make([]marketItem, len(src))
	copy(out, src)
	return out
}

// builtinMarketJSONRaw 只用于测试：确认内置 JSON 始终可解析。
func builtinMarketJSONRaw() []byte { return []byte(builtinMarketJSON) }
