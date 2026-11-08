# QQ Bot × Cloudflare Workers × NVIDIA NIM

> **开源地址**：[github.com/SYSTEM-Intel-MIC/qqbot-cloudflare](https://github.com/SYSTEM-Intel-MIC/qqbot-cloudflare) · MIT · 欢迎 Issue / PR
>
> **从 GitHub 克隆后的 5 步**：① `npm install` → ② 复制 `.dev.vars.example` 为 `.dev.vars` 并填入 5 个密钥 → ③ 建 D1 数据库，把 `wrangler.toml` 的 `database_id` 换成自己的 → ④ 把 `[[routes]]` 的 `pattern` 换成自己的域名（不用自定义域名就删掉整段，用免费 `workers.dev`）→ ⑤ `npm run deploy`，再到 QQ 开放平台填 `https://你的域名/webhook/qqbot`。详见第十一章「开源发布与安全」。

基于 Cloudflare Workers 的 QQ 机器人。默认角色为《崩坏：星穹铁道》中的昔涟，使用 [NVIDIA NIM](https://build.nvidia.com/) 免费模型作为主模型，连续失败两次后自动切换到 Cloudflare Workers AI 的 `@cf/openai/gpt-oss-120b`。

> **NVIDIA NIM 模型迭代速度快，若发现不可用请自行查找最新可用模型**。到 [build.nvidia.com](https://build.nvidia.com/) 模型目录挑选，或执行
> `curl -s https://integrate.api.nvidia.com/v1/models -H "Authorization: Bearer $NVIDIA_API_KEY"`
> 拉当前账号可用列表，把 `wrangler.toml [vars]` 的 `NVIDIA_MODEL` 改成新模型名后重新部署即可，**不需要改代码**。

> **免费优先策略：** 本项目不配置付费 Provider，也没有付费自动降级。Workers AI 在 Workers Free 计划每日免费 Neurons 配额耗尽后会请求失败；不要升级到 Workers Paid，也不要添加付款方式，即可避免 Workers AI 超额付费。Cloudflare 官方说明：Free 计划每天 10,000 Neurons，额度在 UTC 00:00 重置，Free 计划超额后请求失败。详见 [Workers AI 定价](https://developers.cloudflare.com/workers-ai/platform/pricing/)。

## 功能

- NVIDIA NIM 主模型：`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`（免费、支持工具调用的多模态推理模型）；失败最多重试两次（每次 8 秒超时，鉴权/URL 类 4xx 不重试直接切兜底），仍失败则转到 Workers AI；整条消息链路有 25 秒总闸，超时会中止仍在跑的请求。**NIM 模型迭代快，模型不可用时请自行查最新可用模型**（见开头说明）。
- Workers AI 原生 `AI` binding：兜底模型固定为 `@cf/openai/gpt-oss-120b`，不需要额外 API Key。
- Cloudflare D1 存储：群聊按群会话隔离，私聊按 QQ 平台用户会话隔离。
- 好感度：每个 QQ 开放平台用户 ID 独立保存，范围 0–100；模型每轮判断 -3 到 +3。
- 群聊回复概率：每个群独立配置；@机器人时强制回复；随机不回复的消息仍写入群上下文，但不调用 AI。
- 固定指令：`/uid`、`/sid`、`/好感度`、`/在吗`、`/帮助`、`/运行状态`、`/作者信息`、`/用量查询`、`/工具状态`、`/群回复概率 0-100`、**`/维基`、`/时间`、`/天气`**及原有彩蛋。**优先级最高，100% 回复**：不受黑名单、群回复概率、AI 故障影响，**群聊里不 @ 机器人直接发 `/sid` / `/在吗` 等也照样回复**（匹配前会去掉 mention 标签、纯文本 @、全角空格与全角斜杠）。前提是平台已开通 `GROUP_MESSAGE_CREATE` 全量群消息推送，否则事件根本不会到 Worker。**并非所有固定指令都以 `/` 开头**：中文彩蛋 `来杯好茶`、`我想看黄仁勋跳舞` 本来就没有斜杠；`/` 系列另支持无斜杠别名（`在吗`、`帮助`、`工具状态`、`天气 北京`、`sid`、`uid` 等），匹配链路里不用 `startsWith('/')` 做前置过滤。失效的 `/模型列表`、`/切换模型`、`/模型信息` 已移除。
- AI 可按需调用 **免密钥的维基百科、时间/时区、天气、网页抓取**，以及需要 Key 的 Tavily 联网搜索（唯一的联网搜索工具）。工具由 Worker 执行，最多三轮；一次用户消息只发送一条最终回复（不发送中间预告，避免推理过程外泄、也避免浪费被动回复次数）。真实工具调用会落一条快照到 D1，用 `/工具状态` 或管理后台「系统」页查看——**模型看不到 Worker 的执行记录，问它「有没有搜索」得到的回答不可信**。
- AI 超时、工具失败、空回复或**输出被掐断**时，固定兜底提示只发给用户、**不写入会话历史**，避免下一轮把「再问我一次」当成上一题的延续而答非所问；截断会先自动重试一次要求简短完整回答。
- `/admin` 管理后台：**分群选择 + 每群独立设置（GUI 开关/滑块/下拉）**、动态读取全部设置、用户好感度滑块与预设、群聊消息逐条编辑删除、全局 AI 总开关、工具开关卡片、会话筛选、深浅主题。
- 黑名单用户消息不回复、不写入上下文；纯 @、乱码与系统字段 dump 等非对话内容同样静默忽略（不丢给 AI、不计上下文）。
- 保留 QQ Webhook Ed25519 验签、OpCode 13 回调签名和 OpCode 0 立即 ACK 的原有处理流程。

## 一、准备账号和密钥

### 1. QQ 开放平台

1. 打开 [QQ 开放平台](https://q.qq.com/) 并登录。
2. 创建机器人应用，进入应用开发设置。
3. 记录 **AppID** 和 **AppSecret**。AppSecret 不要提交到 Git。
4. 开通机器人所需的私聊/群聊消息事件和权限。
5. 部署后再回来填写 Webhook 地址：`https://你的Worker域名/webhook/qqbot`。

> 本项目的用户 ID、群 ID 使用 QQ 开放平台事件中的 OpenID/Group OpenID 等平台特殊 ID，不是普通 QQ 号或普通群号。执行 `/uid`、`/sid` 可查看实际收到的 ID。

### 2. NVIDIA NIM（主模型）

1. 打开 [build.nvidia.com](https://build.nvidia.com/) 注册并登录（免费层，无需信用卡）。
2. 在任意模型页点 **Generate API Key / Get API Key**，生成一把 `nvapi-` 开头的 Key；这把 Key 对整个模型目录通用。
3. 复制密钥填到 `.dev.vars` 的 `NVIDIA_API_KEY`。**不要提交到 Git。**
4. 接口地址固定为 `https://integrate.api.nvidia.com/v1`（OpenAI 兼容），当前主模型为 `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`。该模型支持 `tools` 工具调用，但**思考会占用 token**；如果 `/工具状态` 的「最近一次主模型失败」显示 `returned reasoning only`，说明它把预算全花在思考上，换一个更新的非推理模型即可。
5. 参考 [NVIDIA NIM API 文档](https://docs.api.nvidia.com/nim/) 与 [模型目录](https://build.nvidia.com/)。

> **NVIDIA NIM 模型迭代速度快，若发现不可用请自行查找最新可用模型**：目录里的模型会不断新增、下线、重命名，免费层可用范围也可能调整。用
> `curl -s https://integrate.api.nvidia.com/v1/models -H "Authorization: Bearer $NVIDIA_API_KEY"`
> 看返回的 `data[].id`，挑一个当前可用模型，改 `wrangler.toml [vars]` 的 `NVIDIA_MODEL` 并重新部署。不要写死等待旧模型恢复。

免费层的速率与额度由 NVIDIA 决定；本项目最多两次请求尝试，之后自动切换 Workers AI。遇 401/403 先检查 Key，不要在代码里硬编码密钥。

### 3. Cloudflare

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) 注册/登录。
2. 进入 **Workers & Pages**，确认账户处于 Workers Free 计划。
3. 首次部署可直接使用 Cloudflare 提供的 `workers.dev` 子域名，无需购买域名。
4. 本项目的 D1 数据库和 Workers AI 都通过 Cloudflare 原生绑定使用。

### 4. 可选：Tavily 搜索（唯一联网搜索工具）

1. 打开 [Tavily](https://www.tavily.com/) 注册账户。
2. 在 [Tavily Dashboard](https://app.tavily.com/) 创建 API Key。
3. Tavily 提供免费额度，具体数量和限制以账户控制台为准；默认免费计划额度用完后请求会失败，不会自动购买套餐。
4. 只要部署时带了 `TAVILY_API_KEY`，且管理后台没有手动关掉搜索开关，机器人就能调用 Tavily。不配置 Key 则不会调用。本项目所有联网搜索（网页、新闻、视频、最新资料）统一由 Tavily 承担，不再使用 YouTube Data API。

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

初始化数据库：

```bash
npx wrangler d1 execute qq-bot-db --remote --file=./schema.sql
```

本项目**不再提供旧库迁移**：`schema.sql` 一次性建好全部表（用量、全局设置、会话、好感度、群设置、黑名单），没有 `migrations/` 目录，也不再读取旧版 `user_context` 表。新装或重建数据库都只需执行上面这一条；从旧版本升级请自行导出/导入数据，不要依赖代码层兼容逻辑。

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

编辑 `.dev.vars`，**只填写密钥**：QQ / NVIDIA NIM 凭据、可选的 Tavily Key，以及管理员密码。非敏感配置一律写在 `wrangler.toml [vars]`，不要放进这个文件（原因见下文）。该文件已在 Git 忽略规则中，切勿提交真实密钥。

生产环境使用 Worker Secrets：

```bash
npx wrangler secret put QQ_BOT_APP_ID
npx wrangler secret put QQ_BOT_SECRET
npx wrangler secret put NVIDIA_API_KEY
npx wrangler secret put ADMIN_PASSWORD
```

可选密钥：

```bash
npx wrangler secret put TAVILY_API_KEY
```

`QQ_BOT_VERIFY_SIGNATURE`、`NVIDIA_BASE_URL`、`NVIDIA_MODEL`、`AI_MAX_INPUT_TOKENS` 是非敏感配置，**只写在 `wrangler.toml [vars]`**：随代码一起部署、明文可 review，改完不需要动任何 Secret。不要把任何 Key 写入源码、README、前端或 D1。

#### 部署时自动带上密钥（默认）

`.dev.vars` 本身只被 `wrangler dev` 读取；但 `npm run deploy` 使用了 Wrangler 原生的 `--secrets-file`，一条命令同时上传代码与 `.dev.vars` 里的全部键值。**Wrangler 不区分「密钥」和「普通配置」——文件里每一行都会被写成加密的 Worker Secret**（dry-run 中显示为 `(hidden)`）。所以本项目的 `.dev.vars` 只保留 5 个真正的密钥，普通配置全在 `[vars]`。该选项是累加式的：文件中被省略的 Secret 不会被删除。

```bash
npm run deploy          # 代码 + .dev.vars 全部条目，一次上传
npm run deploy:code     # 只部署代码，不碰密钥
npm run build           # 类型检查 + 部署 dry-run，不上传任何东西
```

Wrangler 只作为本地 devDependency 安装在 `node_modules/.bin`，没有全局命令。请始终用 `npm run ...` 或 `npx wrangler ...`；直接在终端敲 `wrangler deploy ...` 会报「不是内部或外部命令」。依赖缺失时先执行 `npm ci`。

**为什么 `AI_MAX_INPUT_TOKENS` 这类配置不该被存成 Secret**：`--secrets-file .dev.vars` 会把文件里**每一行**都写成 Worker Secret，没有「这个键只是普通配置」的概念；而且**同名 Secret 优先于 `wrangler.toml [vars]`**，一旦误传，本地临时改的值会悄悄覆盖生产配置，还无法在代码里 review。本项目已把这些非敏感项从 `.dev.vars` / `.dev.vars.example` 移除，只保留在 `[vars]`。

> **从旧版本升级必做**：`--secrets-file` 是累加式的，从 `.dev.vars` 删掉条目**不会删除线上已有的同名 Secret**。如果之前部署过旧版本，请执行一次（每条会提示确认）：
>
> ```bash
> npx wrangler secret delete QQ_BOT_VERIFY_SIGNATURE
> npx wrangler secret delete NVIDIA_BASE_URL
> npx wrangler secret delete NVIDIA_MODEL
> npx wrangler secret delete AI_MAX_INPUT_TOKENS
> npx wrangler secret delete YOUTUBE_API_KEY   # 已停用的 YouTube 功能
> ```
>
> 用 `npx wrangler secret list` 确认只剩 `QQ_BOT_APP_ID`、`QQ_BOT_SECRET`、`NVIDIA_API_KEY`、`TAVILY_API_KEY`、`ADMIN_PASSWORD`。之后 `npm run deploy` 就不会再把配置项写成 Secret。

若只想精确同步白名单内的 5 个密钥键并校验必需项，可用可选工具；它也会拒绝把非敏感配置写进 `.dev.vars`：

```bash
npm run sync:secrets:dry   # 只列出白名单内将同步的键，不上传
npm run sync:secrets       # 按白名单同步，并校验必需项
```

CI/GitHub Actions 里没有 `.dev.vars`（被 Git 忽略），需要把密钥存到仓库 Secrets，由 workflow 生成临时键值文件后执行 `npx wrangler deploy --secrets-file <临时文件>`，或改用 `npx wrangler secret bulk`。

### 设置管理员密码（明文）

后台密码就是 `.dev.vars` 里 `ADMIN_PASSWORD=` 等号右侧的**明文字符串**，登录时原样输入即可。项目不再使用 PBKDF2 哈希，避免「密码与哈希对不上」或编码差异导致怎么输都被判错。

首次配置：

1. 打开 `.dev.vars`，把 `ADMIN_PASSWORD=CHANGE_ME_SET_YOUR_PASSWORD` 这一行的占位值改成你自己的强密码：

   ```text
   ADMIN_PASSWORD=换成你自己的强密码
   ```

   （若从旧版本升级，文件里可能仍是 `ADMIN_PASSWORD_HASH=pbkdf2$...`，把整行替换成上面这一行即可。）

2. 用标准部署命令上传（会把这一项作为**加密的 Worker Secret** 写入 Cloudflare，值本身是明文密码）：

   ```bash
   npx wrangler deploy --secrets-file .dev.vars
   ```

   也可以单独设置：`npx wrangler secret put ADMIN_PASSWORD`。

3. 打开 `https://<你的Worker域名>/admin`，输入第 1 步填的明文密码。

要点：

- 密码只是**代码里不做哈希**，并非写进源码或数据库：它仍是 Cloudflare 加密保存的 Worker Secret，不进 Git、不进前端、不进 D1；日志也不打印密码。`.dev.vars` 已被 Git 忽略，切勿提交或公开。
- 如果 `.dev.vars` 仍是占位值 `CHANGE_ME_SET_YOUR_PASSWORD`，或根本没有 `ADMIN_PASSWORD`，后台会明确返回「管理员密码尚未设置：请在 .dev.vars 的 ADMIN_PASSWORD 填写明文密码后重新部署」，而**不会**用一个公开默认密码放行。打开 `https://<域名>/admin` 输入密码即可验证。
- 改密码：改 `.dev.vars` 的这一行再重新部署即可，不需要任何生成脚本。
- 后台连续输错 8 次后，同一 IP 在 10 分钟内返回 429——**这期间即使输对密码也会被拒绝**。等待 10 分钟或换网络即可；也可用 `npx wrangler tail` 看 `[Admin]` 日志确认是「明文密码不匹配」还是「未配置」。
- 旧的 `ADMIN_PASSWORD_HASH` Secret 若还留在云端，可用 `npx wrangler secret delete ADMIN_PASSWORD_HASH` 清理（不清理也不影响，代码已不再读取）。

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

部署（**标准命令**：一行同时上传代码与 `.dev.vars` 里的密钥）：

```bash
npx wrangler deploy --secrets-file .dev.vars
```

`npm run deploy` 是这条命令的快捷别名；`npm run deploy:code` 只部署代码、不更新密钥。Wrangler 只作为本地 devDependency 安装，请始终用 `npm run ...` 或 `npx wrangler ...`，直接敲 `wrangler ...` 会报「不是内部或外部命令」。

部署成功后会得到 `https://<worker-name>.<你的子域>.workers.dev` 地址。首次部署或轮换密钥后，需要在 QQ 开放平台重新保存一次回调地址。

### 使用自定义域名（可选）

1. 在 Cloudflare 添加你拥有的域名，并按控制台提示修改域名注册商处的 Nameserver。
2. 打开 Workers & Pages → 选择本 Worker → Settings → Domains & Routes。
3. 选择 Add → Custom Domain，填写你希望使用的主机名，例如 `bot.example.com`。
4. 等待 Cloudflare 配置 DNS 和证书。
5. **把同一个域名写进 `wrangler.toml`**（本项目已按实际域名配置好）：

   ```toml
   [[routes]]
   pattern = "bot.example.com"
   custom_domain = true
   ```

6. 使用自定义域名替换后续 Webhook 和后台地址。

> 不需要自定义域名时，直接删掉 `wrangler.toml` 里的整个 `[[routes]]` 块即可：`workers_dev = true` 会保留免费的 `*.workers.dev` 地址，Webhook 填这个地址同样能用。

> **重要**：`wrangler deploy` 以本地配置为唯一来源，会用 `wrangler.toml` 里的 `routes` **覆盖**线上路由表。只在控制台添加、本地没声明的 Custom Domain 会在下一次 CLI 部署时被移除，Webhook 随之失效。部署时若出现 `The local configuration ... differs from the remote configuration` 的确认提示，先按 `n`，检查 diff 里有没有 `- pattern: "你的域名"` 这一行；有就说明本地漏声明了域名，补上 `[[routes]]` 再部署。
>
> 另一个连带坑：一旦声明了 `routes`，Wrangler 4.x 会把 `workers_dev` 和 `preview_urls` 默认改成 `false`，部署后 `*.workers.dev` 地址和预览 URL 会被关掉。本项目已在 `wrangler.toml` 里显式写回 `workers_dev = true` / `preview_urls = true` 保留原状。判读原则：diff 里凡是以 `-` 开头、`+` 侧没有对应项的字段，都是线上将被删掉的开关；只留 `+ assets`、`+ database_name`、路由的 `zone_name` / `enabled` / `previews_enabled`、`redact_query_string` 这类元数据时，可以放心按 `Y`。
>
> **为什么以前不弹、现在才弹**：Wrangler 4.x 的这段检查只在远端 Worker 的 `last_deployed_from === "dash"` 时才执行（见 `preUploadApiChecks`）。只要这个 Worker 上一次部署来源是 CLI，整段 diff 检查会被直接跳过；一旦在 Dashboard 侧动过它（加自定义域名、改设置、在线编辑器保存等），来源被标成 `dash`，之后每次 `wrangler deploy` 都会拉远端配置做 diff。且只有「纯新增」才算 `nonDestructive`，出现任意 `-` / `~` 就会弹确认框——所以就算只剩无害元数据也会一直弹。成功按一次 `Y` 完成部署后，来源回到 CLI，提示就不再出现。

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

新版控制台是带登录页的单页应用：密码只保存在当前页面内存中，不写 localStorage / Cookie，退出登录即刻清除。每次请求仍由 Worker 与 Secret 中的明文 `ADMIN_PASSWORD` 做常量时间比较（不做哈希）；连续输错 8 次按 IP 锁定 10 分钟。界面按「工作台 / 数据 / 配置 / 系统」分组导航，支持深浅主题、移动端响应式、Toast 反馈、加载态、空状态与二次确认，所有用户数据插入页面前都会做 HTML 转义。

**所有设置都从 D1 动态读取，改完立即生效，不需要重新部署；所有编辑都用选择器、开关、滑块、下拉和预设按钮完成，不需要手输 ID。**

| 分区 | 功能 |
|---|---|
| 概览 | 用户 / 群 / 会话 / 黑名单数量，今日与累计 API 调用、Token、**今日 NVIDIA NIM / Workers AI 各调用次数**、近 7 天用量柱状图，快捷入口、运行状态、群聊概览与最近会话 |
| **群聊** | **左侧群列表点选，右侧该群独立详情**：AI 回复开关、仅 @ 回复开关、允许工具开关、回复概率滑块 + 0/30/60/100 预设、语气下拉（继承全局 / 温柔 / 活泼 / 简明）、一键恢复默认；下方是**该群消息记录**，按序号与角色气泡展示，可逐条编辑/删除、清空会话 |
| **用户** | 左侧用户列表点选，右侧好感度大数字 + 滑块 + 5 档预设（陌生→满值）、黑名单开关、复制 ID，无需输入用户 ID |
| 会话记录 | 全部 / 群聊 / 私聊分段筛选，会话元信息表格，查看气泡消息并逐条编辑删除、清空或删除会话 |
| 工具开关 | 6 张工具卡片即时保存，标明「免费 / 需 Key」及来源（按 Key 自动 / 后台手动），提供「全部开启 / 仅免费工具 / 全部关闭」快捷按钮 |
| 系统提示词 | 编辑昔涟人格设定，实时字数统计、未保存提醒、一键恢复内置提示词 |
| **全局设置** | AI 总开关（关掉后只回固定指令，@ 也不触发 AI）、新群默认回复概率滑块 + 预设、默认群策略只读展示 |
| 系统信息 | 各密钥「是否就绪」（只返回布尔值）、固定指令与无斜杠别名全集、最近一次真实工具调用、安全说明 |

**群目录**会自动合并「显式配置过的群」和「聊过天因此有 `group:` 会话的群」，群里发一条消息后即可在下拉里选到，无需查 `group_openid`。群级设置的优先级：固定指令（永远 100%）→ 全局 AI 总开关 → 黑名单 → 本群「AI 回复 / 仅 @ / 允许工具 / 概率 / 语气」→ AI 链路。概率存在 `group_settings`，其余开关存在 `global_settings.group_options:<群ID>`，不改数据库 schema。

**工具开关规则**：维基百科、时间、天气、网页抓取**完全免费、无需任何 API Key，默认全开**；旧版后台保存过的开关里没有这些键时也会按默认开启。后台从未保存过时，需要 Key 的工具按已配置的 Key 自动启用；一旦在后台保存过，就以后台设置为准。概览与工具页会显示当前来源。

建议管理员密码只由可信管理员使用，不要在公共设备上保存密码。更换密码时直接改 `.dev.vars` 的 `ADMIN_PASSWORD` 并重新部署，或运行 `npx wrangler secret put ADMIN_PASSWORD`。线上排查请用 `npx wrangler tail` 看日志。

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
| `/用量查询` | 查看个人 API 调用 / Token 统计，以及**今日全站 NVIDIA NIM、Workers AI 各调用多少次**（北京时间计日） |
| `/工具状态` | 查看工具开关来源、Key 配置、免密钥工具状态、可用工具、**最近一次真实工具调用**，以及**主模型线上自检**（实际生效的接口地址 / 模型 / Key 长度、一次最小请求的 HTTP 状态与耗时）与**最近一次主模型失败原因** |
| `/群回复概率 0-100` | 设置本群回复概率（默认 30，@ 机器人与固定指令始终必回） |
| **`/维基 关键词`** | 查维基百科词条标题 / 摘要 / 链接，**免费无需 Key**；支持 `维基 量子力学` |
| **`/时间 城市`** | 查当前日期、星期、城市本地时间与 UTC 偏移，**纯本地计算，不联网**；不填城市默认北京时间 |
| **`/天气 城市`** | 查当前天气与未来 3 天预报（Open-Meteo），**免费无需 Key**；支持 `天气 上海` |
| `/彩蛋功能` | 查看原有彩蛋 |
| `来杯好茶` | 原有彩蛋（**无 `/` 的固定指令**） |
| `我想看黄仁勋跳舞` | 原有图片彩蛋（**无 `/` 的固定指令**） |
| `在吗` / `帮助` / `工具状态` / `维基 …` / `时间 …` / `天气 …` / `sid` / `uid` … | 对应 `/` 指令的无斜杠别名，整句相同或「别名 + 空格 + 参数」才命中 |

所有固定指令在 `handleMessage` 最开头处理，**先于黑名单、群回复概率和 AI 链路**，因此 100% 回复；群聊不 @ 机器人的 `GROUP_MESSAGE_CREATE` 全量消息同样走这条通道，不受默认 30% 回复概率影响。指令文本先经 `normalizeCommand` 归一化（去 `<@!…>`、去开头纯文本 @、全角空格/全角斜杠转半角、trim），所以 `<@!123> /sid`、`／sid`、`  /在吗  ` 都能命中。指令发送失败会自动降级为主动消息重试一次；若 API 客户端未配置（缺 `QQ_BOT_APP_ID` / `QQ_BOT_SECRET`），日志会明确报 `Cannot reply: API client unavailable`，不再误报 `Reply sent OK`。固定指令全集见管理后台「系统」页（含无斜杠别名），**不以 `/` 开头的中文彩蛋同样在这条通道里**，群聊不 @ 也 100% 回复。主模型固定由 `NVIDIA_MODEL` 配置、Workers AI 自动兜底，**没有用户可切换的模型列表**，相关旧指令已删除。

**固定指令与它的回复完全隔离于 AI 和上下文**：命中后立即 `return`，不会调用任何模型、不会 `appendMessages` 写入 `conversations`、不改好感度、不计用量；指令发送失败的降级回复同样不写历史。因此指令问答永远不会成为下一轮 AI 对话的上下文，也不会把 `/sid` 这类系统信息带进角色对话里。同理，**纯 @、乱码（大量 U+FFFD）、同一字符连续刷屏、以及成串 `appid / openid / timestamp / signature` 的系统字段 dump 会被直接忽略**：不丢给 AI、不写上下文、不回复，避免推理模型对着噪声吐出大段英文思考或逐字段整理的长列表。噪声过滤放在固定指令**之后**，所以哪怕消息长得像系统 dump，只要它是一条固定指令也一定 100% 回复。

**消息幂等**：平台超时重试会把同一个 `d.id` 重复推给 Worker。代码用 `global_settings.seen_message_ids` 记录最近 10 分钟、最多 200 个已处理的 `msg_id`，重复事件直接丢弃（不回、不跑 AI、不写历史），从根上消除「一条消息连回好几条」。

**模型调用次数统计**：每次模型请求成功返回时，按最终由哪个 provider 回答累加一次（含工具轮、强制最终答案重试、主模型失败后的 Workers AI 兜底）。计数写入 `global_settings` 的按日 key `provider_usage:<provider>:<YYYY-MM-DD>`，用 SQL `ON CONFLICT … +1` 原子自增，**不改表结构、不需要迁移、按北京时间（UTC+8）计日**；`/用量查询` 与后台概览都显示今日 NVIDIA NIM / Workers AI 次数。这是「模型请求次数」，不是 `api_usage` 里的「用户对话次数」：一条消息走工具循环可能计多次；超时 / 脏输出等失败轮不计 Token、不写会话历史，但已完成的模型请求照样计数，能直接看出主模型是否在频繁兜底。`/工具状态` 的线上自检是一次独立的最小探测请求，不计入这个次数。

## 八、AI 工具和免费额度说明

工具启用规则（见第六节管理后台）：**免密钥工具默认全开**；后台保存过 `tools_enabled` 就以后台为准；没保存过时按 API Key 自动启用需要 Key 的工具，避免「配了 Key 但模型拿不到任何工具」。旧版只保存过 3 个键的记录不会误关新增的免密钥工具。

**完全免费、无需任何 API Key（默认开启）**

- **维基百科 `wikipedia_search`**：Wikipedia 官方 `action=query&generator=search&prop=extracts`，一次请求返回标题、摘要与链接；`lang` 可选 `zh`（默认）/ `en`。
- **时间与时区 `current_time`**：Worker 用 `Intl.DateTimeFormat` 本地计算，不联网、不消耗额度；支持 `Asia/Shanghai` 等 IANA 时区与「北京 / 东京 / New York / 伦敦」等中英文城市别名，返回本地时间、星期、UTC 偏移、北京时间参考。
- **天气 `get_weather`**：[Open-Meteo](https://open-meteo.com/) 免费开放接口（地理编码 + 预报），返回当前温度、体感、湿度、风速、天气现象与未来 1–3 天预报，WMO 天气码已转中文。
- **网页抓取 `fetch_webpage`**：Worker 用 `fetch` 获取公开 HTTPS 文本网页；拒绝常见本地/私网地址、非 HTTPS、非文本响应，并限制跳转次数和输出长度。

**需要 API Key（可选）**

- Tavily：唯一联网搜索工具，网页、新闻、视频、人物与最新资料都由它检索，需要 `TAVILY_API_KEY`。

以上前三项（维基百科 / 时间 / 天气）既可以让 AI 自动调用（例如「现在几点」「北京天气」「量子力学是什么」），也可以走 `/时间`、`/天气`、`/维基` 固定指令直接查询——固定指令不经过 AI、不写上下文、100% 回复。单个群还可以在后台「群聊」页关掉「允许 AI 调用工具」。

模型调用顺序固定为：

1. NVIDIA NIM 第一次请求失败 → 第二次重试（每次 8 秒超时，合计约 16.5 秒；若错误是 4xx 配置问题则不重试，立即切兜底）。
2. 第二次仍失败 → 使用 `env.AI.run("@cf/openai/gpt-oss-120b", ...)`。
3. Workers AI 也失败（例如免费额度耗尽）→ 用已取得的工具结果强制生成最终回复；仍失败则返回角色内的中文提示，不再请求任何其他服务。
4. 整条链路 25 秒总闸；剩余预算不足 8 秒时不再开新工具轮，直接要求最终回复。总闸触发会 `abort` 未完成的请求，并给一条角色内的超时提示（该提示不写入会话历史）。

> **为什么换了主模型（2026-11-07 实测）**：上一版 AgnesAI 从 Cloudflare Worker 出站时被上游边缘按来源 IP 限流，返回 `429 / error code: 1015`（6ms 内响应，请求根本没到后端），而同一把 Key 从本机请求正常。这是网络来源层面的限制，改代码、重试、加冷却都无解，因此改用 NVIDIA NIM。旧的 `AGNESAI_*` 配置项已全部移除。

**主模型「配置正常却 100% 回退」怎么查：** 先发 `/用量查询` 看今日 NVIDIA NIM / Workers AI 次数，再发 `/工具状态` 看线上自检。① 自检 `HTTP 401/403`：Key 不对或没权限，执行 `npm run deploy`（带 `--secrets-file .dev.vars`）同步线上 Secret，注意 `npm run deploy:code` 只传代码，且 `wrangler.toml [vars]` 不会覆盖同名 Secret。② 自检 `HTTP 404` 或报模型不可用：**NVIDIA NIM 模型迭代速度快，若发现不可用请自行查找最新可用模型**（见开头 `/v1/models` 方法）。③ 自检 `HTTP 429`：免费层 RPM/额度，两次尝试后自动走 Workers AI。④ `最近一次主模型失败` 显示 `returned reasoning only`：推理模型把预算花在思考上，换更新的非推理模型。`/工具状态` 会用线上真实 env 做一次最小请求，回显实际接口地址、模型名、Key 长度与 HTTP 状态，并显示 `global_settings.last_ai_error` 里由 `chatWithFallback` 写入的真实失败原因；本机 `npx wrangler tail` 被代理挡住（`Unexpected server response: 502`）时，这条指令是首选替代通道。

兜底模型 `@cf/openai/gpt-oss-120b` 是推理模型，思考过程在 `message.reasoning`、最终回复在 `message.content`；代码只取后者并追加 `reasoning: { effort: "low" }`，不会把英文思考发给用户。工具结果回喂用标准 OpenAI `tool_calls` / `tool` + `tool_call_id` 格式（`assistant.content` 必须为 `""` 而非 `null`），否则平台会报 schema 错误或让模型复述历史 JSON。

Cloudflare Workers AI 免费额度及限制以[官方定价页](https://developers.cloudflare.com/workers-ai/platform/pricing/)为准。Free 计划为每天 10,000 Neurons，UTC 00:00 重置；Free 计划超过限额时请求失败。**不要将账户升级为 Workers Paid，不要启用任何付费降级。** NVIDIA NIM、Tavily 的免费政策和配额由各服务商决定，可能变化；使用前请在各自控制台核对，避免开启付费套餐或超额计费。

## 九、开发与项目结构

```text
src/
  index.ts               Worker 入口：路由、env 装配（签名/ACK 主链路勿改）
  adapters/qqbot-cf.ts   QQ Webhook、固定指令、对话流程
  api/qqbot-api.ts       QQ 消息发送客户端
  admin.ts               /admin 鉴权、概览聚合 API、分群设置与消息编辑动作
  admin-page.ts          管理后台单页 HTML（内联 CSS/JS，无外部资源）
  db/index.ts            D1 数据访问层、群目录与每群独立设置（无旧库兼容逻辑）
  persona.ts             默认昔涟系统提示词
  providers/index.ts     NVIDIA NIM 快速重试与 Workers AI 兜底（推理/工具格式适配）
  tools.ts               工具目录 + 执行器（含免密钥的维基百科 / 时间 / 天气）
  utils/ed25519.ts       原有签名算法（禁止修改）
public/
  hrx-dance.gif          彩蛋静态图，由 Worker 自身域名提供
scripts/
  sync-secrets.mjs       可选：按白名单同步 Worker Secret
.github/workflows/ci.yml main 分支 typecheck
schema.sql               全新数据库建表，无迁移脚本
.dev.vars.example        5 个真密钥的模板（真正的 .dev.vars 不入库）
wrangler.toml            绑定与非敏感 [vars]
```

常用命令：

```bash
npm install
npm run typecheck
npm run build
npm run dev
npx wrangler deploy --secrets-file .dev.vars
```

## 十、故障排除

### 先用管理后台与实时日志定位

- **管理后台** `https://<你的Worker域名>/admin`：用 `ADMIN_PASSWORD` 明文登录。概览页有用户/群/会话/黑名单数量与 API 用量；「群聊」页可按群配置全部开关并逐条编辑群消息；「用户」页用滑块调好感度；「全局设置」页有 AI 总开关；「会话记录」页可筛选、编辑、删除上下文；「系统」页有指令全集与最近工具调用。**只显示配置是否就绪（布尔），不返回任何密钥值。**
- **主模型线上自检**：发 `/工具状态`（或私聊发 `工具状态`）。除了工具开关，它会用 Worker 实际读到的 env 发一次最小 NVIDIA NIM 请求，回显**实际接口地址、模型名、Key 长度、`HTTP xxx / Nms` 或错误文本**，以及 `最近一次主模型失败`。真实失败原因由 `chatWithFallback` 写进 D1 `global_settings.last_ai_error`。`npx wrangler tail` 被本机代理挡住（`Unexpected server response: 502`）时，这条固定指令是首选替代通道。
- **实时日志** `npx wrangler tail`（`wrangler.toml` 已把 `head_sampling_rate` 设为 1，不会漏日志）。发一条消息后照下表判读：

| 日志 | 结论 | 处理 |
|---|---|---|
| 完全没有 `[QQBot] ====== WEBHOOK` | 平台根本没推事件 | 查下面「群聊不回复」的平台侧清单 |
| `Missing signature headers` / `Invalid signature` | 被 401 挡在 Worker 入口 | 核对 `QQ_BOT_SECRET` 与平台 AppSecret，重新保存回调地址 |
| `[QQBot] Dispatch: GROUP_MESSAGE_CREATE` | 全量群消息已进 Worker | 继续看后面的 `Message` / `Fixed command` / `Reply sent OK` |
| `[QQBot] Fixed command handled (always replied; AI + history skipped)` | 固定指令已命中并发送，且确认没有调用 AI / 没有写上下文 | 群里仍看不到就查群内发言权限 |
| `[QQBot] Duplicate msg_id ignored` | 平台重推同一条事件，已幂等丢弃 | 正常现象，不需要处理 |
| `[QQBot] Non-conversational message ignored` | 纯 @ / 乱码 / 重复字符风暴 / 系统字段 dump，已静默忽略 | 正常现象；发正常文字或固定指令即可 |
| `[QQBot] AI failed or unsafe output` | 模型输出含内部通道标记或清洗后仍异常，已只发兜底且不写上下文 | 偶尔出现属正常自愈；持续出现看下面「吐英文 analysis」条目 |
| `[QQBot] Truncated reply detected` | 回复被掐断，正在重试一次要求简短完整回答 | 重试仍失败会发角色内兜底且不写历史；持续出现看下面「回复说到一半断掉」条目 |
| `[QQBot] Group option disabled AI for this message` | 该群在后台关了 AI 或设成「仅 @」 | 到后台「群聊」页选这个群检查开关 |
| `[QQBot] Global AI disabled by admin` | 后台「全局设置」里的 AI 总开关是关闭的 | 打开总开关；固定指令仍会回复 |
| `[QQBot] Skipped by reply probability` | 普通聊天被 30% 概率挡了（**固定指令不会出现这条**） | 群里发 `/群回复概率 100` |
| `[QQBot API] Passive reply failed` / `Active reply also failed` | 回复被平台拒 | 确认机器人有群内发言权限、未超主动消息频控 |
| `[AI] NVIDIA NIM unavailable; switching to Workers AI` | 主模型故障，已自动兜底 | 见下面 NVIDIA NIM 401/404/429 条目 |

- **NVIDIA NIM 401/403（含「今日主模型恒为 0、全部回退」）：** 先发 `/用量查询` 看今日两个 provider 次数，再发 `/工具状态` 看线上自检的 HTTP 状态与 `最近一次主模型失败`。若自检是 401/403 或接口地址不对，八成是**线上 Secret 与本地 `.dev.vars` 不一致**：执行 `npm run deploy`（带 `--secrets-file .dev.vars`）同步，注意 `npm run deploy:code` 只传代码。同时确认 `NVIDIA_API_KEY` 是 `nvapi-` 开头的有效 Key；代码已对 env 统一 `trim()`，可防 Secret 带空白/CRLF。
- **NVIDIA NIM 404 / 模型不可用 / 429：** **NVIDIA NIM 模型迭代速度快，若发现不可用请自行查找最新可用模型**——`curl -s https://integrate.api.nvidia.com/v1/models -H "Authorization: Bearer <你的Key>"`，从返回的 `data[].id` 里挑一个当前可用模型，改 `wrangler.toml [vars]` 的 `NVIDIA_MODEL` 后 `npm run deploy`；旧模型下线重试无用。429 是免费层 RPM/额度，两次尝试后自动走 Workers AI。若 `最近一次主模型失败` 是 `returned reasoning only`，说明推理模型没输出正文，换更新的非推理模型。
- **Workers AI 失败：** 检查 `wrangler.toml` 的 `[ai] binding = "AI"`，确认账户仍为 Workers Free 且当天免费 Neurons 尚有剩余。
- **D1 表不存在：** 检查数据库 ID，并对远程数据库执行 `npx wrangler d1 execute qq-bot-db --remote --file=./schema.sql`（本项目无迁移脚本）。
- **QQ 回调验证失败：** 检查 AppID/AppSecret、Webhook 地址（精确到 `/webhook/qqbot`）和事件订阅配置；确认 `.dev.vars` 已随部署上传。不要改签名算法。
- **管理后台 401 / 一直提示密码错误：** 密码就是 `.dev.vars` 里 `ADMIN_PASSWORD=` 的**明文值**（已取消 PBKDF2 哈希），前后不要带空格。① 打开后台页面输入密码即可验证；若提示「管理员密码错误」，确认 `.dev.vars` 的值与部署时一致。② 若仍是占位值 `CHANGE_ME_SET_YOUR_PASSWORD`，后台会明确提示「管理员密码尚未设置」。③ 连错 8 次会被锁 10 分钟（429），期间输对也被拒，等待或换网络。④ `npx wrangler tail` 看 `[Admin]` 日志区分「未配置」「占位值」「明文密码不匹配」，日志不会打印密码。旧的 `ADMIN_PASSWORD_HASH` 已废弃，可 `npx wrangler secret delete ADMIN_PASSWORD_HASH` 清理。
- **工具无响应 / 只回一句英文「We will say we will use a web search tool…」然后没下文：** 这是三条问题叠加的典型表现：① 工具没启用（`global_settings` 里没有 `tools_enabled` 且旧版本默认全关）；② 主模型失败后落到推理模型，把思考文本当成回复；③ 工具结果回喂格式不对或中间预告消耗了被动回复次数。当前代码已全部修复；部署后用 `npx wrangler tail` 看 `[QQBot] Tools`、`[QQBot] Executing tool:`、`[QQBot] Tool result:`、`[AI] Workers AI response:`。若 `[QQBot] Tools` 显示 `(none)`，检查 `.dev.vars` 的 Key 是否随部署上传，以及后台是否手动关了开关。
- **机器人回「（轻轻叹气）我这边想得久了些…」，下一句「你好」却答了上一题；问它「有没有调用 tavily」它编了一段解释：** 三件事叠在一起，当前版本已全部处理。
  1. 那句超时提示是 `handleMessage` 在 **25 秒总闸超时后写死的兜底字符串**，不是模型输出，更不是「整理思路不小心留下的语气提示」。括号神态来自 `persona.ts` 允许的角色口吻，所以看着像 AI 自己说的。
  2. 旧代码把这条兜底也写进会话历史，下一轮上下文变成 `user: 查下Windows最新版本 / assistant: …稍等下再问我一次 / user: 你好`，模型便把「再问一次」当成待办补答上一题，即所谓串台。**现在失败轮只发消息、不写历史、不改好感度。** 主模型单次超时现为 8 秒（2 次约 16.5 秒，4xx 不重试），既避免「12s×2 + Workers AI 兜底」必然撞 25 秒总闸，也给跨区链路留足余量；总闸触发会中止仍在跑的请求。
  3. 工具由 Worker 执行，模型只看得到回传的 `tool` 结果，看不到「系统是否真的调用过工具」的日志；被追问时会顺着提问编一段合情合理但**不可信**的解释。系统提示现已禁止它猜测运行机制，改为引导用 `/工具状态` 查；真实调用会写进 D1 的 `last_tool_call`，管理后台「系统」页同样可见。
  排查：`npx wrangler tail` 看 `[QQBot] Executing tool: tavily_search`、`[QQBot] Tool result:`、`[QQBot] AI call failed or timed out`；`/工具状态` 可确认 Tavily 是否被后台开关关掉。
- **AI 吐出一大段 `analysisUser posted…` / `__ AFF: 53` / `summary:` / `final<@…>`，或同一个字重复几十次，还连发好几条：** 这是推理模型把 harmony 的 `analysis` 通道当成 `content` 直接吐出来（不是 `<|channel|>` 标准包裹），加上平台重推同一事件造成的刷屏。当前版本的处理顺序是：① `looksLikeReasoningLeak` 识别裸 `analysis` / 畸形协议标签，触发一次「只给最终回复」的重试；② `sanitizeModelOutput` 剥掉推理段、协议标签、模型自造 mention、乱码和重复字符风暴；③ 只要检测到内部通道标记，整轮按脏输出处理 —— **只发一条角色内兜底，不写会话历史、不改好感度**，避免半清洗的中英混杂文本和脏格式污染后续对话；④ 系统提示与 `FINAL_ANSWER_HINT` 明确禁止外泄 `analysis` / `final` / `summary` / `__AFF` 等标记。合法的 `__SUMMARY__: …` / `__AFFECTION__: N` 协议不受影响，仍正常解析。**固定指令从一开始就短路，永远不会走到这条 AI 链路。** 另一个会造成「两条一模一样」的原因也已修掉：平台返回 2xx 但响应体为空/非 JSON 时，旧代码 `res.json()` 抛错会被误判为被动回复失败，再降级用主动消息重发一遍；现在发送成败只看 HTTP 状态。排查时看 `[QQBot] AI failed or unsafe output`（含 `internalMarkers` / `unsafe` 标记）、`[QQBot] Duplicate msg_id ignored` 与 `[QQBot API] Passive reply failed`。
- **回复说到一半突然断掉，停在「…：」或「- \*」：** 两个原因都已修。① 生成被 `max_tokens` 掐断：主模型/兜底模型的 `max_tokens` 已放宽到 3072/4096，`FINAL_ANSWER_HINT` 要求 200 字以内、不用 markdown 列表，并检测 `finish_reason: length`；`looksTruncated` 发现悬空冒号、半个列表项或未闭合加粗时会**自动重试一次要求简短完整回答**，重试仍失败才发角色内兜底，且半截内容绝不写入上下文。② 旧版 `stripSystemOutput` 有一条跨行正则（本意是删角色卡推理），会命中正常的 markdown 列表 `- **字段名**：说明 https://…`，从第二个 `*` 一路删到结尾，表现就是回复停在 `- *`。现已改成只做整行级的安全清理，内部协议统一交给 `sanitizeModelOutput`。系统提示也已禁止模型逐项整理用户贴来的系统字段 / 日志，这类消息会被噪声过滤直接忽略。排查看 `[QQBot] Truncated reply detected` 与 `[AI] NVIDIA NIM hit max_tokens`。
- **搜索后第二条回复发不出去：** 同一个 `msg_id` 的 `msg_seq` 必须递增；相同 `msg_id + msg_seq` 会被平台判为重复消息（`40054005`）。代码已按 msg_id 维护递增序号。
- **群里不 @ 机器人发 `/sid` / `来杯好茶` / `在吗` 没反应：** 代码侧已保证 100% 回复（见第七节；**中文彩蛋和无斜杠别名同样算固定指令**）。**发消息的同时开 `npx wrangler tail` 看日志**，比猜快得多：
  1. 完全没有 `[QQBot] ====== WEBHOOK`，或只有 `Dispatch: GROUP_AT_MESSAGE_CREATE` 而没有 `GROUP_MESSAGE_CREATE` → **平台根本没推不 @ 的群消息，代码侧再怎么保证 100% 也收不到**。第一步永远是**手机 QQ → 群设置 → 机器人设置 →「机器人可获取的群聊消息范围」选「获取群内全部消息」**（默认档是「仅获取@机器人的消息」，这一步在手机 QQ 里，不在开放平台网页）；第二步是开放平台「开发设置 → 回调配置」勾 `GROUP_MESSAGE_CREATE`（Webhook 模式专用）并重新点「确定配置」。`GROUP_MSG_RECEIVE` 只是开关事件，勾它没用；未上线机器人只在沙箱群/白名单推。
  2. 有 `[QQBot] Message` 但没有 `Fixed command handled` → 指令文本带了 @、空格或全角字符；归一化只处理 mention 标签、开头纯文本 @、全角空格与全角斜杠，对照日志里的原文按需补别名。
  3. 有 `Fixed command handled (always replied)` 但群里看不到 → 指令已命中，是发送被拒：看 `[QQBot API] Passive reply failed` / `Active reply also failed`，确认机器人有群内发言权限；`Cannot reply: API client unavailable` 表示 `QQ_BOT_APP_ID` / `QQ_BOT_SECRET` 没配。
  4. 出现 `Skipped by reply probability` → 说明这条**没被识别成固定指令**，检查原文与固定指令全集。
- **机器人不回复群消息（先按平台侧，再按代码侧）：**

  **平台侧（最常见，代码改不好这类问题）**
  1. **【最容易漏、且不在开放平台网页里】手机 QQ → 打开群 → 点机器人头像进「设置」→「机器人可获取的群聊消息范围」→ 选「获取群内全部消息」**，并开启「机器人主动在群聊内发言」。这个开关有三档：`仅获取@机器人的消息`（**默认**）、`获取@机器人的最近10条消息`、`获取群内全部消息`。停在默认档时，平台只推 `GROUP_AT_MESSAGE_CREATE`，不 @ 的消息**在到达 Worker 之前就被平台裁掉**——表现就是「@ 它才回、不 @ 不回」。改完重新发一条消息验证（WebSocket 接入需重启让机器人重新 Identify）。
  2. **Webhook 模式还需在开放平台「开发设置 → 回调配置」勾选 `GROUP_MESSAGE_CREATE`**（全量群消息，需单独授权），否则平台不会推这个事件；WebSocket 模式不需要这一步。`GROUP_AT_MESSAGE_CREATE` 是 @ 事件。`GROUP_MSG_RECEIVE` 只是「群管理员开启通知」的**开关事件**，勾它不代表能收到群消息。
  3. 回调地址必须精确到 `https://<域名>/webhook/qqbot`；改动密钥、回调或事件订阅后，回开放平台**重新点一次「确定配置」**，让平台重新发起 OpCode 13 验证。验证不通过或回调被停用，平台会直接停止推送。
  4. **未上线（未过审）的机器人处于沙箱**：只会推送在「沙箱配置」里登记的沙箱群 / 白名单 QQ 号的事件；必须把机器人拉进那个沙箱群，用白名单成员发消息。普通群发什么都不会推。
  5. 正式环境还受 IP 白名单限制；确认机器人已进群、发送者不在黑名单。

  **代码侧（都已修复，部署后生效）**
  1. 群 ID 取官方字段 `group_openid`；三种事件 `C2C_MESSAGE_CREATE` / `GROUP_AT_MESSAGE_CREATE` / `GROUP_MESSAGE_CREATE` 都会分发。
  2. **所有固定指令 100% 回复**（在黑名单、回复概率、AI 链路之前处理）；`@` 事件也必定回复。只有全量群消息中的普通聊天才走回复概率，**默认 30%** 会被静默跳过（日志 `[QQBot] Skipped by reply probability`）。想每条都回，在群里发 `/群回复概率 100`，或在管理后台调整。
  3. `msg_id` 被动回复 5 分钟 / 最多 5 次有效。AI 链路有 25 秒总闸，超时也会给一条角色内回复；被动发送失败会自动降级为主动消息重试一次，失败原因写进日志，不再静默吞掉。
  4. 排查命令：`npx wrangler tail`（`wrangler.toml` 的日志采样已设为 1），依次看 `[QQBot] ====== WEBHOOK`、`Signature headers`、`Dispatch`、`Message`、`Group gate`、`Reply sent OK`。主模型故障会看 `[AI] NVIDIA NIM unavailable; switching to Workers AI`。

## 十一、开源发布与安全

从 GitHub 克隆 / fork 后，**下面三项必须改成你自己的**，否则会连到别人的 Cloudflare 资源：

| 位置 | 模板值 | 改成 |
|---|---|---|
| `wrangler.toml` → `database_id` | `CHANGE_ME_D1_DATABASE_ID` | 执行 `npx wrangler d1 create qq-bot-db` 后得到的 UUID |
| `wrangler.toml` → `[[routes]] pattern` | `bot.example.com` | 你的自定义域名；不用自定义域名就把整个 `[[routes]]` 删掉（`workers_dev = true` 已保留，可直接用免费 `workers.dev`） |
| `LICENSE` → Copyright | `SYSTEM-Intel-MIC` | 你的署名（MIT 要求保留原版权声明，二次分发请一并保留） |

**绝对不要提交**：

- `.dev.vars`：含 QQ AppSecret、`NVIDIA_API_KEY`、`TAVILY_API_KEY` 和后台**明文**密码 `ADMIN_PASSWORD`。`.gitignore` 已排除，仓库里只有 `.dev.vars.example` 模板。标准部署命令 `wrangler deploy --secrets-file .dev.vars` 会把其中每一行都写成 Worker Secret，所以这个文件**只放 5 个真密钥**，普通配置一律放 `wrangler.toml [vars]`。
- 任何真实 Key、后台密码截图、以及你自己账号的 D1 数据库 ID。

其他说明：

- 彩蛋图片 `public/hrx-dance.gif` 通过 Worker 自身的请求地址（`new URL(request.url).origin`）拼出公网 URL，代码里不写死任何域名，fork 后无需改源码。
- `wrangler.toml` 的 `[vars]` 是明文非敏感配置；**同名线上 Secret 会覆盖它**。从旧版本升级时先用 `npx wrangler secret list` 核对，把误存成 Secret 的普通配置用 `npx wrangler secret delete <KEY>` 清掉。
- 部署时若出现 `differs from the remote configuration` 确认框，判读方法见第四章「使用自定义域名」。
- `.github/workflows/ci.yml` 默认在 `main` 分支跑 `npm ci` + `npm run typecheck`，不需要任何密钥。

## License

MIT，详见 [LICENSE](./LICENSE)。Copyright (c) 2026 SYSTEM-Intel-MIC。
