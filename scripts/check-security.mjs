#!/usr/bin/env node
/**
 * 安全自检脚本：
 *   1. 扫描源码与前端构建产物中是否出现真实密钥形态
 *   2. 检查密码/令牌是否被写入日志
 *   3. 检查 .env.example 是否只包含占位符
 *   4. 确认前端产物不包含服务端环境变量
 * 用法：node scripts/check-security.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCAN_DIRS = ['workers/api/src', 'apps/web/src', 'scripts', 'apps/web/dist'];
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.mp4', '.sqlite', '.pdf']);

const findings = [];

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.wrangler') continue;
      walk(full);
    } else {
      const ext = path.extname(entry).toLowerCase();
      if (SKIP_EXT.has(ext) || stat.size > 4 * 1024 * 1024) continue;
      scanFile(full);
    }
  }
}

const PATTERNS = [
  { name: '疑似 DeepSeek/OpenAI 密钥', regex: /\bsk-[A-Za-z0-9_-]{24,}\b/g },
  { name: '疑似 AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: '私钥内容', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: '硬编码 DEEPSEEK_API_KEY', regex: /DEEPSEEK_API_KEY\s*[:=]\s*['"][^'"\s]{12,}['"]/g },
];

function scanFile(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    const match = pattern.regex.exec(text);
    if (match) {
      // 文档/示例中的占位符（sk-xxxx...）不算泄露
      if (/^sk-x{6,}$/i.test(match[0]) || match[0].includes('xxxxxxxx')) continue;
      findings.push({ file: path.relative(ROOT, file), type: pattern.name, sample: match[0].slice(0, 12) + '…' });
    }
  }
  if (/console\.(log|info|warn|error)\([^)]*\b(password|sessionToken|csrfToken|apiKey)\b/i.test(text)) {
    findings.push({ file: path.relative(ROOT, file), type: '可能记录敏感字段的日志', sample: 'console.*' });
  }
}

for (const dir of SCAN_DIRS) walk(path.join(ROOT, dir));

// .env.example 只允许占位符
const envExample = path.join(ROOT, '.env.example');
if (existsSync(envExample)) {
  const text = readFileSync(envExample, 'utf8');
  if (/\bsk-[A-Za-z0-9]{24,}\b/.test(text) && !/sk-x{8,}/i.test(text)) {
    findings.push({ file: '.env.example', type: '示例文件包含疑似真实密钥', sample: 'DEEPSEEK_API_KEY' });
  }
  if (/ADMIN_SETUP_TOKEN=[a-f0-9]{16,}/i.test(text)) {
    findings.push({ file: '.env.example', type: '示例文件包含疑似真实令牌', sample: 'ADMIN_SETUP_TOKEN' });
  }
}

// 前端产物不能包含服务端密钥
const distDir = path.join(ROOT, 'apps/web/dist');
let distChecked = 0;
if (existsSync(distDir)) {
  const files = [];
  (function collect(dir) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) collect(full);
      else if (full.endsWith('.js') || full.endsWith('.css') || full.endsWith('.html')) files.push(full);
    }
  })(distDir);
  for (const file of files) {
    distChecked += 1;
    const text = readFileSync(file, 'utf8');
    // 前端可能展示配置项名称（属于正常文案），这里只拦截真实密钥形态与 Bearer 令牌
    if (/Bearer\s+[A-Za-z0-9_-]{24,}/.test(text)) {
      findings.push({ file: path.relative(ROOT, file), type: '前端产物包含 Bearer 令牌', sample: 'Bearer …' });
    }
    if (/DEEPSEEK_API_KEY\s*[:=]\s*['"]sk-/.test(text)) {
      findings.push({ file: path.relative(ROOT, file), type: '前端产物包含 API Key 赋值', sample: 'DEEPSEEK_API_KEY=' });
    }
  }
}

console.log('\n安全自检');
console.log('─'.repeat(52));
console.log(`已扫描前端产物文件：${distChecked} 个`);
if (findings.length === 0) {
  console.log('✔ 未发现真实密钥、私钥或敏感日志写入');
  console.log('✔ 前端构建产物不包含服务端环境变量');
  console.log('');
  process.exit(0);
}
console.log(`✖ 发现 ${findings.length} 个问题：`);
for (const finding of findings) {
  console.log(`  - [${finding.type}] ${finding.file}（${finding.sample}）`);
}
console.log('');
process.exit(1);
