#!/usr/bin/env node
// 一次性获取 Chrome Web Store API 的 refresh token（在本机跑，自动写进 GitHub Secrets）。
//
// 用法：直接跑，按提示粘贴凭据
//   cd ~/Desktop/fadada-autofill && node tools/cws-auth.mjs
// 凭据输入过一次后会自动备份到 ~/.cws-auth.json（仅本机、权限 600、不进 git），
// 以后再跑（本仓库或其他扩展仓库）都自动读取、免输入；该文件也是你的本地存档。
//
// 凭据从哪来（Google Cloud Console, console.cloud.google.com，用商店发布者账号登录）：
//   1. 建项目 → API 和服务 → 库 → 搜「Chrome Web Store API」→ 启用
//   2. OAuth 同意屏幕（新界面叫 Google Auth Platform/受众）：外部 → 创建；
//      创建完把发布状态改成「正式发布 In production」（不改的话 refresh token 7 天过期）
//   3. 凭据 → 创建凭据 → OAuth 客户端 ID → 应用类型「桌面应用」→ 创建
//
// 授权页若提示「未经验证的应用」：点「高级」→「前往 xxx（不安全）」→ 继续（自己的应用，正常现象）。

import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CFG_PATH = join(homedir(), '.cws-auth.json');

function loadCfg() {
  if (!existsSync(CFG_PATH)) return {};
  try { return JSON.parse(readFileSync(CFG, 'utf8')); } catch { return {}; }
}

let CLIENT_ID = process.env.CWS_CLIENT_ID || '';
let CLIENT_SECRET = process.env.CWS_CLIENT_SECRET || '';
const cfg = loadCfg();
if ((!CLIENT_ID || !CLIENT_SECRET) && (cfg.client_id || cfg.client_secret)) {
  if (!CLIENT_ID && cfg.client_id) CLIENT_ID = cfg.client_id;
  if (!CLIENT_SECRET && cfg.client_secret) CLIENT_SECRET = cfg.client_secret;
  console.log('凭据已从本地 ' + CFG_PATH + ' 读取，无需重新输入。');
}

if (!CLIENT_ID || !CLIENT_SECRET) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log('粘贴 Google Cloud 凭据页里那个「桌面应用」OAuth 客户端的两个值（输入一次即存本地，以后免输）：');
  CLIENT_ID = (await rl.question('  Client ID: ')).trim();
  CLIENT_SECRET = (await rl.question('  Client Secret: ')).trim();
  rl.close();
}
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('缺少 Client ID / Client Secret，退出。');
  process.exit(1);
}

const PORT = 8899;
const REDIRECT = `http://127.0.0.1:${PORT}`;
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/chromewebstore');
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

const server = http.createServer((req, res) => {
  const u = new URL(req.url, REDIRECT);
  const code = u.searchParams.get('code');
  const error = u.searchParams.get('error');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  if (code) {
    res.end('<h2>✅ 授权成功，回到终端继续</h2>');
    server.emit('code', code);
  } else {
    res.end('<h2>❌ 授权被拒绝或出错: ' + (error || '未知') + '</h2>');
    server.emit('code', null);
  }
});

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
console.log('\n正在打开浏览器授权页…（要用发布商店的那个 Google 账号）');
console.log('若没弹出，请手动访问：\n\n' + authUrl.href + '\n');
try { spawn('open', [authUrl.href], { stdio: 'ignore', detached: true }); } catch {}

console.log('等待授权中（Ctrl+C 退出）…');
const code = await new Promise((r) => server.once('code', r));
server.close();
if (!code) process.exit(1);

const resp = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT,
    grant_type: 'authorization_code'
  })
});
const j = await resp.json();
if (!j.refresh_token) {
  console.error('\n换取失败:', JSON.stringify(j, null, 2));
  console.error('若提示 redirect_uri_mismatch：去凭据 → 你的 OAuth 客户端 → 已获授权的重定向 URI，加上 ' + REDIRECT + ' 后重跑。');
  process.exit(1);
}

try {
  writeFileSync(CFG_PATH, JSON.stringify({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: j.refresh_token,
    saved_at: new Date().toISOString()
  }, null, 2));
  chmodSync(CFG_PATH, 0o600);
  console.log('\n💾 凭据已备份到 ' + CFG_PATH + '（仅本机，下次任何仓库运行免输入）');
} catch {}

console.log('自动写入 GitHub Secrets…\n');
const pairs = [
  ['CWS_CLIENT_ID', CLIENT_ID],
  ['CWS_CLIENT_SECRET', CLIENT_SECRET],
  ['CWS_REFRESH_TOKEN', j.refresh_token]
];
let allOk = true;
for (const [name, value] of pairs) {
  const r = spawnSync('gh', ['secret', 'set', name], { input: value, encoding: 'utf8' });
  if (r.status === 0) console.log('  ✔ ' + name);
  else {
    allOk = false;
    console.log('  ✘ ' + name + '（gh 写入失败，请在本仓库目录手动: gh secret set ' + name + '）');
  }
}
console.log(allOk
  ? '\nChrome 的 secrets 已齐。去 GitHub Actions 跑「发布到 Chrome 商店」即可。'
  : '\n有写入失败的项，在本仓库目录重跑本脚本或手动 gh secret set。');
