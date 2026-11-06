# QQ Bot × Cloudflare Workers × AgnesAI

基于 Cloudflare Workers 的 QQ 机器人。默认角色为《崩坏：星穹铁道》中的昔涟，使用 AgnesAI 免费模型作为主模型，并在连续失败三次后自动切换到 Cloudflare Workers AI 的 `@cf/openai/gpt-oss-120b`。

> **免费优先策略：** 本项目不配置付费 Provider，也没有付费自动降级。Workers AI 在 Workers Free 计划每日免费 Neurons 配额耗尽后会请求失败；不要升级到 Workers Paid，也不要添加付款方式，即可避免 Workers AI 超额付费。Cloudflare 官方说明：Free 计划每天 10,000 Neurons，额度在 UTC 00:00 重置，Free 计划超额后请求失败。详见 [Workers AI 定价](https://developers.cloudflare.com/workers-ai/platform/pricing/)。

## 功能

- AgnesAI 主模型：`agnes-2.0-flash`；失败重试三次，仍失败则转到 Workers AI。
- Workers AI 原生 `AI` binding：兜底模型固定为 `@cf/openai/gpt-oss-120b`，不需要额外 API Key。
- Cloudflare D1 存储：群聊按群会话隔离，私聊按 QQ 平台用户会话隔离。
- 好感度：每个 QQ 开放平台用户 ID 独立保存，范围 0–100；模型每轮判断 -3 到 +3。
- 群聊回复概率：每个群独立配置；@机器人时强制回复；随机不回复的消息仍写入群上下文，但不调用 AI。
- 固定指令：`/uid`、`/sid`、`/好感度`、`/在吗`、`/帮助`、`/运行状态`、`/作者信息`、模型信息/列表/切换、用量查询、YouTube 指令及原有彩蛋。
- AI 可按需调用 Tavily 搜索、YouTube 搜索/详情和公开网页抓取。工具由 Worker 执行，最多三轮；执行前先向用户说明用途。
- `/admin` 管理后台：编辑系统提示词、查看会话、调整好感度/群回复概率、黑名单和工具开关。
- 黑名单用户消息不回复、不写入上下文。
- 保留 QQ Webhook Ed25519 验签、OpCode 13 回调签名和 OpCode 0 立即 ACK 的原有处理流程。

## 一、准备账号和密钥

### 1. QQ 开放平台

1. 打开 [QQ 开放平台](https://q.qq.com/) 并登录。
2. 创建机器人应用，进入应用开发设置。
3. 记录 **AppID** 和 **AppSecret**。AppSecret 不要提交到 Git。
4. 开通机器人所需的私聊/群聊消息事件和权限。
5. 部署后再回来填写 Webhook 地址：`https://你的Worker域名/webhook/qqbot`。

> 本项目的用户 ID、群 ID 使用 QQ 开放平台事件中的 OpenID/Group OpenID 等平台特殊 ID，不是普通 QQ 号或普通群号。执行 `/uid`、`/sid` 可查看实际收到的 ID。

### 2. AgnesAI

1. 打开 [AgnesAI API 平台](https://platform.agnes-ai.com/) 注册并登录。
2. 在 API 密钥页面申请/创建 API Key。
3. 复制密钥并安全保存。
4. 默认接口地址为 `https://apihub.agnes-ai.com/v1`，模型为 `agnes-2.0-flash`。
5. 可查看 [AgnesAI 官方文档](https://agnes-ai.com/en/docs/overview) 和 [官方模型集成说明](https://github.com/AgnesAI-Labs/AgnesAI-Models)。

AgnesAI 免费账户的速率和可用额度可能变化；本项目执行三次请求尝试，之后切换 Workers AI。遇到 401/403 等密钥或权限错误时，应检查控制台，不要在代码中硬编码密钥。

### 3. Cloudflare

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) 注册/登录。
2. 进入 **Workers & Pages**，确认账户处于 Workers Free 计划。
3. 首次部署可直接使用 Cloudflare 提供的 `workers.dev` 子域名，无需购买域名。
4. 本项目的 D1 数据库和 Workers AI 都通过 Cloudflare 原生绑定使用。

### 4. 可选：Tavily 搜索

1. 打开 [Tavily](https://www.tavily.com/) 注册账户。
2. 在 [Tavily Dashboard](https://app.tavily.com/) 创建 API Key。
3. Tavily 提供免费额度，具体数量和限制以账户控制台为准；默认免费计划额度用完后请求会失败，不会自动购买套餐。
4. 不配置 Key 或不在后台开启工具，机器人就不会调用 Tavily。

### 5. 可选：YouTube Data API v3

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)。
2. 创建一个项目。
3. 进入 API Library，搜索并启用 **YouTube Data API v3**。
4. 进入 APIs & Services → Credentials → Create Credentials → API key。
5. 建议对 API Key 设置 API 限制，只允许 YouTube Data API v3。
6. 复制 API Key，部署时作为 Worker Secret 设置。

官方步骤：[YouTube Data API 入门](https://developers.google.com/youtube/v3/getting-started)。

## 二、创建 D1 数据库

在项目目录安装 Wrangler 并登录：

```bash
npm install
npx wrangler login
```

创建 D1：

```bash
npx wrangler d1 create qq-bot-db
```

复制命令返回的 `database_id`，替换 `wrangler.toml` 中：

```toml
[[d1_databases]]
binding = "DB"
database_name = "qq-bot-db"
database_id = "替换为你的 database_id"
```

初始化全新数据库：

```bash
npx wrangler d1 execute qq-bot-db --remote --file=./schema.sql
```

如果你已经部署过旧版本，**不要删除数据库，也不要重新创建数据库**。执行新增迁移：

```bash
npx wrangler d1 execute qq-bot-db --remote --file=./migrations/0002_admin_social_features.sql
```

迁移会创建会话、好感度、群设置和黑名单表，并将旧版私聊历史复制到新会话表。原有表保留，不会主动删除旧数据。

## 三、配置 Wrangler 和密钥

确认 `wrangler.toml` 中有以下配置：

```toml
[ai]
binding = "AI"

[[d1_databases]]
binding = "DB"
database_name = "qq-bot-db"
database_id = "你的 D1 database_id"
```

Workers AI 使用原生绑定，不需要 `AI_API_KEY`。请不要把 `AI` binding 改成外部付费 API。

本地开发环境：

> 注意：`wrangler dev` 调用 Workers AI 时会访问你的 Cloudflare 账户，并消耗 Workers AI 额度；不是完全离线模拟。保持 Workers Free 计划时，消耗计入每日免费额度，额度耗尽后请求失败。

```bash
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，填写 QQ 和 AgnesAI 的密钥；按需填写 Tavily/YouTube Key。该文件已在 Git 忽略规则中，切勿提交真实密钥。

生产环境使用 Worker Secrets：

```bash
npx wrangler secret put QQ_BOT_APP_ID
npx wrangler secret put QQ_BOT_SECRET
npx wrangler secret put AGNESAI_API_KEY
npx wrangler secret put ADMIN_PASSWORD_HASH
```

可选密钥：

```bash
npx wrangler secret put TAVILY_API_KEY
npx wrangler secret put YOUTUBE_API_KEY
```

`AGNESAI_BASE_URL`、`AGNESAI_MODEL`、`AI_MAX_INPUT_TOKENS` 是非敏感配置，默认值已写入 `wrangler.toml`。不要把任何 Key 写入源码、README、前端或 D1。

### 生成管理员密码哈希

管理员密码不会明文存入数据库或源码。先在本地运行：

```bash
node scripts/generate-admin-hash.mjs
```

输入一个至少 12 位的强密码。脚本输出 PBKDF2-SHA256 哈希。将整行 `ADMIN_PASSWORD_HASH=...` 等号右侧的值复制出来，再执行：

```bash
npx wrangler secret put ADMIN_PASSWORD_HASH
```

将哈希值粘贴到提示符。不要把原始管理员密码或哈希提交到 Git。

## 四、部署和绑定域名

本地先做类型检查和构建检查：

```bash
npm run typecheck
npm run build
```

启动本地开发：

```bash
npm run dev
```

部署：

```bash
npm run deploy
```

部署成功后会得到 `https://<worker-name>.<你的子域>.workers.dev` 地址。

### 使用自定义域名（可选）

1. 在 Cloudflare 添加你拥有的域名，并按控制台提示修改域名注册商处的 Nameserver。
2. 打开 Workers & Pages → 选择本 Worker → Settings → Domains & Routes。
3. 选择 Add → Custom Domain，填写你希望使用的主机名，例如 `bot.example.com`。
4. 等待 Cloudflare 配置 DNS 和证书。
5. 使用自定义域名替换后续 Webhook 和后台地址。

域名注册本身通常需要付费；如果坚持零成本，使用免费的 `workers.dev` 地址即可。

## 五、配置 QQ Webhook

1. 回到 QQ 开放平台机器人应用的开发设置。
2. 找到事件订阅/Webhook 配置。
3. 填写：
   `https://你的Worker域名/webhook/qqbot`
4. 保存并完成平台回调验证。
5. 本 Worker 保留原有 OpCode 13 签名响应和 Ed25519 验签算法；不要自行修改 `src/utils/ed25519.ts`。
6. OpCode 0 验签通过后，Worker 使用 `ctx.waitUntil()` 后台处理消息，并立即返回 `{ "op": 12 }` ACK。

健康检查地址：`https://你的Worker域名/health`。

## 六、使用管理后台

打开：

`https://你的Worker域名/admin`

每次管理请求都需要提交管理员密码，后端使用 Worker Secret 中的 PBKDF2 哈希验证；没有单独公开的管理 JSON API。后台支持：

- **用户好感度：** 查询列表、按 QQ 平台用户 ID 设置 0–100。
- **群聊回复概率：** 按群 ID 设置 0–100%。@机器人仍为 100% 回复。
- **系统提示词：** 初始展示内置昔涟角色设定，修改后写入 D1；恢复默认会清空自定义值。
- **工具开关：** 分别启用/禁用 Tavily、YouTube 和网页抓取。
- **黑名单：** 将用户 ID 加入/移出黑名单。
- **会话上下文：** 查看最近会话及保存的上下文。

建议管理员密码只由可信管理员使用，不要在公共设备上保存密码。更换密码时重新生成哈希并再次运行 `wrangler secret put ADMIN_PASSWORD_HASH`。

## 七、机器人指令

| 指令 | 作用 |
|---|---|
| `/帮助` | 查看帮助 |
| `/在吗` | 固定回复 |
| `/uid` | 查看 QQ 平台用户特殊 ID |
| `/sid` | 查看当前会话/群特殊 ID |
| `/好感度` | 查询个人好感度 |
| `/运行状态` | 查看运行状态说明 |
| `/作者信息` | 作者信息 |
| `/模型信息` / `/模型列表` | 查看固定主模型与自动兜底 |
| `/切换模型 1` | 兼容旧指令；项目只保留 AgnesAI 主模型 |
| `/用量查询` | 查看用户 API 调用和 Token 统计 |
| `/油管功能` | 查看 YouTube 功能说明 |
| `/油管查询 关键词` | 固定指令搜索 YouTube |
| `/油管信息 视频ID` | 固定指令获取视频详情 |
| `/彩蛋功能` | 查看原有彩蛋 |
| `来杯好茶` | 原有彩蛋 |
| `我想看黄仁勋跳舞` | 原有图片彩蛋 |

## 八、AI 工具和免费额度说明

AI 只有在管理后台打开相应开关后才可调用工具：

- Tavily：互联网搜索摘要，需要 `TAVILY_API_KEY`。
- YouTube：视频搜索和详情，需要 `YOUTUBE_API_KEY`。
- 网页抓取：Worker 使用 `fetch` 获取公开 HTTPS 文本网页；拒绝常见本地/私网地址、非 HTTPS、非文本响应，并限制跳转次数和输出长度。

模型调用顺序固定为：

1. AgnesAI 第一次请求失败 → 第二次重试。
2. 第二次失败 → 第三次重试。
3. 第三次失败 → 使用 `env.AI.run("@cf/openai/gpt-oss-120b", ...)`。
4. Workers AI 也失败（例如免费额度耗尽）→ 给用户返回错误，不再请求任何其他服务。

Cloudflare Workers AI 免费额度及限制以[官方定价页](https://developers.cloudflare.com/workers-ai/platform/pricing/)为准。Free 计划为每天 10,000 Neurons，UTC 00:00 重置；Free 计划超过限额时请求失败。**不要将账户升级为 Workers Paid，不要启用任何付费降级。** AgnesAI、Tavily、YouTube 的免费政策和配额由各服务商决定，可能变化；使用前请在各自控制台核对，避免开启付费套餐或超额计费。

## 九、开发与项目结构

```text
src/
  adapters/qqbot-cf.ts   QQ Webhook、固定指令、对话流程
  api/qqbot-api.ts       QQ 消息发送客户端
  admin.ts               /admin 单入口和密码验证
  db/index.ts            D1 数据访问层
  persona.ts             默认昔涟系统提示词
  providers/index.ts     AgnesAI 三次重试与 Workers AI 兜底
  tools.ts               Worker 内部工具执行
  utils/ed25519.ts       原有签名算法（禁止修改）
migrations/
  0002_admin_social_features.sql
scripts/
  generate-admin-hash.mjs
schema.sql
wrangler.toml
```

常用命令：

```bash
npm install
npm run typecheck
npm run build
npm run dev
npm run deploy
```

## 十、故障排除

- **AgnesAI 401/403：** 检查 API Key、平台权限、模型名和接口地址。
- **AgnesAI 429：** 查看免费账户 RPM/额度；三次尝试后会自动走 Workers AI。
- **Workers AI 失败：** 检查 `wrangler.toml` 的 `[ai] binding = "AI"`，确认账户仍为 Workers Free 且当天免费 Neurons 尚有剩余。
- **D1 报表不存在：** 检查数据库 ID 和 schema/migration 是否执行到远程数据库。
- **QQ 回调验证失败：** 检查 AppID/AppSecret、Webhook 地址和事件订阅配置。不要改签名算法。
- **管理后台 401：** 检查 `ADMIN_PASSWORD_HASH` 是否作为 Worker Secret 设置；必须使用哈希值，不是原始密码。
- **工具无响应：** 检查管理后台工具开关和对应 API Key。工具默认关闭。
- **机器人不回复群消息：** 检查该群回复概率；@机器人可强制触发。确认消息用户没有在黑名单中。

## License

MIT
