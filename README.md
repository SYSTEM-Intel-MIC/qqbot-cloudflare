# QQ Bot Cloudflare Worker

> 基于 Cloudflare Worker 的 QQ 机器人，接入 AI 对话能力，支持多模型切换和 YouTube 搜索功能。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [完整部署教程](#完整部署教程)
  - [前提条件](#前提条件)
  - [Step 1：注册 QQ 开放平台账号](#step-1注册-qq-开放平台账号)
  - [Step 2：创建 QQ 机器人应用](#step-2创建-qq-机器人应用)
  - [Step 3：获取 Cloudflare 账号](#step-3获取-cloudflare-账号)
  - [Step 4：安装 Node.js 和 Wrangler](#step-4安装-nodejs-和-wrangler)
  - [Step 5：克隆项目](#step-5克隆项目)
  - [Step 6：配置环境变量](#step-6配置环境变量)
  - [Step 7：配置 wrangler.toml](#step-7配置-wranglertoml)
  - [Step 8：创建 D1 数据库](#step-8创建-d1-数据库)
  - [Step 9：初始化数据库表](#step-9初始化数据库表)
  - [Step 10：部署 Worker](#step-10部署-worker)
  - [Step 11：配置 Webhook](#step-11配置-webhook)
  - [Step 12：测试机器人](#step-12测试机器人)
- [DIY 个性化教程](#diy-个性化教程)
  - [修改 AI 角色人设](#修改-ai-角色人设)
  - [添加/修改指令](#添加修改指令)
  - [添加新的 AI 模型](#添加新的-ai-模型)
  - [自定义 YouTube 功能](#自定义-youtube-功能)
  - [添加彩蛋功能](#添加彩蛋功能)
  - [修改回复样式](#修改回复样式)
- [指令列表](#指令列表)
- [可用模型](#可用模型)
- [技术架构](#技术架构)
- [目录结构](#目录结构)
- [API 文档](#api-文档)
- [数据库设计](#数据库设计)
- [故障排除](#故障排除)
- [License](#license)

---

## 功能特性

- 🤖 **AI 对话**：接入多种大语言模型，支持 OpenAI 兼容 API 和 Google Gemini
- 🔄 **多模型切换**：支持多个模型全局切换，所有人共用
- 💾 **聊天历史**：D1 数据库存储完整聊天记录，支持上下文连贯对话
- 📊 **用量统计**：自动统计 API 调用次数和 Token 消耗
- 📺 **YouTube 搜索**：内置 YouTube 搜索和视频详情查询功能
- 🔐 **签名校验**：Ed25519 签名验证，确保 Webhook 安全
- 🎭 **角色扮演**：默认以《崩坏：星穹铁道》角色「昔涟」身份对话
- 🎁 **彩蛋功能**：内置趣味彩蛋

---

## 快速开始

如果你已经熟悉 Cloudflare Workers 和 QQ 开放平台，可以按以下步骤快速部署：

```bash
# 1. 克隆项目
git clone https://github.com/SYSTEM-Intel-MIC/qqbot-cloudflare.git
cd qqbot-cloudflare

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 填写你的配置

# 4. 创建 D1 数据库
wrangler d1 create qq-bot-db
# 将返回的 database_id 填入 wrangler.toml

# 5. 初始化数据库
wrangler d1 execute qq-bot-db --file=./schema.sql --remote

# 6. 部署
CLOUDFLARE_API_TOKEN="你的Token" wrangler deploy
```

---

## 完整部署教程

### 前提条件

- Node.js 18+
- npm 或 yarn
- Cloudflare 账号（免费即可）
- QQ 开放平台账号

### Step 1：注册 QQ 开放平台账号

1. 访问 [QQ 开放平台](https://q.qq.com)
2. 点击右上角「注册」
3. 使用 QQ 登录或手机号注册

### Step 2：创建 QQ 机器人应用

1. 登录后进入「机器人」菜单
2. 点击「创建机器人」
3. 填写机器人基本信息：
   - 机器人名称：自定义（如：我的AI助手）
   - 机器人描述：简单描述功能
   - 机器人头像：上传头像
4. 创建成功后，记录以下信息：
   - **AppID**：应用唯一标识
   - **AppSecret**：应用密钥（点击「查看」获取）

> ⚠️ **重要**：AppSecret 只在创建时显示一次，请妥善保存！

### Step 3：获取 Cloudflare 账号

1. 访问 [Cloudflare](https://www.cloudflare.com)
2. 注册账号（免费即可）
3. 登录后，在右侧边栏找到「Workers」
4. 记录你的 **Account ID**（在「概述」页面右侧）

### Step 4：安装 Node.js 和 Wrangler

```bash
# 安装 Node.js（如果还没安装）
# 访问 https://nodejs.org 下载 LTS 版本

# 安装 Wrangler CLI
npm install -g wrangler

# 验证安装
wrangler --version

# 登录 Cloudflare
wrangler login
```

### Step 5：克隆项目

```bash
git clone https://github.com/SYSTEM-Intel-MIC/qqbot-cloudflare.git
cd qqbot-cloudflare

# 安装依赖
npm install
```

### Step 6：配置环境变量

复制环境变量模板：

```bash
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars` 文件，填写你的配置：

```bash
# QQ 机器人配置（必填）
QQ_BOT_APP_ID=你的AppID
QQ_BOT_SECRET=你的AppSecret
QQ_BOT_VERIFY_SIGNATURE=true

# AI 模型配置（必填一项）
# 方案A：使用 OpenAI 兼容 API（如 ChatAnywhere、NVIDIA NIM 等）
AI_BASE_URL=https://api.chatanywhere.tech
AI_API_KEY=你的APIKey
AI_MODEL=gpt-5-mini

# 方案B：使用 Google Gemini（需要单独配置 GEMINI_API_KEY）
# GEMINI_API_KEY=你的GeminiKey

# Token 限制
AI_MAX_TOKENS=8192
AI_MAX_INPUT_TOKENS=8192

# 默认模型 ID（对应 models.ts 中的 id）
CURRENT_MODEL_ID=1

# 可选：YouTube API Key（用于油管功能）
YOUTUBE_API_KEY=你的YouTube_Key
```

#### 环境变量说明

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `QQ_BOT_APP_ID` | ✅ | QQ 开放平台的 AppID |
| `QQ_BOT_SECRET` | ✅ | QQ 开放平台的 AppSecret |
| `QQ_BOT_VERIFY_SIGNATURE` | ❌ | 是否启用签名验证（默认 true） |
| `AI_BASE_URL` | ⚡ | OpenAI 兼容 API 的基础 URL |
| `AI_API_KEY` | ⚡ | OpenAI 兼容 API 的 Key |
| `AI_MODEL` | ❌ | 默认模型名（可被 /切换模型 覆盖） |
| `AI_MAX_TOKENS` | ❌ | 最大输出 Token 数（默认 8192） |
| `AI_MAX_INPUT_TOKENS` | ❌ | 最大输入 Token 数（默认 8192） |
| `GEMINI_API_KEY` | ⚡ | Google Gemini API Key |
| `YOUTUBE_API_KEY` | ❌ | YouTube Data API v3 Key |
| `CURRENT_MODEL_ID` | ❌ | 默认模型 ID（默认 1） |

> ⚡ 表示使用 OpenAI 兼容 API 或 Gemini 至少配置一项

### Step 7：配置 wrangler.toml

编辑 `wrangler.toml` 文件：

```toml
account_id = "你的Cloudflare_Account_ID"
name = "qqbot-cloudflare"
main = "src/index.ts"
compatibility_date = "2025-01-01"

# 静态资源托管
assets = { directory = "./public" }

# 自定义域名（可选，如果有的话）
# [[routes]]
# pattern = "你的域名"
# zone_name = "你的域名"
# custom_domain = true

# D1 数据库配置
[[d1_databases]]
binding = "DB"
database_name = "qq-bot-db"
database_id = "你的D1_Database_ID"

# 可观测性
[observability]
enabled = true
head_sampling_rate = 0.1

# 公开的环境变量（非敏感信息）
[vars]
QQ_BOT_VERIFY_SIGNATURE = "true"
AI_BASE_URL = "https://integrate.api.nvidia.com/v1"
AI_MAX_TOKENS = "12800"
AI_MAX_INPUT_TOKENS = "12800"
```

### Step 8：创建 D1 数据库

```bash
# 创建 D1 数据库
wrangler d1 create qq-bot-db
```

执行后会输出类似：

```
✅ Successfully created DB 'qq-bot-db'
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

将 `database_id` 复制到 `wrangler.toml` 中。

### Step 9：初始化数据库表

```bash
# 远程执行 SQL 初始化
wrangler d1 execute qq-bot-db --file=./schema.sql --remote
```

如果提示数据库不存在，确保 Step 8 已正确执行。

### Step 10：部署 Worker

```bash
# 方式一：使用 API Token（推荐 CI/CD 使用）
CLOUDFLARE_API_TOKEN="你的API_Token" wrangler deploy

# 方式二：使用交互式登录（本地开发推荐）
wrangler login
wrangler deploy
```

部署成功后会显示 Worker 地址，如：
```
https://qqbot-cloudflare.your-subdomain.workers.dev
```

### Step 11：配置 Webhook

1. 登录 [QQ 开放平台](https://q.qq.com)
2. 进入你的机器人应用
3. 在「开发设置」中找到「消息推送」
4. 选择「使用长连接或 HTTP 推送」
5. 配置 Webhook 地址：

```
https://qqbot-cloudflare.your-subdomain.workers.dev/webhook/qqbot
```

如果配置了自定义域名：

```
https://你的域名/webhook/qqbot
```

6. 点击「保存」

### Step 12：测试机器人

1. 在 QQ 中搜索你的机器人名称
2. 发送消息测试：
   - 发送 `/在吗` - 应该回复「在」
   - 发送 `/帮助` - 应该显示帮助信息
   - 发送任意文字 - 应该触发 AI 对话

---

## DIY 个性化教程

### 修改 AI 角色人设

编辑 `src/adapters/qqbot-cf.ts` 中的 `buildSystemPrompt()` 方法：

```typescript
private buildSystemPrompt(): string {
  return '' +
    '你将扮演【你的角色名】，与用户对话。\n\n' +
    '## 角色背景\n' +
    '- 你的角色背景描述...\n\n' +
    '## 性格与语言风格\n' +
    '- 你的性格特点...\n\n' +
    '## 对话规则\n' +
    '1. 你必须始终保持角色...\n' +
    '2. 回复格式要求...\n\n' +
    '## 示例\n' +
    '用户：你好\n' +
    '你的角色：（示例回复）';
}
```

**关键字段说明**：

| 字段 | 说明 |
|------|------|
| 角色背景 | 定义角色的来历、身份等 |
| 性格与语言风格 | 定义说话方式、语气等 |
| 对话规则 | 约束 AI 行为的规则 |
| `__SUMMARY__` | 必须保留，用于记忆摘要 |

### 添加/修改指令

编辑 `src/adapters/qqbot-cf.ts` 中的 `handleFixedCommand()` 方法：

```typescript
private async handleFixedCommand(content: string, userId: string, groupId: string | null, data: any): Promise<boolean> {
  const cmd = content.trim();

  // 添加新指令示例
  if (cmd === '/你的指令') {
    await this.sendReply(userId, groupId, data?.id, '你的回复内容');
    return true;  // 返回 true 表示已处理，不再调用 AI
  }

  // ... 其他指令
  return false;  // 返回 false 表示未处理，继续调用 AI
}
```

**指令处理流程**：

1. 用户发送消息
2. `handleFixedCommand()` 检查是否匹配固定指令
3. 如果匹配（返回 true），直接回复，不调用 AI
4. 如果不匹配（返回 false），调用 AI 生成回复

### 添加新的 AI 模型

编辑 `src/models.ts`：

```typescript
export const MODEL_LIST: ModelInfo[] = [
  // 已有模型...
  { 
    id: '5',                                    // 唯一 ID（从 1 开始递增）
    name: '模型显示名称',                        // 显示在 /模型列表 中
    provider: 'openai',                         // 'openai' 或 'gemini'
    model: 'api请求的模型名'                     // 实际发送给 API 的模型名
  },
];
```

**Provider 说明**：

- `openai`：使用 OpenAI 兼容 API（需要配置 `AI_BASE_URL` 和 `AI_API_KEY`）
- `gemini`：使用 Google Gemini 原生 API（需要配置 `GEMINI_API_KEY`）

**支持的 OpenAI 兼容平台**：

| 平台 | Base URL | 说明 |
|------|----------|------|
| ChatAnywhere | `https://api.chatanywhere.tech` | GPT 系列 |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | Nemotron 系列 |
| DeepSeek | `https://api.deepseek.com` | DeepSeek 系列 |
| Moonshot | `https://api.moonshot.cn` | Kimi 系列 |
| OpenRouter | `https://openrouter.ai/api` | 多模型聚合 |

### 自定义 YouTube 功能

YouTube 功能是可选的，需要：

1. 在 [Google Cloud Console](https://console.cloud.google.com) 启用 YouTube Data API v3
2. 创建 API Key
3. 在 `.dev.vars` 中配置 `YOUTUBE_API_KEY`

如果不需要 YouTube 功能，可以不配置，机器人会正常运行。

### 添加彩蛋功能

编辑 `src/adapters/qqbot-cf.ts` 中的 `handleFixedCommand()` 方法：

```typescript
// 在 handleFixedCommand 方法中添加
if (cmd === '你的彩蛋触发词') {
  // 文本彩蛋
  await this.sendReply(userId, groupId, data?.id, '彩蛋回复内容');
  
  // 图片彩蛋（需要先将图片放到 public/ 目录）
  // await this.sendImage(userId, groupId, data?.id, 'https://你的域名/图片路径.gif');
  
  return true;
}
```

**图片彩蛋配置**：

1. 将图片放到 `public/` 目录
2. 部署后图片可通过 `https://你的域名/图片名` 访问
3. 使用 `sendImage()` 方法发送

### 修改回复样式

**修改帮助信息**：

编辑 `handleFixedCommand()` 中 `/帮助` 指令的回复内容。

**修改错误提示**：

编辑 `formatError()` 方法中的错误格式化逻辑。

**修改用量统计格式**：

编辑 `/用量查询` 指令的回复格式。

---

## 指令列表

| 指令 | 说明 | 示例 |
|------|------|------|
| `/在吗` | 显示在线状态 | `/在吗` |
| `/帮助` | 显示帮助信息 | `/帮助` |
| `/运行状态` | 显示运行状态说明 | `/运行状态` |
| `/作者信息` | 显示作者信息 | `/作者信息` |
| `/模型列表` | 显示可用模型列表 | `/模型列表` |
| `/模型信息` | 显示当前使用模型 | `/模型信息` |
| `/切换模型 编号` | 切换 AI 模型（全局） | `/切换模型 2` |
| `/用量查询` | 显示 API 用量统计 | `/用量查询` |
| `/油管功能` | 显示 YouTube 功能说明 | `/油管功能` |
| `/油管查询 关键词` | 搜索 YouTube 视频 | `/油管查询 崩坏星穹铁道` |
| `/油管信息 视频ID` | 获取视频详细信息 | `/油管信息 dQw4w9WgXcQ` |
| `/彩蛋功能` | 显示彩蛋功能说明 | `/彩蛋功能` |

---

## 可用模型

| 编号 | 模型名称 | Provider | 说明 |
|------|---------|----------|------|
| 1 | Nemotron 3 Super 120B | OpenAI 兼容 | NVIDIA NIM 平台 |
| 2 | Nemotron 3 Ultra 550B | OpenAI 兼容 | NVIDIA NIM 平台 |
| 3 | Gemini 2.0 Flash | Google Gemini | Google 官方 |
| 4 | Gemma 4 26B | Google Gemini | Google 官方 |

---

## 技术架构

```
用户消息 → QQ服务器 → Webhook POST → Cloudflare Worker
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                               ▼
                    OpCode 13: 回调验证            OpCode 0: 事件推送
                    (Ed25519 签名)                     │
                                                      ▼
                                          ┌───────────────────────┐
                                          │   QQBotAdapterCF      │
                                          │   (核心适配器)         │
                                          └───────────┬───────────┘
                                                      │
                                     ┌────────────────┼────────────────┐
                                     ▼                ▼                ▼
                               固定指令处理       AI 对话处理       YouTube 搜索
                               (14个指令)            │
                                                    ▼
                                        ┌──────────────────────┐
                                        │ 全局模型选择 (D1)     │
                                        │ 聊天历史加载 (D1)      │
                                        │ 上下文 Token 裁剪     │
                                        └──────────┬───────────┘
                                                   │
                                    ┌──────────────┴──────────────┐
                                    ▼                              ▼
                           Provider: OpenAI               Provider: Gemini
                           (NVIDIA NIM / 兼容API)         (Google 原生API)
                                    │                              │
                                    └──────────────┬───────────────┘
                                                   ▼
                                    ┌──────────────────────────┐
                                    │ QQBotAPIClient            │
                                    │ → 发送回复给用户           │
                                    └──────────────┬───────────┘
                                                   │
                                    ┌──────────────┴───────────┐
                                    ▼                          ▼
                            D1: 保存聊天记录          D1: 记录 API 用量
```

---

## 目录结构

```
qqbot-cloudflare/
├── src/
│   ├── index.ts              # Worker 入口，路由分发
│   ├── types.ts              # 全局类型定义
│   ├── models.ts             # AI 模型列表定义
│   ├── adapters/
│   │   └── qqbot-cf.ts       # QQ Bot 核心适配器
│   ├── api/
│   │   └── qqbot-api.ts      # QQ Open API HTTP 客户端
│   ├── db/
│   │   └── index.ts          # D1 数据库操作层
│   ├── providers/
│   │   └── index.ts          # AI 模型 Provider（OpenAI/Gemini）
│   └── utils/
│       └── ed25519.ts        # Ed25519 签名验证工具
├── public/
│   └── hrx-dance.gif         # 彩蛋图片资源
├── schema.sql                # D1 数据库表结构
├── wrangler.toml             # Wrangler 部署配置
├── package.json              # NPM 依赖配置
├── .dev.vars.example         # 环境变量示例
└── README.md                 # 项目文档
```

---

## API 文档

### HTTP 接口

| 方法 | 路径 | 功能 | 说明 |
|------|------|------|------|
| GET | `/` | 健康检查 | 返回服务状态 |
| GET | `/health` | 健康检查 | 同上 |
| POST | `/webhook/qqbot` | QQ Bot Webhook | 核心接口 |
| GET | `/youtube/search?q=&maxResults=` | YouTube 搜索 | 需配置 API Key |
| GET | `/youtube/details?id=` | YouTube 视频详情 | 需配置 API Key |

### Webhook 协议

QQ 开放平台 Webhook 使用 WebSocket 或 HTTP 推送，本项目使用 HTTP 推送模式。

**OpCode 13 - 回调验证**：

```json
// 请求
{
  "op": 13,
  "d": {
    "plain_token": "xxx",
    "event_ts": "1234567890"
  }
}

// 响应
{
  "plain_token": "xxx",
  "signature": "hex签名"
}
```

**OpCode 0 - 事件推送**：

```json
{
  "op": 0,
  "t": "C2C_MESSAGE_CREATE",
  "d": {
    "author": { "id": "user_id" },
    "content": "用户消息",
    "id": "message_id"
  }
}
```

---

## 数据库设计

### 表结构

**api_usage（API 用量统计）**：

| 列名 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| user_id | TEXT NOT NULL | 用户 ID |
| date | TEXT NOT NULL | 日期 (YYYY-MM-DD) |
| api_calls | INTEGER | 调用次数 |
| total_tokens | INTEGER | Token 消耗 |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |
| UNIQUE | (user_id, date) | 联合唯一约束 |

**user_context（用户上下文）**：

| 列名 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| user_id | TEXT UNIQUE | 用户 ID |
| chat_history | TEXT | 聊天历史 (JSON) |
| last_message_at | INTEGER | 最后消息时间 |
| created_at | INTEGER | 创建时间 |

**global_settings（全局设置）**：

| 列名 | 类型 | 说明 |
|------|------|------|
| setting_key | TEXT PK | 设置键 |
| value | TEXT | 设置值 |
| updated_at | INTEGER | 更新时间 |

> ⚠️ **注意**：`global_settings` 表需要手动创建：

```sql
CREATE TABLE IF NOT EXISTS global_settings (
    setting_key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
);
```

---

## 故障排除

### 常见问题

#### 1. 部署后机器人不响应

**检查清单**：
- [ ] Webhook 地址是否正确（必须是 `https://`）
- [ ] Worker 是否部署成功（访问 `/health` 检查）
- [ ] QQ 开放平台是否配置了正确的 Webhook 地址
- [ ] 是否启用了签名验证（如果启用了，确保 Secret 正确）

**调试方法**：

```bash
# 检查 Worker 状态
curl https://你的域名/health

# 检查环境变量配置
curl https://你的域名/debug/env

# 检查数据库连接
curl https://你的域名/debug/db
```

#### 2. AI 回复失败

**可能原因**：
- `AI_API_KEY` 未配置或配置错误
- `AI_BASE_URL` 不正确
- API 额度用完
- 模型不存在或不可用

**解决方法**：
1. 检查 `.dev.vars` 中的 API 配置
2. 使用 `/模型列表` 查看可用模型
3. 使用 `/切换模型` 切换到其他模型

#### 3. 签名验证失败

**错误信息**：`Invalid signature`

**解决方法**：
1. 确保 `QQ_BOT_SECRET` 配置正确
2. 检查 Secret 是否有首尾空格
3. 临时关闭签名验证：`QQ_BOT_VERIFY_SIGNATURE=false`

#### 4. 数据库错误

**错误信息**：`D1_ERROR` 或表不存在

**解决方法**：

```bash
# 重新初始化数据库
wrangler d1 execute qq-bot-db --file=./schema.sql --remote

# 创建 global_settings 表
wrangler d1 execute qq-bot-db --command "CREATE TABLE IF NOT EXISTS global_settings (setting_key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER DEFAULT (unixepoch()));" --remote
```

#### 5. Token 超限

**错误信息**：`AI 请求失败：context_length_exceeded`

**解决方法**：
- 减小 `AI_MAX_INPUT_TOKENS` 的值
- 或使用支持更长上下文的模型

### 调试技巧

1. **查看日志**：在 Cloudflare Dashboard 的 Workers 页面查看实时日志
2. **使用调试接口**：
   - `/debug/env` - 检查环境变量配置状态
   - `/debug/db` - 检查数据库连接
3. **本地开发**：

```bash
wrangler dev
```

这会在本地启动一个开发服务器，方便调试。

---

## License

MIT License

```
MIT License

Copyright (c) 2024 SYSTEM-Intel-MIC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
