#!/usr/bin/env node
/**
 * repo-radar — 用 GitHub REST API 给任意仓库做一次「体检」
 *
 * 用法：
 *   node radar.mjs facebook/react
 *   node radar.mjs https://github.com/facebook/react
 *   node radar.mjs facebook/react --json
 *
 * 可选：设置 GITHUB_TOKEN 环境变量可提高频率上限（未认证 60 次/小时，认证 5000 次/小时）
 */

const API = 'https://api.github.com';

function parseTarget(input) {
  if (!input) return null;
  let s = input.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  s = s.replace(/\/+$/, '');
  const parts = s.split('/');
  if (parts.length < 2) return null;
  return { owner: parts[0], repo: parts[1] };
}

async function api(path) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'repo-radar',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(API + path, { headers });
  const body = await res.text();
  let json;
  try { json = JSON.parse(body); } catch { json = null; }

  if (!res.ok) {
    const msg = json?.message || body.slice(0, 120);
    const err = new Error(res.status === 404 ? `仓库不存在或无权访问：${path}` : `API 错误 ${res.status}：${msg}`);
    err.status = res.status;
    err.remaining = res.headers.get('x-ratelimit-remaining');
    throw err;
  }
  return { json, headers: res.headers };
}

const fmt = (n) => {
  if (n == null) return '-';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
};

const daysAgo = (iso) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return '今天';
  if (d === 1) return '昨天';
  if (d < 30) return `${d} 天前`;
  if (d < 365) return `${Math.floor(d / 30)} 个月前`;
  return `${(d / 365).toFixed(1)} 年前`;
};

async function radar(owner, repo, asJson) {
  const started = Date.now();

  // 三次请求并行：主信息、最近提交、语言构成
  const [info, commits, langs] = await Promise.all([
    api(`/repos/${owner}/${repo}`),
    api(`/repos/${owner}/${repo}/commits?per_page=5`),
    api(`/repos/${owner}/${repo}/languages`),
  ]);

  const r = info.json;
  const recent = commits.json;
  const languages = langs.json;

  const totalLang = Object.values(languages).reduce((a, b) => a + b, 0) || 1;
  const langList = Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, bytes]) => ({ name, percent: Math.round((bytes / totalLang) * 100) }));

  const result = {
    fullName: r.full_name,
    description: r.description,
    url: r.html_url,
    stars: r.stargazers_count,
    forks: r.forks_count,
    openIssues: r.open_issues_count,
    watchers: r.subscribers_count,
    language: r.language,
    licenses: r.license?.spdx_id ?? null,
    archived: r.archived,
    createdAt: r.created_at,
    pushedAt: r.pushed_at,
    defaultBranch: r.default_branch,
    topics: r.topics ?? [],
    languages: langList,
    recentCommits: recent.slice(0, 5).map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0],
      author: c.author?.login ?? c.commit.author.name,
      date: c.commit.author.date,
    })),
    rateLimit: {
      remaining: Number(info.headers.get('x-ratelimit-remaining')),
      limit: Number(info.headers.get('x-ratelimit-limit')),
    },
    elapsedMs: Date.now() - started,
  };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const line = '─'.repeat(46);
  console.log('');
  console.log(`  ${r.full_name}${r.archived ? '  [已归档]' : ''}`);
  if (r.description) console.log(`  ${r.description}`);
  console.log(line);
  console.log(`  ★ star      ${fmt(r.stargazers_count)}`);
  console.log(`  ⑂ fork      ${fmt(r.forks_count)}`);
  console.log(`  ◉ 开放 issue ${fmt(r.open_issues_count)}`);
  console.log(`  ⌥ 主语言     ${r.language ?? '未知'}`);
  console.log(`  ⚖ 协议      ${r.license?.spdx_id ?? '无'}`);
  console.log(`  ⏱ 最后推送   ${daysAgo(r.pushed_at)}`);
  console.log(`  ⌂ 创建于     ${r.created_at.slice(0, 10)}`);
  console.log(line);

  if (langList.length) {
    console.log('  语言构成');
    for (const l of langList) {
      const bar = '█'.repeat(Math.max(1, Math.round(l.percent / 5)));
      console.log(`    ${l.name.padEnd(12)} ${String(l.percent).padStart(3)}%  ${bar}`);
    }
    console.log(line);
  }

  console.log('  最近提交');
  for (const c of result.recentCommits) {
    console.log(`    ${c.sha}  ${daysAgo(c.date).padEnd(8)}  ${c.message.slice(0, 40)}`);
  }
  console.log(line);
  console.log(`  查询耗时 ${result.elapsedMs}ms  配额剩余 ${result.rateLimit.remaining}/${result.rateLimit.limit}`);
  console.log('');
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const target = args.find((a) => !a.startsWith('-'));

if (!target || args.includes('-h') || args.includes('--help')) {
  console.log(`
repo-radar — 用 GitHub REST API 给仓库做一次体检

用法:
  node radar.mjs <owner>/<repo>        人读格式
  node radar.mjs <仓库URL>              也支持直接贴链接
  node radar.mjs <owner>/<repo> --json  输出 JSON，方便管道处理

示例:
  node radar.mjs facebook/react
  node radar.mjs https://github.com/nodejs/node

环境变量:
  GITHUB_TOKEN   可选，认证后频率上限从 60 次/小时提升到 5000 次/小时
`);
  process.exit(target ? 0 : 1);
}

const parsed = parseTarget(target);
if (!parsed) {
  console.error(`无法解析目标：${target}（应形如 owner/repo 或 https://github.com/owner/repo）`);
  process.exit(1);
}

radar(parsed.owner, parsed.repo, asJson).catch((e) => {
  console.error(`\n  出错了：${e.message}`);
  if (e.remaining != null) console.error(`  剩余配额：${e.remaining}`);
  console.error('');
  process.exit(1);
});
