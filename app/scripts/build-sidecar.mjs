#!/usr/bin/env node
// 跨平台版 build-sidecar：把 Node 后端打包成 Tauri sidecar 负载。
//   - src-tauri/binaries/taskdeck-node-<triple>[.exe]   原生 node 运行时（externalBin）
//   - src-tauri/sidecar-server/                          编译后的 server + 生产依赖（→ 随包 resources/server）
//
// 与 scripts/build-sidecar.sh 逻辑等价，但同时支持 macOS(本地打 dmg) 与 Windows(CI 打 nsis)。
// 自动按当前平台/架构推导 target triple、node 官方发行版、二进制后缀。
//
// 用法：node scripts/build-sidecar.mjs
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync, copyFileSync, chmodSync, lstatSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..'); // → app/
const SRV = join(APP_DIR, 'server');
const OUT = join(APP_DIR, 'src-tauri', 'sidecar-server');
const BIN = join(APP_DIR, 'src-tauri', 'binaries');

// ── 平台 → triple / node 发行版映射 ───────────────────────────────────────
const NODE_VER = process.version; // 形如 v24.14.0；锁定为本机版本以匹配 better-sqlite3 原生模块 ABI
const PLATFORM = process.platform;
const ARCH = process.arch;

function resolveTarget() {
  if (PLATFORM === 'darwin' && ARCH === 'arm64')
    return { triple: 'aarch64-apple-darwin', dist: `node-${NODE_VER}-darwin-arm64`, ext: 'tar.xz', binInDist: 'bin/node', exe: '' };
  if (PLATFORM === 'darwin' && ARCH === 'x64')
    return { triple: 'x86_64-apple-darwin', dist: `node-${NODE_VER}-darwin-x64`, ext: 'tar.xz', binInDist: 'bin/node', exe: '' };
  if (PLATFORM === 'win32' && ARCH === 'x64')
    return { triple: 'x86_64-pc-windows-msvc', dist: `node-${NODE_VER}-win-x64`, ext: 'zip', binInDist: 'node.exe', exe: '.exe' };
  if (PLATFORM === 'win32' && ARCH === 'arm64')
    return { triple: 'aarch64-pc-windows-msvc', dist: `node-${NODE_VER}-win-arm64`, ext: 'zip', binInDist: 'node.exe', exe: '.exe' };
  throw new Error(`暂不支持的平台/架构：${PLATFORM}/${ARCH}`);
}
const T = resolveTarget();

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', shell: true, ...opts });

// ── [1/4] 编译后端 (tsc) ──────────────────────────────────────────────────
console.log('[1/4] 编译后端 (tsc)');
run('npm run build', { cwd: SRV });

// ── [2/4] 暂存 dist + package.json ───────────────────────────────────────
console.log('[2/4] 暂存 dist + package.json');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(SRV, 'dist'), OUT, { recursive: true });
copyFileSync(join(SRV, 'package.json'), join(OUT, 'package.json'));

// ── [3/4] 安装生产依赖（含 better-sqlite3 原生模块，按当前平台 ABI 编译）──
console.log('[3/4] 安装生产依赖（含 better-sqlite3 原生模块）');
run('npm install --omit=dev --no-package-lock --no-audit --no-fund --silent', { cwd: OUT });

// 发布版只走 DeepSeek（纯 fetch，零 @anthropic-ai 依赖），剔除 Claude Agent SDK
// 及其平台原生二进制（~219MB）。仅 server/src/ai/sdkProvider.ts 动态 import 它，
// 发布版强制 DeepSeek 不会触达，万一触达也被 routes/tasks.ts 的 try/catch 降级。
const anthropicDir = join(OUT, 'node_modules', '@anthropic-ai');
if (existsSync(anthropicDir)) {
  console.log('      → 剔除 @anthropic-ai（发布版瘦身，仅保留 DeepSeek 路径）');
  rmSync(anthropicDir, { recursive: true, force: true });
  // 删包后 .bin 可能留下指向它的悬空软链（macOS）。Tauri 打包资源解析断链会失败，
  // 故清理 node_modules 内所有断链软链（有效软链 statSync 能解析，不会误删）。
  pruneBrokenSymlinks(join(OUT, 'node_modules'));
}

function pruneBrokenSymlinks(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) {
      try { statSync(p); } catch { try { unlinkSync(p); } catch {} } // 解析失败 = 断链 → 删
    } else if (e.isDirectory()) {
      pruneBrokenSymlinks(p);
    }
  }
}

// ── [4/4] 取官方标准 node 运行时为 sidecar 二进制 ─────────────────────────
// 用官方发行版 node（~50MB）替代直接拷贝本机 node。版本锁定为本机 node 版本：
// 上一步 better-sqlite3 按本机 node ABI 编译，运行时 node 必须同 ABI（同 major）。
console.log('[4/4] 取官方标准 node 运行时为 sidecar 二进制');
const CACHE_DIR = join(homedir(), '.cache', 'taskdeck-node');
const distDir = join(CACHE_DIR, T.dist);
const nodeBin = join(distDir, T.binInDist);
if (!existsSync(nodeBin)) {
  console.log(`      → 下载官方 node ${NODE_VER}（首次，之后走缓存 ${CACHE_DIR}）`);
  mkdirSync(CACHE_DIR, { recursive: true });
  const url = `https://nodejs.org/dist/${NODE_VER}/${T.dist}.${T.ext}`;
  const archive = join(CACHE_DIR, `${T.dist}.${T.ext}`);
  await download(url, archive);
  // tar 在 macOS 处理 .tar.xz、在 Windows(bsdtar) 处理 .zip，两端均自带。
  run(`tar -xf "${archive}" -C "${CACHE_DIR}"`);
  rmSync(archive, { force: true });
}
mkdirSync(BIN, { recursive: true });
const dest = join(BIN, `taskdeck-node-${T.triple}${T.exe}`);
copyFileSync(nodeBin, dest);
if (PLATFORM !== 'win32') chmodSync(dest, 0o755);
console.log(`      → sidecar 二进制就绪：${dest}（官方 ${NODE_VER}）`);

async function download(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status}：${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { writeFileSync } = await import('node:fs');
  writeFileSync(outPath, buf);
}

console.log(`✓ 完成：${OUT} 与 ${dest} 就绪`);
