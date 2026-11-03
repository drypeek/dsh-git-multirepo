import { execFile } from 'node:child_process'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

/** 工作区状态路由，注册在 Connection 的 exact fetch registry。 */
const ROUTE_STATE = '/api/git-multirepo/state'
/** 单个提交详情路由。 */
const ROUTE_COMMIT = '/api/git-multirepo/commit'
/** 远程拉取路由。 */
const ROUTE_FETCH = '/api/git-multirepo/fetch'
/** 单个文件的差异路由。 */
const ROUTE_PATCH = '/api/git-multirepo/patch'
/**
 * git 输出字段分隔符，由格式串里的 %x00 产生。
 * NUL 不会出现在提交对象、引用名或路径中，因此提交内容无法用它伪造字段或记录。
 */
const FIELD_SEP = '\u0000'
/** 单条 git 命令的最大输出缓冲。 */
const MAX_BUFFER = 16 * 1024 * 1024
/** 单次扫描最多发现的仓库数，避免超大工作区拖垮请求。 */
const MAX_REPOS = 100
/** 扫描工作区时跳过的目录名。 */
const SKIP_DIRS = new Set([
  'node_modules',
  'bin',
  'obj',
  'dist',
  'target',
  'packages',
  '.vs',
  '.svn',
  '.idea',
])
/**
 * 读取类 git 命令的安全覆盖项：压住仓库本地 config 中可能执行外部程序的键。
 * 这是本插件面对"工作区内存在不受信任仓库"的主要防线之一。
 */
const READ_CONFIG_OVERRIDES = [
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.quotepath=false',
  '-c',
  'log.showSignature=false',
  '-c',
  'gpg.program=',
  '-c',
  'diff.external=',
  '-c',
  'protocol.ext.allow=never',
]
/** fetch 的安全覆盖项：保留凭据助手与 SSH 配置（拉取需要），只禁用 ext:: 传输。 */
const FETCH_CONFIG_OVERRIDES = ['-c', 'core.fsmonitor=false', '-c', 'protocol.ext.allow=never']
/** 单仓库 fetch 超时。 */
const FETCH_TIMEOUT_MS = 60000
/** fetch 并发数。 */
const FETCH_CONCURRENCY = 4
/** 扫描仓库的并发数，避免同时拉起大量 git 进程。 */
const SCAN_CONCURRENCY = 6
/** 状态查询缓存有效期，避免切换视图时重复扫描。 */
const STATE_CACHE_TTL = 3000
/** 提交详情缓存有效期；提交内容不随时间变化。 */
const COMMIT_CACHE_TTL = 300000
/** 状态缓存条目上限。 */
const STATE_CACHE_LIMIT = 8
/** 提交详情缓存条目上限。 */
const COMMIT_CACHE_LIMIT = 128
/** 详情中提交说明的最大保留长度。 */
const MESSAGE_LIMIT = 100000
/** 合并提交最多列出的引入提交数。 */
const MERGE_COMMIT_LIMIT = 200
/** 单次响应合并后的提交总数上限，避免超大工作区撑爆响应体。 */
const MAX_TOTAL_COMMITS = 5000
/** 远程独有提交的额外取数预算，保证本地 HEAD 不被挤出结果。 */
const REMOTE_EXTRA_LIMIT = 120
/** git log 的输出格式：字段以 NUL（%x00）分隔，每条记录以 %x00 收尾，按每 9 个字段一条记录解析。 */
const LOG_FORMAT = '--pretty=format:%H%x00%h%x00%an%x00%aI%x00%s%x00%D%x00%S%x00%cI%x00%P%x00'
/** 单个文件差异的最大行数。 */
const PATCH_LINE_LIMIT = 5000
/** 差异中单行的最大字符数。 */
const PATCH_LINE_CHARS = 2000
/** 差异内容中需要跳过的元信息行前缀。 */
const DIFF_META_PREFIXES = [
  'diff --git',
  'index ',
  '--- ',
  '+++ ',
  'new file mode',
  'deleted file mode',
  'old mode',
  'new mode',
  'similarity index',
  'dissimilarity index',
  'rename from',
  'rename to',
]

/** 工作区状态缓存，键为根目录加查询条件。 */
const stateCache = new Map()
/** 提交详情缓存，键为仓库路径加提交哈希。 */
const commitCache = new Map()

export const inject = ['connection', 'workspaceRegistry']

/**
 * 清掉缓存中已过期的条目。
 * @param {Map<string, { at: number, value: unknown }>} cache 目标缓存。
 * @param {number} ttl 有效期。
 */
function pruneCache(cache, ttl) {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now - entry.at >= ttl) cache.delete(key)
  }
}

/**
 * 写入缓存并淘汰最旧的条目。
 * @param {Map<string, { at: number, value: unknown }>} cache 目标缓存。
 * @param {string} key 键。
 * @param {unknown} value 值。
 * @param {number} limit 条目上限。
 */
function setBoundedCache(cache, key, value, limit) {
  cache.set(key, { at: Date.now(), value })
  while (cache.size > limit) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/**
 * 截断过长文本。
 * @param {string} value 原文本。
 * @param {number} limit 最大长度。
 */
function truncate(value, limit) {
  return value.length > limit ? `${value.slice(0, limit)}\n…` : value
}

/**
 * 把 NUL 分隔的 git 输出按固定字段数切成记录。
 * @param {string} stdout git 输出。
 * @param {number} size 每条记录的字段数。
 * @returns {string[][]} 记录数组。
 */
function splitRecords(stdout, size) {
  const tokens = stdout.split(FIELD_SEP)
  if (tokens.length > 0 && tokens[tokens.length - 1] === '') tokens.pop()
  const records = []
  for (let index = 0; index + size <= tokens.length; index += size) {
    const fields = tokens.slice(index, index + size)
    fields[0] = fields[0].replace(/^[\r\n]+/, '')
    records.push(fields)
  }
  return records
}

/**
 * 把提交时间转成可比较的时间戳；无效值视为 0。
 * @param {{ date: string, committerDate: string }} commit 提交。
 */
function commitTime(commit) {
  const parsed = Date.parse(commit.committerDate || commit.date)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** 读取类命令继承的环境变量白名单，避免把宿主进程里的凭据交给 git 子进程。 */
const READ_ENV_KEYS = [
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'SSH_AUTH_SOCK',
]

/**
 * 只读命令的环境变量：白名单 + 固定的 git 变量。
 */
function readEnv() {
  const env = {}
  for (const key of READ_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  env.GIT_TERMINAL_PROMPT = '0'
  env.GIT_OPTIONAL_LOCKS = '0'
  env.GIT_ALLOW_PROTOCOL = 'file:git:ssh:http:https'
  return env
}

/**
 * 执行一条 git 命令，失败不抛出。
 * @param {string[]} args 参数数组，不经过 shell。
 * @param {string} cwd 仓库目录。
 * @param {{ timeout?: number, signal?: AbortSignal, network?: boolean }} [options] 超时、取消与是否联网。
 */
function git(args, cwd, options = {}) {
  const network = options.network === true
  return new Promise((resolve) => {
    execFile(
      'git',
      [...(network ? FETCH_CONFIG_OVERRIDES : READ_CONFIG_OVERRIDES), ...args],
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        timeout: options.timeout ?? 20000,
        signal: options.signal,
        env: network ? { ...process.env, GIT_TERMINAL_PROMPT: '0' } : readEnv(),
      },
      (error, stdout) => {
        if (error) resolve({ ok: false, message: String(error.message ?? error) })
        else resolve({ ok: true, stdout })
      },
    )
  })
}

/**
 * 解析真实路径；无法解析时返回 null。
 * 保留平台原始大小写，由 path.relative 按平台语义比较。
 * @param {string} value 路径。
 */
function canonicalPath(value) {
  try {
    return realpathSync(value)
  } catch {
    return null
  }
}

/**
 * 判断目标路径是否位于某个已注册工作区之内。
 * @param {any} ctx cordis 上下文。
 * @param {string} target 目标绝对路径。
 */
function isInsideWorkspace(ctx, target) {
  let workspaces
  try {
    workspaces = ctx.workspaceRegistry.list()
  } catch {
    return false
  }
  if (!Array.isArray(workspaces)) return false

  const resolved = canonicalPath(target)
  if (resolved === null) return false

  for (const workspace of workspaces) {
    if (typeof workspace?.path !== 'string' || workspace.path === '') continue
    const base = canonicalPath(workspace.path)
    if (base === null) continue
    const relative = path.relative(base, resolved)
    if (relative === '') return true
    if (relative === '..' || relative.startsWith(`..${path.sep}`)) continue
    if (path.isAbsolute(relative)) continue
    return true
  }
  return false
}

/**
 * 校验并规范化工作区根目录，返回解析过符号链接的真实路径。
 * @param {string} value 候选路径。
 * @returns {string | null} 规范化后的绝对路径，非法时为 null。
 */
function resolveWorkspaceRoot(value) {
  if (typeof value !== 'string' || value.trim() === '') return null
  if (!path.isAbsolute(value)) return null
  if (!existsSync(value)) return null
  try {
    if (!statSync(value).isDirectory()) return null
    return realpathSync(value)
  } catch {
    return null
  }
}

/**
 * 判断目录自身是否就是一个仓库根（工作树以及链接工作树的 `.git` 文件都算）。
 * 用于阻止 git 向上发现工作区之外的仓库。
 * @param {string} repo 目录。
 */
function isGitRepoRoot(repo) {
  return existsSync(path.join(repo, '.git'))
}

/**
 * 收集工作区内所有 git 仓库，含根自身与嵌套仓库。
 * @param {string} root 工作区目录。
 * @param {number} maxDepth 最大递归深度。
 */
async function discoverRepos(root, maxDepth) {
  const repos = []
  const seen = new Set()

  async function walk(dir, depth) {
    if (repos.length >= MAX_REPOS) return
    const current = path.resolve(dir)
    if (seen.has(current)) return
    seen.add(current)
    if (existsSync(path.join(current, '.git'))) {
      repos.push(current)
      if (repos.length >= MAX_REPOS) return
    }
    if (depth >= maxDepth) return
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (repos.length >= MAX_REPOS) return
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      await walk(path.join(current, entry.name), depth + 1)
    }
  }

  await walk(root, 0)
  return repos
}

/**
 * 读取单个仓库的分支、脏状态与提交列表。
 * @param {string} repo 仓库绝对路径。
 * @param {string} root 工作区根目录，用于生成展示名。
 * @param {number} limit 每个仓库取多少条提交。
 * @param {boolean} allBranches 是否取所有分支。
 * @param {AbortSignal} [signal] 请求取消信号。
 */
async function readRepo(repo, root, limit, allBranches, signal) {
  const relative = path.relative(root, repo)
  const name = relative === '' ? path.basename(root) : relative.split(path.sep).join('/')

  const logArgs = [
    '-c',
    'core.quotepath=false',
    'log',
    LOG_FORMAT,
    '--source',
    '--date-order',
    '-n',
    String(limit),
  ]
  if (allBranches) logArgs.push('--all')
  else logArgs.push('HEAD')

  const [statusResult, logResult] = await Promise.all([
    git(['status', '--porcelain=v1', '-uno', '--branch'], repo, { signal }),
    git(logArgs, repo, { signal }),
  ])

  let branch = ''
  let dirty = false
  let upstream = null
  let upstreamRef = ''
  if (statusResult.ok) {
    const lines = statusResult.stdout.split('\n')
    const header = lines[0] ?? ''
    if (header.startsWith('## ')) {
      const rest = header.slice(3).trim()
      const tracked = /^(.*?)\.\.\.(.*?)(?:\s\[(.*)\])?$/.exec(rest)
      if (tracked !== null) {
        branch = tracked[1]
        upstreamRef = tracked[2]
        const track = tracked[3] ?? ''
        const ahead = /ahead (\d+)/.exec(track)
        const behind = /behind (\d+)/.exec(track)
        if (ahead !== null || behind !== null) {
          upstream = {
            ahead: ahead === null ? 0 : Number(ahead[1]),
            behind: behind === null ? 0 : Number(behind[1]),
          }
        }
      } else if (rest !== '') {
        branch = rest.startsWith('HEAD') ? 'HEAD' : rest
      }
    }
    dirty = lines.slice(1).some((line) => line.trim() !== '')
  }

  let effectiveLog = logResult
  const remoteOnly = new Set()
  if (!allBranches && upstreamRef !== '' && upstream !== null && upstream.behind > 0) {
    const extra = Math.min(upstream.behind, REMOTE_EXTRA_LIMIT)
    const extendedArgs = [
      '-c',
      'core.quotepath=false',
      'log',
      LOG_FORMAT,
      '--source',
      '--date-order',
      '-n',
      String(limit + extra),
      '--end-of-options',
      'HEAD',
      upstreamRef,
    ]
    const [extended, remoteList] = await Promise.all([
      git(extendedArgs, repo, { signal }),
      git(['rev-list', '-n', String(limit + extra + 20), '--end-of-options', `HEAD..${upstreamRef}`], repo, {
        signal,
      }),
    ])
    if (extended.ok) effectiveLog = extended
    if (remoteList.ok) {
      for (const line of remoteList.stdout.split('\n')) {
        const hash = line.trim()
        if (hash !== '') remoteOnly.add(hash)
      }
    }
  }

  const commits = []
  if (effectiveLog.ok) {
    for (const fields of splitRecords(effectiveLog.stdout, 9)) {
      if (!/^[0-9a-fA-F]{40}$/.test(fields[0])) continue
      const hash = fields[0].toLowerCase()
      commits.push({
        repo: name,
        hash,
        short: fields[1],
        author: fields[2],
        date: fields[3],
        subject: fields[4],
        refs: fields[5].trim(),
        source: fields[6].trim(),
        committerDate: fields[7].trim(),
        parentCount: fields[8].trim() === '' ? 0 : fields[8].trim().split(' ').length,
        remoteOnly: remoteOnly.has(hash),
      })
    }
  }

  return {
    name,
    path: repo,
    branch,
    dirty,
    upstream,
    error: effectiveLog.ok ? null : effectiveLog.message.slice(0, 300),
    commits,
  }
}

/**
 * 扫描并聚合全部仓库的提交。
 * @param {{ root: string, limit: number, maxDepth: number, allBranches: boolean }} request
 */
async function collect(request) {
  const repos = await discoverRepos(request.root, request.maxDepth)
  const details = new Array(repos.length)
  let cursor = 0
  const workers = Math.min(SCAN_CONCURRENCY, Math.max(repos.length, 1))

  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const index = cursor
        cursor += 1
        if (index >= repos.length) return
        details[index] = await readRepo(
          repos[index],
          request.root,
          request.limit,
          request.allBranches,
          request.signal,
        )
      }
    }),
  )

  const commits = []
  for (const detail of details) {
    for (const commit of detail.commits) commits.push(commit)
    delete detail.commits
  }
  commits.sort((left, right) => commitTime(right) - commitTime(left))

  const truncated = commits.length > MAX_TOTAL_COMMITS
  if (truncated) commits.length = MAX_TOTAL_COMMITS

  return {
    root: request.root,
    scannedAt: new Date().toISOString(),
    repos: details,
    commits,
    total: commits.length,
    truncated,
  }
}

/**
 * 读取一次合并从第一个父提交之外引入的提交。
 * @param {string} repo 仓库路径。
 * @param {string} hash 合并提交哈希。
 * @param {AbortSignal} [signal] 请求取消信号。
 */
async function readIntroducedCommits(repo, hash, signal) {
  const result = await git(
    [
      'log',
      '--no-merges',
      `--pretty=format:%H%x00%h%x00%an%x00%aI%x00%cI%x00%s%x00`,
      '-n',
      String(MERGE_COMMIT_LIMIT),
      '--end-of-options',
      `${hash}^1..${hash}`,
    ],
    repo,
    { signal },
  )
  if (!result.ok) return { commits: [], truncated: false }

  const commits = []
  for (const fields of splitRecords(result.stdout, 6)) {
    if (!/^[0-9a-fA-F]{40}$/.test(fields[0])) continue
    commits.push({
      hash: fields[0].toLowerCase(),
      short: fields[1],
      author: fields[2],
      date: fields[3],
      committerDate: fields[4],
      subject: fields[5],
    })
  }
  commits.sort((left, right) => commitTime(right) - commitTime(left))
  return { commits, truncated: commits.length >= MERGE_COMMIT_LIMIT }
}

/**
 * 构造 JSON 响应。
 * @param {number} status HTTP 状态码。
 * @param {unknown} value 响应体。
 */
function jsonResponse(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/**
 * 处理工作区状态查询。
 * @param {Request} request 已鉴权请求。
 * @param {any} ctx cordis 上下文。
 */
async function handleState(request, ctx) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('root')
  const root = resolveWorkspaceRoot(requested)
  if (root === null) return jsonResponse(400, { error: 'invalid-root', root: requested ?? '' })
  if (!isInsideWorkspace(ctx, root)) return jsonResponse(403, { error: 'outside-workspace', root })

  const limit = Math.floor(Math.min(Math.max(Number(url.searchParams.get('limit') ?? 40) || 40, 1), 500))
  const maxDepth = Math.floor(
    Math.min(Math.max(Number(url.searchParams.get('depth') ?? 4) || 4, 1), 10),
  )
  const allBranches = url.searchParams.get('all') === '1'
  const cacheKey = `${root}|${limit}|${maxDepth}|${allBranches}`

  pruneCache(stateCache, STATE_CACHE_TTL)
  const cached = stateCache.get(cacheKey)
  if (cached !== undefined) return jsonResponse(200, cached.value)

  const value = await collect({ root, limit, maxDepth, allBranches, signal: request.signal })
  if (!request.signal.aborted) setBoundedCache(stateCache, cacheKey, value, STATE_CACHE_LIMIT)
  return jsonResponse(200, value)
}

/**
 * 处理单个提交详情查询。
 * @param {Request} request 已鉴权请求。
 * @param {any} ctx cordis 上下文。
 */
async function handleCommit(request, ctx) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('repo')
  const repo = resolveWorkspaceRoot(requested)
  const hash = url.searchParams.get('hash') ?? ''
  if (repo === null) return jsonResponse(400, { error: 'invalid-repo', repo: requested ?? '' })
  if (!isInsideWorkspace(ctx, repo)) return jsonResponse(403, { error: 'outside-workspace', repo })
  if (!isGitRepoRoot(repo)) return jsonResponse(400, { error: 'invalid-repo', repo })
  if (!/^[0-9a-fA-F]{7,40}$/.test(hash)) return jsonResponse(400, { error: 'invalid-hash', hash })

  const cacheKey = `${repo}|${hash.toLowerCase()}`
  pruneCache(commitCache, COMMIT_CACHE_TTL)
  const cached = commitCache.get(cacheKey)
  if (cached !== undefined) return jsonResponse(200, cached.value)

  const metaArgs = [
    'show',
    '-s',
    `--pretty=format:%H%x00%h%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%P%x00%D%x00%B%x00`,
    '--end-of-options',
    hash,
  ]
  const [metaResult, nameStatusResult, numstatResult] = await Promise.all([
    git(metaArgs, repo, { signal: request.signal }),
    git(
      ['show', '--name-status', '--pretty=format:', '--no-renames', '-m', '--first-parent', '--end-of-options', hash],
      repo,
      { signal: request.signal },
    ),
    git(
      ['show', '--numstat', '--pretty=format:', '--no-renames', '-m', '--first-parent', '--end-of-options', hash],
      repo,
      { signal: request.signal },
    ),
  ])

  if (!metaResult.ok) {
    return jsonResponse(404, {
      error: 'commit-not-found',
      message: metaResult.message.slice(0, 300),
    })
  }

  const fields = metaResult.stdout.replace(/^[\r\n]+/, '').split(FIELD_SEP)
  const rawMessage = truncate((fields[10] ?? '').replace(/\r\n/g, '\n'), MESSAGE_LIMIT)
  const messageLines = rawMessage.split('\n')
  const subject = (messageLines[0] ?? '').trim()
  const body = messageLines.slice(1).join('\n').trim()

  const lineCounts = new Map()
  if (numstatResult.ok) {
    for (const line of numstatResult.stdout.split('\n')) {
      const parts = line.split('\t')
      if (parts.length < 3) continue
      lineCounts.set(parts.slice(2).join('\t'), {
        insertions: parts[0] === '-' ? null : Number(parts[0]),
        deletions: parts[1] === '-' ? null : Number(parts[1]),
      })
    }
  }

  const files = []
  if (nameStatusResult.ok) {
    for (const line of nameStatusResult.stdout.split('\n')) {
      if (line.trim() === '') continue
      const parts = line.split('\t')
      if (parts.length < 2) continue
      const filePath = parts[parts.length - 1]
      const counts = lineCounts.get(filePath) ?? { insertions: 0, deletions: 0 }
      files.push({
        status: parts[0],
        path: filePath,
        insertions: counts.insertions,
        deletions: counts.deletions,
      })
    }
  }

  let insertions = 0
  let deletions = 0
  for (const file of files) {
    if (typeof file.insertions === 'number') insertions += file.insertions
    if (typeof file.deletions === 'number') deletions += file.deletions
  }

  const parents = (fields[8] ?? '').split(' ').filter((item) => item !== '')
  let merge = null
  if (parents.length > 1) {
    const introduced = await readIntroducedCommits(repo, hash, request.signal)
    merge = { base: parents[0], introduced: introduced.commits, truncated: introduced.truncated }
  }

  const value = {
    hash: fields[0] ?? hash,
    short: fields[1] ?? hash.slice(0, 8),
    author: { name: fields[2] ?? '', email: fields[3] ?? '', date: fields[4] ?? '' },
    committer: { name: fields[5] ?? '', email: fields[6] ?? '', date: fields[7] ?? '' },
    parents,
    merge,
    refs: fields[9] ?? '',
    subject,
    body,
    files,
    stat: { files: files.length, insertions, deletions },
  }
  if (!request.signal.aborted) setBoundedCache(commitCache, cacheKey, value, COMMIT_CACHE_LIMIT)
  return jsonResponse(200, value)
}

/**
 * 处理远程拉取请求。
 * @param {Request} request 已鉴权请求。
 * @param {any} ctx cordis 上下文。
 */
async function handleFetch(request, ctx) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('root')
  const root = resolveWorkspaceRoot(requested)
  if (root === null) return jsonResponse(400, { error: 'invalid-root', root: requested ?? '' })
  if (!isInsideWorkspace(ctx, root)) return jsonResponse(403, { error: 'outside-workspace', root })

  const repos = await discoverRepos(root, 4)
  const started = Date.now()
  const results = []
  const queue = [...repos]

  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, Math.max(queue.length, 1)) }, async () => {
      while (queue.length > 0) {
        const repo = queue.shift()
        const name = path.relative(root, repo) || '.'
        const begin = Date.now()
        const outcome = await git(['fetch', '--all', '--prune', '--quiet', '--no-recurse-submodules'], repo, {
          timeout: FETCH_TIMEOUT_MS,
          signal: request.signal,
          network: true,
        })
        results.push({
          name,
          path: repo,
          ok: outcome.ok,
          message: outcome.ok ? null : outcome.message.slice(0, 300),
          ms: Date.now() - begin,
        })
      }
    }),
  )

  results.sort((left, right) => left.name.localeCompare(right.name))
  stateCache.clear()
  return jsonResponse(200, {
    root,
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    failed: results.filter((item) => !item.ok).length,
    results,
  })
}

/**
 * 处理单个文件的差异查询。
 * @param {Request} request 已鉴权请求。
 * @param {any} ctx cordis 上下文。
 */
async function handlePatch(request, ctx) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('repo')
  const repo = resolveWorkspaceRoot(requested)
  const hash = url.searchParams.get('hash') ?? ''
  const file = url.searchParams.get('file') ?? ''

  if (repo === null) return jsonResponse(400, { error: 'invalid-repo', repo: requested ?? '' })
  if (!isInsideWorkspace(ctx, repo)) return jsonResponse(403, { error: 'outside-workspace', repo })
  if (!isGitRepoRoot(repo)) return jsonResponse(400, { error: 'invalid-repo', repo })
  if (!/^[0-9a-fA-F]{7,40}$/.test(hash)) return jsonResponse(400, { error: 'invalid-hash', hash })
  if (file === '' || file.includes('\u0000')) return jsonResponse(400, { error: 'invalid-file', file })
  if (file.startsWith(':')) return jsonResponse(400, { error: 'invalid-file', file })
  if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) {
    return jsonResponse(400, { error: 'invalid-file', file })
  }

  const result = await git(
    [
      'show',
      '--format=',
      '--no-color',
      '--no-textconv',
      '--no-ext-diff',
      '-U3',
      '-m',
      '--first-parent',
      '--end-of-options',
      hash,
      '--',
      file,
    ],
    repo,
    { signal: request.signal },
  )
  if (!result.ok) {
    return jsonResponse(404, { error: 'patch-not-found', message: result.message.slice(0, 300) })
  }

  const rawLines = result.stdout.split('\n')
  const binary = rawLines.some(
    (line) => line.startsWith('Binary files ') || line.startsWith('GIT binary patch'),
  )

  const hunks = []
  let current = null
  let additions = 0
  let deletions = 0
  let emitted = 0
  let truncated = false

  for (const raw of rawLines) {
    if (emitted >= PATCH_LINE_LIMIT) {
      truncated = true
      break
    }
    if (raw.startsWith('@@')) {
      if (current !== null) hunks.push(current)
      current = { header: raw, lines: [] }
      emitted += 1
      continue
    }
    if (DIFF_META_PREFIXES.some((prefix) => raw.startsWith(prefix))) continue
    if (raw.startsWith('\\')) continue
    if (current === null || raw === '') continue

    let type = 'context'
    let text = raw
    if (raw.startsWith('+')) {
      type = 'add'
      text = raw.slice(1)
      additions += 1
    } else if (raw.startsWith('-')) {
      type = 'del'
      text = raw.slice(1)
      deletions += 1
    } else if (raw.startsWith(' ')) {
      text = raw.slice(1)
    }
    current.lines.push({
      type,
      text: text.length > PATCH_LINE_CHARS ? `${text.slice(0, PATCH_LINE_CHARS)}…` : text,
    })
    emitted += 1
  }
  if (current !== null) hunks.push(current)

  return jsonResponse(200, { file, binary, truncated, additions, deletions, hunks })
}

/**
 * Host 半：在 Connection 的 authenticated exact route registry 上注册接口。
 * @param {any} ctx cordis 上下文。
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_STATE,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: (request) => handleState(request, ctx),
      }),
    'git-multirepo: state route',
  )
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_COMMIT,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: (request) => handleCommit(request, ctx),
      }),
    'git-multirepo: commit route',
  )
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_FETCH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => handleFetch(request, ctx),
      }),
    'git-multirepo: fetch route',
  )
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_PATCH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: (request) => handlePatch(request, ctx),
      }),
    'git-multirepo: patch route',
  )
}
