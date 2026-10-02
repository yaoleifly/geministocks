# Super Digger 挖掘机

[English](#english) | [中文](#中文)

AI-powered investment research tool. Turn any financial news or topic into a structured, multi-dimensional analysis report — using **your own AI model**.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyaoleifly%2Fgeministocks)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## English

### Features

- **Dig Analysis** — Enter a topic, news article, or link; three parallel analysis passes produce a full report with an **Investment Attractiveness Score** and an **Information Gap Score** (how much the market has already priced in).
- **Real-time Search** — Optionally plug in [Exa](https://exa.ai) or [AnySearch](https://anysearch.com) (free anonymous tier) to fetch the latest web results before analysis; all citations are shown in the report.
- **Latest News** — Aggregates five sources (Xueqiu, 36Kr, Geek Insight, Bloomberg, Buzzing) with AI concept-tag extraction; click a tag to dig into that concept.
- **History & Review** — Every analysis is saved locally with score badges, sorting, and one-click re-analysis to compare score changes over time.
- **Bring Your Own Model (BYOM)**
  - Cloud APIs: OpenRouter, DeepSeek, MiniMax, Ollama, or any OpenAI-compatible endpoint
  - Local CLIs: 9Router (`localhost:20128`), Claude Code (`localhost:3456`), Codex (`localhost:1455`) — auto-detected
  - All keys and settings live in your browser's localStorage. **Nothing is uploaded to any server.**
- Bilingual (中文 / English), PWA, Markdown export.

### Quick Start

Requires Node.js 18+.

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000, click **API Settings** in the top-right corner, and connect your model. No environment variables are required — see [.env.example](.env.example) for the few optional ones.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│ React SPA (Vite + TypeScript + Tailwind)             │
│                                                      │
│  App.tsx ─ components/ (UI, lazy-loaded modals)      │
│     │                                                │
│  services/                                           │
│   ├─ geminiService      3-pass analysis orchestration│
│   ├─ streamingService   OpenAI-compatible API calls  │
│   ├─ apiConfigService   BYOM config (localStorage)   │
│   ├─ exaSearchService   Exa / AnySearch providers    │
│   └─ historyService     local analysis history       │
└──────────────┬───────────────────────────────────────┘
               │ same-origin proxies (CORS)
┌──────────────▼───────────────────────────────────────┐
│ Vercel                                               │
│  vercel.json rewrites: /exa-api → api.exa.ai         │
│    /anysearch-api → api.anysearch.com  (+ ollama)    │
│  api/cors-proxy.ts   generic proxy for cloud APIs    │
│  api/ai-analyze.ts   optional server-side fallback   │
└──────────────────────────────────────────────────────┘
```

Key principle: the app is **client-first**. Serverless functions only act as CORS-bypassing pass-throughs; user API keys are sent directly from the browser to the model provider and are never stored server-side.

### Directory Layout

```
api/            Vercel serverless functions (proxies, optional endpoints)
components/     React components (modals are lazy-loaded)
services/       Business logic, API clients, storage
hooks/          React hooks (i18n, ...)
public/locales/ zh.json / en.json translations
utils/          Shared helpers
docs/           Design notes and archived plans
```

### Deploy

One-click with the button above, or:

```bash
npm i -g vercel && vercel
```

`vercel.json` ships with API rewrites and security headers. If you fork this project, review the proxy protections in `api/cors-proxy.ts` (same-site check, https-only, SSRF guard) for your own domain.

### Security

- User model API keys: browser localStorage only, never uploaded. Audit `services/apiConfigService.ts` and `api/cors-proxy.ts`.
- See [SECURITY.md](SECURITY.md) for the full policy and how to report vulnerabilities.

### Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the [ROADMAP](ROADMAP.md) for planned work. Before submitting, run:

```bash
pnpm typecheck && pnpm test && pnpm build
```

### License

[MIT](LICENSE)

---

## 中文

### 核心功能

- **挖掘分析**：输入主题/新闻/链接，三段并行分析生成完整报告，含**投资吸引力评分**与**信息差评分**（衡量市场是否已消化该信息）
- **实时搜索**：可选接入 [Exa](https://exa.ai) 或 [AnySearch](https://anysearch.com)（有免费匿名额度），分析前自动检索最新网络资料并注入，报告展示全部引用来源
- **最新动态**：聚合雪球、虎嗅、极客洞察、彭博、Buzzing、Ahead of AI 等新闻源，支持自定义 RSS；AI 概念标签一键提取，点击标签直接发起挖掘
- **历史复盘**：分析历史自动保存，双评分徽章 + 排序筛选 + 一键重新分析对比评分变化
- **自带模型（BYOM）**：
  - 云端 API：OpenRouter、DeepSeek、MiniMax、Ollama 及任意 OpenAI 兼容服务
  - 本机 CLI：9Router（localhost:20128）、Claude Code（localhost:3456）、Codex（localhost:1455），自动扫描运行状态
  - 所有 Key 与配置仅保存在浏览器 localStorage，**不会上传到任何服务器**
- 中英双语、PWA、Markdown 报告导出

### 本地运行

前置要求：Node.js 18+

```bash
pnpm install
pnpm dev
```

打开 http://localhost:3000，点击右上角「模型设置」连接你的 AI 模型即可。无需配置任何环境变量——少量可选项见 [.env.example](.env.example)。

### 架构说明

应用为**客户端优先**架构（见上方英文版架构图）：Serverless 函数仅做 CORS 转发，用户的模型 API Key 由浏览器直连模型服务商，服务端不存储任何密钥。

### 部署

点击上方 Deploy 按钮一键部署，或使用 `vercel` CLI。`vercel.json` 已内置 API 代理 rewrite 与安全响应头。Fork 后请检查 `api/cors-proxy.ts` 的代理防护（���站校验、仅 https、SSRF 防护）是否适合你的域名。

### 参与贡献

欢迎 PR，流程见 [CONTRIBUTING.md](CONTRIBUTING.md)，规划见 [ROADMAP](ROADMAP.md)；安全问题报告见 [SECURITY.md](SECURITY.md)。提交前请运行 `pnpm typecheck && pnpm test && pnpm build`。

### 联系

- 开发者：僧僧
- 邮箱：codes@z.org

### 许可证

[MIT](LICENSE)

## Cloudflare Workers deployment

Build and deploy the SPA and API proxies together with `pnpm deploy`. For local validation run `pnpm dev:cloudflare`; no secrets are required for BYOM. See [Cloudflare migration guide](docs/CLOUDFLARE_MIGRATION.md) for Git integration, optional statistics secrets, domain cutover and rollback.
