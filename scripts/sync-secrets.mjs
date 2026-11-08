#!/usr/bin/env node
/**
 * 把 .dev.vars 中的密钥显式同步到线上 Worker Secrets。
 *
 * Wrangler 设计上不会让 deploy 读取 .dev.vars，所以这里只做一件事：
 * 按白名单挑出密钥键，通过 stdin 交给 `wrangler secret bulk`。
 * 不打印任何密钥值，不把非敏感配置（[vars] 里的项）写成 Secret。
 *
 * 用法：
 *   node scripts/sync-secrets.mjs --dry-run   只检查，不上传
 *   node scripts/sync-secrets.mjs             同步并上传
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const devVarsPath = resolve(root, '.dev.vars');
const wranglerBin = resolve(root, 'node_modules/wrangler/bin/wrangler.js');

// 只允许这些键进入云端 Secrets；其余项由 wrangler.toml 的 [vars] 管理。
const SECRET_KEYS = [
  'QQ_BOT_APP_ID',
  'QQ_BOT_SECRET',
  'NVIDIA_API_KEY',
  'ADMIN_PASSWORD',
  'TAVILY_API_KEY',
];
// 缺少这些键会导致回调验证或核心功能失效，直接拦截而不是等线上报错。
const REQUIRED_KEYS = ['QQ_BOT_APP_ID', 'QQ_BOT_SECRET', 'NVIDIA_API_KEY'];
// 这些是普通配置，只应在 wrangler.toml [vars] 中维护；出现在 .dev.vars 会被
// --secrets-file 误写成 Secret，而且同名 Secret 会覆盖 [vars]，把本地值带到生产。
const NON_SECRET_KEYS = ['QQ_BOT_VERIFY_SIGNATURE', 'NVIDIA_BASE_URL', 'NVIDIA_MODEL', 'AI_MAX_INPUT_TOKENS'];

function parseDotEnv(text) {
  const result = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result.set(key, value);
  }
  return result;
}

let source;
try {
  source = readFileSync(devVarsPath, 'utf8');
} catch {
  console.error('[sync-secrets] 找不到 .dev.vars。请从 .dev.vars.example 复制并填写。');
  process.exit(1);
}

const vars = parseDotEnv(source);
const misplaced = NON_SECRET_KEYS.filter((key) => vars.has(key));
if (misplaced.length) {
  console.error('[sync-secrets] .dev.vars 里不应出现非敏感配置（请移到 wrangler.toml [vars]）：' + misplaced.join(', '));
  process.exit(1);
}
const missing = REQUIRED_KEYS.filter((key) => !vars.get(key));
if (missing.length) {
  console.error('[sync-secrets] .dev.vars 缺少必需项或值为空：' + missing.join(', '));
  process.exit(1);
}

const picked = SECRET_KEYS.filter((key) => vars.has(key));
const skipped = SECRET_KEYS.filter((key) => !vars.has(key));
const payload = picked.map((key) => `${key}=${vars.get(key)}`).join('\n') + '\n';

if (process.argv.includes('--dry-run')) {
  console.log('[sync-secrets] 将同步的 Secret：' + picked.join(', '));
  if (skipped.length) console.log('[sync-secrets] 本地未提供、跳过：' + skipped.join(', '));
  console.log('[sync-secrets] dry-run，未上传。');
  process.exit(0);
}

console.log(`[sync-secrets] 同步 ${picked.length} 个 Secret 到 Worker qq-bot-cloudflare ...`);
const result = spawnSync(process.execPath, [wranglerBin, 'secret', 'bulk'], {
  cwd: root,
  input: payload,
  stdio: ['pipe', 'inherit', 'inherit'],
});

if (result.error) {
  console.error('[sync-secrets] 启动 Wrangler 失败：' + result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error('[sync-secrets] Wrangler 退出码 ' + result.status + '，未继续部署。');
  process.exit(result.status || 1);
}
console.log('[sync-secrets] 完成：' + picked.join(', '));
