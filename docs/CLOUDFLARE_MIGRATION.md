# mastersgo.cc：Vercel → Cloudflare Workers

React + Vite 构建产物和 Worker API 一起部署。现有 Vercel 配置保留，可用于回退。

## 本地检查与部署

使用 Node.js 22 LTS（至少 22.12）与 pnpm。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm deploy:check
pnpm dev:cloudflare
```

`dev` 保留原来的 Vite 开发模式。`dev:cloudflare` 在构建后用 Workers 运行前端和真实 API 路由。前端改动后重新构建。

首次部署到 workers.dev，先不要绑定正式域名：

```sh
pnpm exec wrangler login
pnpm deploy
```

## 可选服务与密钥

主要 BYOM 功能不需要服务端密钥。用户自己的模型密钥会经代理转发到所选模型服务商，Worker 不持久化这些密钥。不要把密钥写进 GitHub、wrangler.jsonc 或 VITE_*。

如生产环境在使用全站计数，从原 Vercel 项目复制这两个变量到 Worker Secrets，继续使用同一个 Upstash 数据库，历史值无需迁移：

```sh
pnpm exec wrangler secret put KV_REST_API_URL
pnpm exec wrangler secret put KV_REST_API_TOKEN
```

Upstash 属于独立外部数据库；这里只迁计算与托管。如果要彻底退出原数据库，需先导出 `globalPageViews`、`globalAnalysisCount`，再配置 Cloudflare 的存储方案和导入值。不要直接关闭或删除数据库。

`/api/ai-analyze` 在主界面未被调用，默认返回 503。只有确认要为匿名访问者承担费用时才设置 `ENABLE_AI_FALLBACK=true` 和 `OPENROUTER_API_KEY`。Origin 校验与每实例限流不能替代用户认证或预算控制。

本地可用 `.dev.vars`，该文件已加入 gitignore。前端可选 VITE_* 变量需要在构建时配置，其他变量是 Worker 运行时 Secrets。

## GitHub 自动部署

Cloudflare 控制台 → Workers & Pages → 创建 Worker → 导入仓库 `yaoleifly/geministocks`。

- Worker 名称：`super-digger`（与 wrangler.jsonc 一致）
- 根目录：仓库根目录
- 生产分支：合并迁移后的 `main`
- 构建命令：`pnpm build`
- 部署命令：`pnpm exec wrangler deploy`
- Node.js：22 LTS（至少 22.12）

先在迁移分支验证，之后再切到 main 的自动部署。域名不写入 wrangler 配置，防止一次测试部署意外切换正式流量。

## 上线验收

在 workers.dev 地址检查：

1. 首页、资源、语言切换、历史记录和直接访问 SPA 路径。
2. 自带密钥的模型连接、模型列表与完整分析；流式模型检查首段响应是否及时显示。
3. Exa `/exa-api/search`、AnySearch `/anysearch-api/v1/search` 和 Ollama `/ollama-api/v1/models`。
4. 新闻来源、自定义 RSS（外部提供方的 CORS / 限制仍可能影响结果）。
5. `/api/stats` 的原始计数（如果使用）；未知 `/api/*` 应为 JSON 404。
6. `/login`、`/register` 重定向与 `/auth/google/callback` SPA 回退。
7. PWA 清单、图标、Service Worker 与更新缓存。

临时域名无法共享 mastersgo.cc 的 localStorage；请勿因此判断历史丢失。正式切换后保持原 HTTPS 主机名即可保留用户本地设置。

## 正式域名切换与回退

验证后，在 Worker → Settings → Domains & Routes 中添加 Custom Domain `mastersgo.cc`。先记录原来的网站 DNS 类型、名称和目标；如果控制台提示现有 CNAME 冲突，只替换该网站记录，不动 MX / TXT 等邮件与验证记录。Cloudflare 管理证书和 Worker 的域名记录。

若要提供 www，需要单独添加并配置重定向，先核实原站是否使用 www，避免改变 localStorage 所属 origin。

切换后重新验证 HTTPS、前端、分析、搜索与缓存，再停用 Vercel 自动部署。保留原项目和 DNS 目标一段时间。回退时移除 Worker Custom Domain 并恢复原网站 DNS，再检查 Vercel 项目可正常服务（原站在本次检查时处于 Deployment Paused）。

## 代理限制

固定代理仅允许指定服务商；通用代理拒绝 IP 字面量、非 HTTPS、带凭据及本地名称，不自动跟随上游重定向，只转发模型需要的请求头。此名称检查不是 DNS 解析层的全网 SSRF 防护；不要把 Worker 绑定到内网服务。限流沿用每实例的 best-effort 语义，如需统一配额应另配 Cloudflare WAF / Rate Limiting。

## 本次验证记录

- TypeScript 检查通过；13 个测试文件、124 项测试通过，包括 Worker 代理 SSE 首段透传、固定转发目标、重定向拒绝、密钥和 Cookie 过滤、统计接口兼容性。
- Vite 生产构建和 Wrangler dry-run 通过。
- 测试站：https://super-digger.mastergo.workers.dev
- 浏览器实测 AnySearch 匿名搜索成功，Ollama 模型列表成功；无密钥的 Exa 请求到达上游并返回 402（需要密钥或支付凭据）。
- 自带密钥的完整分析和原数据库计数尚需生产配置验证。
- 本机 Node 26 的 experimental webstorage 会影响既有 happy-dom 测试，验证时使用 `NODE_OPTIONS=--no-experimental-webstorage pnpm test`。部署与 CI 建议使用 Node 22 LTS。
