# repo-radar

用 GitHub REST API 给任意仓库做一次「体检」的命令行小工具。

一条命令拿到仓库的 star/fork/issue 数量、主语言、协议、最后推送时间、语言构成占比和最近 5 次提交。

```
  react/react
  The library for web and native user interfaces.
──────────────────────────────────────────────
  ★ star      252.1k
  ⑂ fork      51.6k
  ◉ 开放 issue 1.5k
  ⌥ 主语言     JavaScript
  ⚖ 协议      MIT
  ⏱ 最后推送   今天
  ⌂ 创建于     2013-05-24
──────────────────────────────────────────────
  语言构成
    JavaScript    49%  ██████████
    Rust          26%  █████
    TypeScript    23%  █████
    HTML           1%  █
──────────────────────────────────────────────
  最近提交
    76baa3b  今天        [DevTools] Find non-resource hoistable i
    5122860  今天        [DevTools] Normalize BigInt values in fa
──────────────────────────────────────────────
  查询耗时 1555ms  配额剩余 57/60
```

## 安装

需要 Node.js 18+（用到内置 `fetch`）。无需 `npm install`，零依赖，单个文件。

```bash
git clone https://github.com/17396743/github-api-lab.git
cd github-api-lab
node radar.mjs facebook/react
```

## 用法

```bash
# owner/repo 形式
node radar.mjs nodejs/node

# 直接贴 GitHub 链接
node radar.mjs https://github.com/torvalds/linux

# 输出 JSON，便于配合 jq 或写进脚本
node radar.mjs facebook/react --json

# 帮助
node radar.mjs --help
```

## 提高频率上限

GitHub 未认证请求限制为 **60 次/小时**，认证后为 **5000 次/小时**。这个工具默认发出 3 次请求（仓库信息、最近提交、语言构成），并行执行。

设置环境变量即可认证：

```bash
# Linux / macOS
export GITHUB_TOKEN=ghp_xxxxxxxx

# Windows PowerShell
$env:GITHUB_TOKEN = "ghp_xxxxxxxx"

# Windows CMD
set GITHUB_TOKEN=ghp_xxxxxxxx
```

token 不需要任何 scope —— 读取公开仓库信息用匿名权限就够，带上 token 只是为了提升额度。**请不要把 token 提交进仓库。**

## 实现说明

- 只用 GitHub REST API v3 的三个端点：
  - `GET /repos/{owner}/{repo}`
  - `GET /repos/{owner}/{repo}/commits`
  - `GET /repos/{owner}/{repo}/languages`
- 三个请求用 `Promise.all` 并行发出，总耗时约等于最慢的那个
- 每次请求后从响应头读取 `x-ratelimit-remaining`，在末尾显示剩余配额
- 错误处理区分 404（仓库不存在/无权限）和其他 API 错误，并把 GitHub 返回的 message 透出来
- 零第三方依赖，不写任何缓存，每次都是实时数据

## 已知限制

- 只读公开数据，不支持私有仓库（除非 token 有对应权限）
- 不递归查子模块，不统计 contributor 总数（那需要额外分页请求，会让耗时不可控）
- 输出宽度按 46 字符设计，窄终端会换行

## License

MIT
