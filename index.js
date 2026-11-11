import { execFile } from 'node:child_process'
import { accessSync, constants as fsConstants, existsSync, lstatSync, realpathSync, statSync, readFileSync } from 'node:fs'
import { opendir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** 工作区状态路由，注册在 Connection 的 exact fetch registry。 */
const ROUTE_STATE = '/api/git-multirepo/state'
/** 单个提交详情路由。 */
const ROUTE_COMMIT = '/api/git-multirepo/commit'
/** 远程拉取路由。 */
const ROUTE_FETCH = '/api/git-multirepo/fetch'
/** 单个文件的差异路由。 */
const ROUTE_PATCH = '/api/git-multirepo/patch'
/** 工作区未提交改动列表路由。 */
const ROUTE_WORKTREE = '/api/git-multirepo/worktree'
/** 未提交单个文件的差异路由。 */
const ROUTE_WORKTREE_DIFF = '/api/git-multirepo/worktree-diff'
/**
 * git 输出字段分隔符，由格式串里的 %x00 产生。
 * NUL 不会出现在提交对象、引用名或路径中，因此提交内容无法用它伪造字段或记录。
 */
const FIELD_SEP = '\u0000'
/** 单条 git 命令的最大输出缓冲。 */
const MAX_BUFFER = 2 * 1024 * 1024
const STATE_BYTE_LIMIT = 8 * 1024 * 1024
const STATE_CACHE_BYTE_LIMIT = 16 * 1024 * 1024
const COMMIT_CACHE_BYTE_LIMIT = 8 * 1024 * 1024
const DETAIL_BYTE_LIMIT = 512 * 1024
const FILE_LIST_BYTE_LIMIT = 128 * 1024
const FIELD_LIMIT = 4000
const HASH = /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/
const REQUEST_HASH = /^[0-9a-fA-F]{7,64}$/
const MAX_ENTRIES = 50000
const REQUEST_TIMEOUT_MS = 120000
/** 单次扫描最多发现的仓库数，避免超大工作区拖垮请求。 */
const MAX_REPOS = 100
/** 单次扫描最多访问的目录数；超过后停止遍历，避免巨型目录树拖垮请求。 */
const MAX_DIRS = 20000
/** 提交详情最多返回的变更文件数；超出后截断并置 filesTruncated。 */
const MAX_FILES = 500
/**
 * 扫描工作区时跳过的目录名。
 * 全部是构建产物或依赖目录；不包含 `packages`——monorepo 的 `packages/` 下
 * 也可能放着独立仓库，README 承诺发现工作区内所有仓库。
 */
const SKIP_DIRS = new Set([
  'node_modules',
  'bin',
  'obj',
  'dist',
  'target',
  '.vs',
  '.svn',
  '.idea',
])
/**
 * 读取类 git 命令的安全覆盖项：压住仓库本地 config 中可能执行外部程序的键。
 * 这是本插件面对"工作区内存在不受信任仓库"的主要防线之一。
 * filter/diff driver 的键名因仓库而异，无法写死：readOnlyConfigNeutralisers()
 * 会在每个仓库上枚举键名并通过独立环境键值覆盖，见该函数。
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
  '-c',
  'protocol.allow=never',
  '-c',
  'core.sshCommand=',
  '-c',
  'core.gitProxy=',
  '-c',
  'credential.helper=',
  '-c',
  `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
]
/** fetch 的安全覆盖项：保留凭据助手与 SSH 配置（拉取需要），只禁用 ext:: 传输。 */
const FETCH_CONFIG_OVERRIDES = ['-c', 'core.fsmonitor=false', '-c', 'protocol.ext.allow=never']
/** 单仓库 fetch 超时。 */
const FETCH_TIMEOUT_MS = 60000
/** 一次 fetch 请求的总时限：到点后中止剩余仓库。 */
const FETCH_TOTAL_TIMEOUT_MS = 120000
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
/** 工作区改动列表缓存有效期，与状态视图一致，便于在两个视图间切换时复用。 */
const WORKTREE_CACHE_TTL = 2000
/** 工作区改动列表缓存的条目上限。 */
const WORKTREE_CACHE_LIMIT = 8
/** 工作区改动列表响应与缓存的字节上限。 */
const WORKTREE_CACHE_BYTE_LIMIT = 8 * 1024 * 1024
/** 每个仓库最多返回的改动条目数，跨 conflicted/staged/unstaged/untracked 四组。 */
const MAX_CHANGE_ENTRIES = 2000
/** 未跟踪文件预览的最大读取字节数。 */
const UNTRACKED_READ_LIMIT = 512 * 1024

/** 工作区状态缓存，键为根目录加查询条件。 */
const stateCache = new Map()
/** 提交详情缓存，键为仓库路径加提交哈希。 */
const commitCache = new Map()
/** 进行中的 fetch，键为工作区根目录；同一工作区同时只允许一个。 */
const fetchLocks = new Map()
/** 工作区改动缓存，键为 `根目录|扫描深度`。 */
const worktreeCache = new Map()

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
function setBoundedCache(cache, key, value, limit, byteLimit = Infinity) {
  const serialized = Number.isFinite(byteLimit) ? JSON.stringify(value) : null
  const bytes = serialized === null ? 0 : Buffer.byteLength(serialized)
  if (bytes > byteLimit) return
  cache.delete(key)
  // Detach substrings from potentially much larger Git output buffers.
  cache.set(key, { at: Date.now(), value: serialized === null ? value : JSON.parse(serialized), bytes })
  let totalBytes = [...cache.values()].reduce((total, entry) => total + (entry.bytes ?? 0), 0)
  while (cache.size > limit || totalBytes > byteLimit) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    totalBytes -= cache.get(oldest).bytes ?? 0
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
 * 校验请求里的单文件相对路径。
 * 拒绝空值、NUL、绝对路径、`..` 段与目录尾斜杠；GIT_LITERAL_PATHSPECS
 * 已关闭 pathspec magic，因此冒号、星号等字符只按字面匹配。
 * @param {string} file 请求参数。
 * @returns {string | null} 合法返回 null，否则返回错误码。
 */
function safeRelativePath(file) {
  if (typeof file !== 'string' || file === '') return 'invalid-file'
  if (file.includes('\u0000')) return 'invalid-file'
  if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) return 'invalid-file'
  if (file.endsWith('/') || file.endsWith('\\')) return 'invalid-file'
  return null
}

/**
 * 解析 `git status --porcelain=v1 --branch` 的分支头行。
 * 支持普通分支、带 ahead/behind 的 upstream、unborn HEAD 与 detached HEAD。
 * @param {string} header `## ` 开头的头行。
 * @returns {{ branch: string, upstream: { ahead: number, behind: number } | null, unborn: boolean }} 分支信息。
 */
function parseBranchHeader(header) {
  const result = { branch: '', upstream: null, unborn: false }
  if (typeof header !== 'string' || !header.startsWith('## ')) return result
  const rest = header.slice(3).replace(/\r$/, '').trim()
  const unbornMatch = /^(?:No commits yet|Initial commit) on (.+)$/.exec(rest)
  if (unbornMatch !== null) {
    result.branch = unbornMatch[1]
    result.unborn = true
    return result
  }
  const tracked = /^(.*?)\.\.\.(.*?)(?:\s\[(.*)\])?$/.exec(rest)
  if (tracked !== null) {
    result.branch = tracked[1]
    const track = tracked[3] ?? ''
    const ahead = /ahead (\d+)/.exec(track)
    const behind = /behind (\d+)/.exec(track)
    if (ahead !== null || behind !== null) {
      result.upstream = {
        ahead: ahead === null ? 0 : Number(ahead[1]),
        behind: behind === null ? 0 : Number(behind[1]),
      }
    }
    return result
  }
  // `## HEAD (no branch)`：detached HEAD。
  if (rest !== '') result.branch = rest.startsWith('HEAD') ? 'HEAD' : rest
  return result
}

/**
 * 解析 `git status --porcelain=v1 -z --branch` 的 NUL 分隔输出。
 * @param {string} stdout git 输出。
 * @returns {{ header: string, entries: Array<{ x: string, y: string, path: string }> }} 头行与改动条目。
 */
function parseStatusV1Z(stdout) {
  const records = typeof stdout === 'string' ? stdout.split(FIELD_SEP) : []
  let header = ''
  let index = 0
  if (records.length > 0 && records[0].startsWith('## ')) {
    header = records[0]
    index = 1
  }
  const entries = []
  for (; index < records.length; index += 1) {
    const record = records[index]
    // 每条记录形如 `XY<space><path>`；-z 输出不做 C 风格转义。
    if (record.length < 4 || record[2] !== ' ') continue
    entries.push({ x: record[0], y: record[1], path: record.slice(3) })
  }
  return { header, entries }
}

/**
 * 解析 `git diff --numstat -z` 输出。
 * 二进制文件的增删行数为 `-`，在这里规范为 null 并标记 binary。
 * @param {string} stdout git 输出。
 * @returns {Map<string, { insertions: number | null, deletions: number | null, binary: boolean }>} 按路径索引的行数。
 */
function parseNumstatZ(stdout) {
  const counts = new Map()
  if (typeof stdout !== 'string') return counts
  for (const record of stdout.split(FIELD_SEP)) {
    // 路径本身可能含 Tab，因此第三个分隔符之后的整段都算路径。
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]+)$/.exec(record)
    if (match === null) continue
    counts.set(
      match[3],
      match[1] === '-'
        ? { insertions: null, deletions: null, binary: true }
        : { insertions: Number(match[1]), deletions: Number(match[2]), binary: false },
    )
  }
  return counts
}

/**
 * 解析 unified diff 输出（`git show` / `git diff`）。
 * 提取二进制标记、hunk 与逐行标记；行数与单行长度都有上限。
 * @param {string} raw git 原文。
 * @returns {{ binary: boolean, truncated: boolean, additions: number, deletions: number, hunks: Array<{ header: string, lines: Array<{ type: string, text: string }> }> }} 解析结果。
 */
function parseUnifiedDiff(raw) {
  const rawLines = (typeof raw === 'string' ? raw : '').split('\n')
  const binary = rawLines.some(
    (line) => line.startsWith('Binary files ') || line.startsWith('GIT binary patch'),
  )
  const hunks = []
  let current = null
  let additions = 0
  let deletions = 0
  let emitted = 0
  let truncated = false

  for (const rawLine of rawLines) {
    if (emitted >= PATCH_LINE_LIMIT) {
      truncated = true
      break
    }
    // 只去掉行尾 CR；正文中间或行首的 CR 属于内容。
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line.startsWith('@@')) {
      if (current !== null) hunks.push(current)
      current = { header: line, lines: [] }
      emitted += 1
      continue
    }
    // hunk 之外只有 diff 头部/元信息（diff --git、index、---、+++、mode 等），全部跳过。
    if (current === null || line === '') continue
    // `\ No newline at end of file` 之类的标记行不渲染。
    if (line.startsWith('\\')) continue

    let type = 'context'
    let text = line
    if (line.startsWith('+')) {
      type = 'add'
      text = line.slice(1)
      additions += 1
    } else if (line.startsWith('-')) {
      type = 'del'
      text = line.slice(1)
      deletions += 1
    } else if (line.startsWith(' ')) {
      text = line.slice(1)
    } else {
      // hunk 内无法识别的行按元信息跳过，避免误渲染成正文。
      continue
    }
    current.lines.push({
      type,
      text: text.length > PATCH_LINE_CHARS ? `${text.slice(0, PATCH_LINE_CHARS)}…` : text,
    })
    emitted += 1
  }
  if (current !== null) hunks.push(current)
  return { binary, truncated, additions, deletions, hunks }
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
]

/**
 * 只读命令的环境变量：白名单 + 固定的 git 变量。
 * 不继承凭据类变量（含 SSH_AUTH_SOCK）：只读命令从不需要联网。
 */
function readEnv() {
  const env = {}
  for (const key of READ_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  env.GIT_TERMINAL_PROMPT = '0'
  env.GIT_OPTIONAL_LOCKS = '0'
  // Empty allowlist denies every transport, including lazy promisor fetches.
  env.GIT_ALLOW_PROTOCOL = ''
  env.GIT_NO_LAZY_FETCH = '1'
  env.LC_ALL = 'C'
  // 关闭 pathspec magic（`:()`、`*`、`!` 等），file 参数只按字面路径匹配。
  env.GIT_LITERAL_PATHSPECS = '1'
  return env
}

/**
 * fetch 子进程额外需要的变量：凭据助手、SSH 代理与 Windows 系统路径。
 * fetch 必须能用用户既有的凭据配置，但不能继承宿主的任意环境变量
 * （DSH 进程里可能有 API key / token）。
 */
const FETCH_ENV_KEYS = [
  ...READ_ENV_KEYS,
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  'SSH_ASKPASS',
  'GIT_ASKPASS',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_CONFIG_NOSYSTEM',
  'GCM_INTERACTIVE',
  'WSLENV',
  'DISPLAY',
  'USERNAME',
  'USERDOMAIN',
  'PROGRAMDATA',
]
/** Fetch never inherits config-injection variables from the host environment. */
function fetchEnv() {
  const env = {}
  for (const key of FETCH_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  env.GIT_TERMINAL_PROMPT = '0'
  return env
}

/**
 * Resolve the git executable once, from absolute PATH entries only.
 * Windows searches the child's working directory before PATH, so a repository
 * that contains `git.exe` would otherwise be executed by every read-only scan;
 * the executable must therefore always be an absolute path resolved here.
 * @returns {string | null} Absolute path to git, or null when PATH has none.
 */
let gitExecutable
function resolveGitExecutable() {
  if (gitExecutable !== undefined) return gitExecutable
  gitExecutable = null
  const names = process.platform === 'win32' ? ['git.exe'] : ['git']
  for (const raw of (process.env.PATH ?? '').split(path.delimiter)) {
    const directory = raw.trim().replace(/^"(.*)"$/, '$1')
    if (directory === '' || !path.isAbsolute(directory)) continue
    for (const name of names) {
      const candidate = path.join(directory, name)
      try {
        accessSync(candidate, fsConstants.X_OK)
        gitExecutable = candidate
        return gitExecutable
      } catch {
        // Try the next PATH entry.
      }
    }
  }
  return gitExecutable
}

/**
 * 执行一条 git 命令，失败不抛出。
 * @param {string[]} args 参数数组，不经过 shell。
 * @param {string} cwd 仓库目录。
 * @param {{ timeout?: number, signal?: AbortSignal, network?: boolean, config?: string[][], maxBuffer?: number, ctx?: any }} [options]
 */
function runGit(args, cwd, options = {}) {
  const executable = resolveGitExecutable()
  if (executable === null) {
    return Promise.resolve({ ok: false, code: 'git-not-found', message: 'Git executable not found on PATH' })
  }
  const network = options.network === true
  const env = network ? fetchEnv() : readEnv()
  // Separate keys and values: a legal subsection may contain '=' or spaces.
  if (!network) {
    const config = options.config ?? []
    env.GIT_CONFIG_COUNT = String(config.length)
    config.forEach(([key, value], index) => {
      env[`GIT_CONFIG_KEY_${index}`] = key
      env[`GIT_CONFIG_VALUE_${index}`] = value
    })
  }
  return new Promise((resolve) => {
    execFile(
      executable,
      ['--no-pager', ...(network ? FETCH_CONFIG_OVERRIDES : READ_CONFIG_OVERRIDES), ...args],
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: options.maxBuffer ?? MAX_BUFFER,
        windowsHide: true,
        timeout: options.timeout ?? 20000,
        signal: options.signal,
        env,
      },
      (error, stdout, stderr) => {
        if (error) resolve({ ok: false, code: error.code, message: String(stderr || error.message || error) })
        else resolve({ ok: true, stdout })
      },
    )
  })
}

let gitSupport
function supportsGit() {
  // Git <=2.35.1 treats fsmonitor=false as a hook named "false". Older Git
  // also lacks GIT_CONFIG_COUNT. Refuse versions without both safety controls.
  // The probe runs from the temp directory: no repository controls its cwd.
  gitSupport ??= runGit(['--version'], tmpdir()).then((result) => {
    const version = result.ok && /git version (\d+)\.(\d+)/.exec(result.stdout)
    return version && (Number(version[1]) > 2 || Number(version[1]) === 2 && Number(version[2]) >= 36)
  })
  return gitSupport
}
async function git(args, cwd, options = {}) {
  if (!(await supportsGit())) return { ok: false, code: 'unsupported-git-version', message: 'Git 2.36 or newer is required' }
  const storage = repositoryStorage(cwd, options.ctx)
  if (storage === null) return { ok: false, code: 'repository-boundary', message: 'repository-boundary: Git metadata must belong to registered workspaces; object alternates are not supported' }
  // 内容转换与外部 diff 都可能执行仓库本地配置的程序；日志、提交与工作区
  // 差异都只读取 git 自己的输出。
  const safeArgs = !options.network && ['log', 'show', 'diff'].includes(args[0])
    ? [args[0], '--no-textconv', '--no-ext-diff', ...args.slice(1)]
    : args
  return runGit([`--git-dir=${storage.gitDir}`, `--work-tree=${cwd}`, ...safeArgs], cwd, options)
}

/**
 * 只中和仓库自带（local/worktree）的 filter/diff 执行面。
 * git status 在把工作区内容转换回 git 对象时会执行 filter driver
 * （`.gitattributes` 选中的 `filter.<driver>.clean` / `.process`）。
 * 仓库 local/worktree 配置属于不可信输入；system/global 配置属于用户自己的
 * 受信配置（例如 git-lfs），必须保留，否则 LFS 仓库会被误判为 dirty。
 * 这里只读 `git config`，不会执行任何配置里的程序。
 * @param {string} repo 仓库目录。
 * @returns {Promise<{ok: boolean, config?: string[][], message?: string}>} 配置覆盖或失败原因。
 */
const UNSAFE_CONFIG_KEY = /^(filter\..*\.(clean|smudge|process|required)|diff\..*\.(command|textconv)|diff\.external)$/
async function readOnlyConfigNeutralisers(repo, signal, ctx) {
  // --list exits 0 even with no matches, so an empty result cannot be confused
  // with a failure; the scope column keeps trusted user configuration out.
  const result = await git(['config', '--list', '--null', '--show-scope', '--name-only', '--includes'], repo, {
    signal, ctx, timeout: 5000, maxBuffer: 256 * 1024,
  })
  if (!result.ok) return { ok: false, message: 'unsafe-config: unable to enumerate Git configuration' }
  const tokens = result.stdout.split('\0')
  const config = []
  for (let index = 0; index + 1 < tokens.length; index += 2) {
    const scope = tokens[index]
    const key = tokens[index + 1]
    if (scope !== 'local' && scope !== 'worktree') continue
    if (!UNSAFE_CONFIG_KEY.test(key)) continue
    config.push([key, key.endsWith('.required') ? 'false' : ''])
    if (config.length > 512) return { ok: false, message: 'unsafe-config: unsupported Git configuration keys' }
  }
  return { ok: true, config }
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

/** Bound administrative storage as well as the worktree; legitimate linked
 * worktrees remain usable when their main repository is also registered. */
function repositoryStorage(repo, ctx) {
  if (!ctx || !isInsideWorkspace(ctx, repo)) return null
  const readPointer = (file) => {
    if (statSync(file).size > 8192) throw new Error('oversized Git pointer')
    return readFileSync(file, 'utf8').trim()
  }
  try {
    let gitDir = path.join(repo, '.git')
    if (statSync(gitDir).isFile()) {
      const pointer = readPointer(gitDir)
      if (!pointer.startsWith('gitdir: ')) return null
      gitDir = path.resolve(repo, pointer.slice(8))
    }
    gitDir = canonicalPath(gitDir)
    if (gitDir === null || !isInsideWorkspace(ctx, gitDir)) return null
    let commonDir = gitDir
    const commonFile = path.join(gitDir, 'commondir')
    if (existsSync(commonFile)) commonDir = canonicalPath(path.resolve(gitDir, readPointer(commonFile)))
    if (commonDir === null || !isInsideWorkspace(ctx, commonDir)) return null
    const objects = canonicalPath(path.join(commonDir, 'objects'))
    if (objects === null || !isInsideWorkspace(ctx, objects)) return null
    const alternates = path.join(objects, 'info', 'alternates')
    if (existsSync(alternates) && readPointer(alternates) !== '') return null
    return { gitDir, commonDir }
  } catch {
    return null
  }
}

/**
 * 判断目录自身是否就是一个有效仓库的根（工作树以及链接工作树的 `.git` 文件都算）。
 * 仅看 `.git` 是否存在不够：`.git` 是无效目录时 git 会向**上**发现父仓库，
 * 从而越过工作区边界读写父仓库；这里用 rev-parse --show-toplevel 校验真实根。
 * @param {string} repo 目录。
 * @returns {Promise<boolean>} 目录就是该仓库的根时为 true。
 */
async function isGitRepoRoot(repo, ctx, signal) {
  const expected = canonicalPath(repo)
  if (expected === null) return false
  const result = await git(['rev-parse', '--show-toplevel'], repo, { timeout: 10000, ctx, signal })
  if (!result.ok) return false
  const actual = canonicalPath(result.stdout.trim())
  return actual !== null && actual === expected
}

/**
 * 过滤掉"看似仓库、实际会回退到父仓库"的目录，并保留被跳过项供 fetch 报告。
 * @param {string[]} repos 待校验目录。
 * @returns {Promise<{ repos: string[], skipped: string[] }>} 通过/跳过项。
 */
async function filterRepoRoots(repos, ctx, signal) {
  const checked = await boundedMap(repos, async (repo) => ({ repo, root: await isGitRepoRoot(repo, ctx, signal) }), signal)
  return {
    repos: checked.filter((item) => item.root).map((item) => item.repo),
    skipped: checked.filter((item) => !item.root).map((item) => item.repo),
  }
}

async function boundedMap(items, action, signal) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      signal?.throwIfAborted()
      const index = cursor++
      results[index] = await action(items[index], index)
    }
  }))
  return results
}

/**
 * 收集工作区内所有 git 仓库，含根自身与嵌套仓库。
 * @param {string} root 工作区目录。
 * @param {number} maxDepth 最大递归深度。
 * @returns {Promise<{ repos: string[], truncated: boolean }>} 发现的仓库与是否因上限截断。
 */
async function discoverRepos(root, maxDepth, signal) {
  const repos = []
  const seen = new Set()
  let visited = 0
  let truncated = false
  let entriesSeen = 0

  async function walk(dir, depth) {
    signal?.throwIfAborted()
    if (repos.length >= MAX_REPOS || visited >= MAX_DIRS) {
      truncated = true
      return
    }
    const current = path.resolve(dir)
    if (seen.has(current)) return
    seen.add(current)
    visited += 1
    if (existsSync(path.join(current, '.git'))) {
      repos.push(current)
      if (repos.length >= MAX_REPOS) {
        truncated = true
        return
      }
    }
    if (depth >= maxDepth) return
    let directory
    try {
      directory = await opendir(current)
    } catch {
      return
    }
    for await (const entry of directory) {
      signal?.throwIfAborted()
      entriesSeen += 1
      if (repos.length >= MAX_REPOS || visited >= MAX_DIRS || entriesSeen >= MAX_ENTRIES) {
        truncated = true
        return
      }
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      await walk(path.join(current, entry.name), depth + 1)
    }
  }

  await walk(root, 0)
  return { repos, truncated }
}

/**
 * 生成仓库在工作区内的展示名。
 * @param {string} root 工作区根目录。
 * @param {string} repo 仓库绝对路径。
 * @returns {string} 相对根目录的路径（POSIX 分隔符）；仓库即根时用根目录名。
 */
function repoDisplayName(root, repo) {
  const relative = path.relative(root, repo)
  return relative === '' ? path.basename(root) : relative.split(path.sep).join('/')
}

/**
 * 读取单个仓库的分支、脏状态与提交列表。
 * @param {string} repo 仓库绝对路径。
 * @param {string} root 工作区根目录，用于生成展示名。
 * @param {number} limit 每个仓库取多少条提交。
 * @param {boolean} allBranches 是否取所有分支。
 * @param {AbortSignal} [signal] 请求取消信号。
 */
async function readRepo(repo, root, limit, allBranches, signal, ctx) {
  const name = repoDisplayName(root, repo)

  const logArgs = [
    'log',
    LOG_FORMAT,
    '--source',
    '--date-order',
    '-n',
    String(limit),
  ]
  if (allBranches) logArgs.push('--all')
  else logArgs.push('HEAD')

  // git status 的工作区内容转换可能执行仓库配置里的 filter driver，
  // 因此先枚举并中和该仓库本地的 filter/diff 配置键（只读命令里唯一的执行面）。
  const neutralisers = await readOnlyConfigNeutralisers(repo, signal, ctx)
  const metadata = { name, path: repo, branch: '', dirty: null, upstream: null, commits: [] }
  if (!neutralisers.ok) return { ...metadata, error: neutralisers.message }
  const [statusResult, logResult] = await Promise.all([
    git(['status', '--porcelain=v1', '--untracked-files=normal', '--ignore-submodules=all', '--branch'], repo, { signal, ctx, config: neutralisers.config }),
    git(logArgs, repo, { signal, ctx }),
  ])

  let branch = ''
  let dirty = null
  const unborn = statusResult.ok && /^## (?:No commits yet on |Initial commit on )/.test(statusResult.stdout)
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
        if (rest.startsWith('No commits yet on ')) {
          branch = rest.slice('No commits yet on '.length)
        } else {
          branch = rest.startsWith('HEAD') ? 'HEAD' : rest
        }
      }
    }
    dirty = lines.slice(1).some((line) => line.trim() !== '')
  }

  let effectiveLog = logResult
  const remoteOnly = new Set()
  if (!allBranches && upstreamRef !== '' && upstream !== null && upstream.behind > 0) {
    const extra = Math.min(upstream.behind, REMOTE_EXTRA_LIMIT)
    const extendedArgs = [
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
      git(extendedArgs, repo, { signal, ctx }),
      git(['rev-list', '-n', String(limit + extra + 20), '--end-of-options', `HEAD..${upstreamRef}`], repo, {
        signal, ctx,
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
      if (!HASH.test(fields[0])) continue
      const hash = fields[0].toLowerCase()
      commits.push({
        repo: name,
        hash,
        short: fields[1],
        author: truncate(fields[2], FIELD_LIMIT),
        date: fields[3],
        subject: truncate(fields[4], FIELD_LIMIT),
        refs: truncate(fields[5].trim(), FIELD_LIMIT),
        source: truncate(fields[6].trim(), FIELD_LIMIT),
        committerDate: fields[7].trim(),
        parentCount: fields[8].trim() === '' ? 0 : fields[8].trim().split(' ').length,
        remoteOnly: remoteOnly.has(hash),
      })
    }
  }

  // Do not retain slices backed by large status/log stdout strings across repos.
  return JSON.parse(JSON.stringify({
    name,
    path: repo,
    branch,
    dirty,
    upstream,
    error: !statusResult.ok ? statusResult.message.slice(0, 300) : effectiveLog.ok || unborn ? null : effectiveLog.message.slice(0, 300),
    commits,
  }))
}

/**
 * 扫描并聚合全部仓库的提交。
 * @param {{ root: string, limit: number, maxDepth: number, allBranches: boolean }} request
 */
async function collect(request) {
  const discovered = await discoverRepos(request.root, request.maxDepth, request.signal)
  const verified = await filterRepoRoots(discovered.repos, request.ctx, request.signal)
  const repos = verified.repos
  const details = new Array(repos.length)
  let cursor = 0
  let bytes = 0
  let byteTruncated = false
  const workers = Math.min(SCAN_CONCURRENCY, Math.max(repos.length, 1))

  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        request.signal?.throwIfAborted()
        const index = cursor
        cursor += 1
        if (index >= repos.length) return
        const detail = await readRepo(
          repos[index],
          request.root,
          request.limit,
          request.allBranches,
          request.signal,
          request.ctx,
        )
        const retained = []
        for (const commit of detail.commits) {
          const size = Buffer.byteLength(JSON.stringify(commit))
          if (bytes + size > STATE_BYTE_LIMIT) { byteTruncated = true; break }
          bytes += size
          retained.push(commit)
        }
        detail.commits = retained
        details[index] = detail
      }
    }),
  )

  const commits = []
  for (const detail of details) {
    for (const commit of detail.commits) commits.push(commit)
    delete detail.commits
  }
  commits.sort((left, right) => commitTime(right) - commitTime(left))

  const truncated = byteTruncated || commits.length > MAX_TOTAL_COMMITS
  if (commits.length > MAX_TOTAL_COMMITS) commits.length = MAX_TOTAL_COMMITS

  return {
    root: request.root,
    scannedAt: new Date().toISOString(),
    repos: details,
    commits,
    total: commits.length,
    truncated,
    reposTruncated: discovered.truncated,
    reposSkipped: verified.skipped.length,
  }
}

/**
 * 按固定优先级把四组改动裁剪到 MAX_CHANGE_ENTRIES 条以内。
 * 冲突文件最需要被看到，因此优先保留；剩余预算依次给 staged、unstaged、untracked。
 * @param {any} detail 仓库改动详情。
 * @returns {boolean} 是否发生截断。
 */
function capChangeEntries(detail) {
  let remaining = MAX_CHANGE_ENTRIES
  let truncated = false
  for (const group of [detail.conflicted, detail.staged, detail.unstaged, detail.untracked]) {
    if (group.length <= remaining) {
      remaining -= group.length
      continue
    }
    group.length = remaining
    remaining = 0
    truncated = true
  }
  return truncated
}

/**
 * 读取单个仓库的未提交改动。
 * 只执行只读命令：先中和本地 filter/diff 配置，再取 status 与两份 numstat。
 * @param {string} repo 仓库绝对路径。
 * @param {string} root 工作区根目录，用于生成展示名。
 * @param {AbortSignal} [signal] 请求取消信号。
 * @param {any} ctx cordis 上下文。
 * @returns {Promise<any>} 仓库改动详情。
 */
async function readWorktreeRepo(repo, root, signal, ctx) {
  const detail = {
    name: repoDisplayName(root, repo),
    path: repo,
    branch: '',
    upstream: null,
    unborn: false,
    error: null,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    totals: { insertions: 0, deletions: 0 },
    filesTruncated: false,
  }

  const neutralisers = await readOnlyConfigNeutralisers(repo, signal, ctx)
  if (!neutralisers.ok) return { ...detail, error: neutralisers.message }
  const options = { signal, ctx, config: neutralisers.config }
  const [statusResult, stagedNumstat, unstagedNumstat] = await Promise.all([
    git(
      ['status', '--porcelain=v1', '-z', '--untracked-files=normal', '--ignore-submodules=all', '--no-renames', '--branch'],
      repo,
      options,
    ),
    git(['diff', '--cached', '--numstat', '-z', '--no-renames', '--ignore-submodules=all'], repo, options),
    git(['diff', '--numstat', '-z', '--no-renames', '--ignore-submodules=all'], repo, options),
  ])
  // 状态是列表的主体；行数只是补充。单个命令失败时保留已经能解析出的部分。
  if (!statusResult.ok) detail.error = statusResult.message.slice(0, 300)
  else if (!stagedNumstat.ok) detail.error = stagedNumstat.message.slice(0, 300)
  else if (!unstagedNumstat.ok) detail.error = unstagedNumstat.message.slice(0, 300)

  const parsed = statusResult.ok ? parseStatusV1Z(statusResult.stdout) : { header: '', entries: [] }
  const branch = parseBranchHeader(parsed.header)
  detail.branch = branch.branch
  detail.upstream = branch.upstream
  detail.unborn = branch.unborn

  const stagedCounts = stagedNumstat.ok ? parseNumstatZ(stagedNumstat.stdout) : new Map()
  const unstagedCounts = unstagedNumstat.ok ? parseNumstatZ(unstagedNumstat.stdout) : new Map()
  const countFor = (counts, file) => {
    const count = counts.get(file)
    if (count === undefined) return { insertions: 0, deletions: 0, binary: false }
    return { insertions: count.insertions, deletions: count.deletions, binary: count.binary }
  }

  for (const entry of parsed.entries) {
    const { x, y } = entry
    if (x === '?' && y === '?') {
      // 未跟踪目录由 git 折叠为一条 `dir/` 记录。
      detail.untracked.push({ path: entry.path, status: '?', directory: entry.path.endsWith('/') })
      continue
    }
    // --no-renames 下不会出现 R/C；UU/AA/DD 与任一侧为 U 的条目都算冲突。
    if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
      detail.conflicted.push({ path: entry.path, status: 'U' })
      continue
    }
    // 部分暂存的文件会同时出现在两组里，各自使用 X / Y 字符与对应的 numstat。
    if (x !== ' ' && x !== '?') {
      detail.staged.push({ path: entry.path, status: x, ...countFor(stagedCounts, entry.path) })
    }
    if (y !== ' ' && y !== '?') {
      detail.unstaged.push({ path: entry.path, status: y, ...countFor(unstagedCounts, entry.path) })
    }
  }

  for (const group of [detail.staged, detail.unstaged, detail.untracked, detail.conflicted]) {
    group.sort((left, right) => left.path.localeCompare(right.path))
  }
  detail.filesTruncated = capChangeEntries(detail)
  for (const group of [detail.staged, detail.unstaged]) {
    for (const entry of group) {
      if (typeof entry.insertions === 'number') detail.totals.insertions += entry.insertions
      if (typeof entry.deletions === 'number') detail.totals.deletions += entry.deletions
    }
  }
  return detail
}

/**
 * 收集工作区内所有仓库的未提交改动。
 * @param {{ root: string, maxDepth: number, signal: AbortSignal, ctx: any }} request 收集请求。
 * @returns {Promise<any>} 工作区改动响应体。
 */
async function collectWorktree(request) {
  const discovered = await discoverRepos(request.root, request.maxDepth, request.signal)
  const verified = await filterRepoRoots(discovered.repos, request.ctx, request.signal)
  const details = await boundedMap(
    verified.repos,
    (repo) => readWorktreeRepo(repo, request.root, request.signal, request.ctx),
    request.signal,
  )
  const changed = details
    .filter(
      (detail) =>
        detail.error !== null
        || detail.staged.length > 0
        || detail.unstaged.length > 0
        || detail.untracked.length > 0
        || detail.conflicted.length > 0,
    )
    .sort((left, right) => left.name.localeCompare(right.name))

  let totalFiles = 0
  for (const detail of changed) {
    totalFiles += detail.staged.length + detail.unstaged.length + detail.untracked.length + detail.conflicted.length
  }

  // 响应体按仓库粒度截断，宁可少列尾部仓库，也不把单条记录从中间切开。
  const byteBudget = WORKTREE_CACHE_BYTE_LIMIT - 16 * 1024
  const repos = []
  let bytes = 0
  let truncated = false
  for (const detail of changed) {
    const size = Buffer.byteLength(JSON.stringify(detail))
    if (bytes + size > byteBudget) {
      truncated = true
      break
    }
    bytes += size
    repos.push(detail)
  }

  return {
    root: request.root,
    scannedAt: new Date().toISOString(),
    totalRepos: details.length,
    dirtyRepos: changed.length,
    cleanRepos: details.length - changed.length,
    totalFiles,
    truncated,
    reposTruncated: discovered.truncated,
    reposSkipped: verified.skipped.length,
    repos,
  }
}

/**
 * 读取一次合并从第一个父提交之外引入的提交。
 * @param {string} repo 仓库路径。
 * @param {string} hash 合并提交哈希。
 * @param {AbortSignal} [signal] 请求取消信号。
 */
async function readIntroducedCommits(repo, hash, signal, ctx) {
  const result = await git(
    [
      'log',
      '--no-merges',
      `--pretty=format:%H%x00%h%x00%an%x00%aI%x00%cI%x00%s%x00`,
      '-n',
      String(MERGE_COMMIT_LIMIT + 1),
      '--end-of-options',
      `${hash}^1..${hash}`,
    ],
    repo,
    { signal, ctx },
  )
  if (!result.ok) return { commits: [], truncated: false }

  const commits = []
  for (const fields of splitRecords(result.stdout, 6)) {
    if (!HASH.test(fields[0])) continue
    commits.push({
      hash: fields[0].toLowerCase(),
      short: fields[1],
      author: truncate(fields[2], FIELD_LIMIT),
      date: fields[3],
      committerDate: fields[4],
      subject: truncate(fields[5], FIELD_LIMIT),
    })
  }
  const truncated = commits.length > MERGE_COMMIT_LIMIT
  commits.sort((left, right) => commitTime(right) - commitTime(left))
  if (truncated) commits.length = MERGE_COMMIT_LIMIT
  return { commits, truncated }
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

function readFailure(result, fallback) {
  const error = result.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
    ? 'resource-limit'
    : /unable to read|missing|could not fetch|not allowed|bad (?:object|tree object)/i.test(result.message)
      ? 'offline-object-missing'
      : fallback
  return jsonResponse(error === 'resource-limit' ? 413 : 404, { error, message: result.message.slice(0, 300) })
}

let activeRequests = 0
/** Shared work budget, including traversal, metadata validation and subprocesses. */
async function runRequest(request, ctx, handler) {
  if (activeRequests >= 4) return jsonResponse(429, { error: 'busy' })
  activeRequests += 1
  const control = new AbortController()
  const abort = () => control.abort()
  request.signal.addEventListener('abort', abort, { once: true })
  if (request.signal.aborted) abort()
  const deadline = setTimeout(abort, REQUEST_TIMEOUT_MS)
  try {
    control.signal.throwIfAborted()
    if (!(await supportsGit())) return jsonResponse(503, { error: 'unsupported-git-version' })
    const response = await handler(new Request(request, { signal: control.signal }), ctx)
    control.signal.throwIfAborted()
    return response
  } catch (error) {
    if (control.signal.aborted) return jsonResponse(408, { error: 'request-cancelled' })
    return jsonResponse(500, { error: 'request-failed' })
  } finally {
    clearTimeout(deadline)
    request.signal.removeEventListener('abort', abort)
    activeRequests -= 1
  }
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

  const value = await collect({ root, limit, maxDepth, allBranches, signal: request.signal, ctx })
  if (!request.signal.aborted) setBoundedCache(stateCache, cacheKey, value, STATE_CACHE_LIMIT, STATE_CACHE_BYTE_LIMIT)
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
  if (!(await isGitRepoRoot(repo, ctx, request.signal))) return jsonResponse(400, { error: 'invalid-repo', repo })
  if (!REQUEST_HASH.test(hash)) return jsonResponse(400, { error: 'invalid-hash', hash })

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
    git(metaArgs, repo, { signal: request.signal, ctx }),
    git(
      ['show', '--name-status', '-z', '--pretty=format:', '--no-renames', '-m', '--first-parent', '--end-of-options', hash],
      repo,
      { signal: request.signal, ctx },
    ),
    git(
      ['show', '--numstat', '-z', '--pretty=format:', '--no-renames', '-m', '--first-parent', '--end-of-options', hash],
      repo,
      { signal: request.signal, ctx },
    ),
  ])

  if (!metaResult.ok) {
    return readFailure(metaResult, 'commit-not-found')
  }
  if (!nameStatusResult.ok || !numstatResult.ok) {
    return readFailure(!nameStatusResult.ok ? nameStatusResult : numstatResult, 'commit-not-found')
  }

  const fields = metaResult.stdout.replace(/^[\r\n]+/, '').split(FIELD_SEP)
  const rawMessage = truncate((fields[10] ?? '').replace(/\r\n/g, '\n'), MESSAGE_LIMIT)
  const messageLines = rawMessage.split('\n')
  const subject = (messageLines[0] ?? '').trim()
  const body = messageLines.slice(1).join('\n').trim()

  const lineCounts = new Map()
  if (numstatResult.ok) {
    for (const record of numstatResult.stdout.split('\0')) {
      const match = /^(\d+|-)\t(\d+|-)\t([\s\S]+)$/.exec(record)
      if (match === null) continue
      lineCounts.set(match[3], {
        insertions: match[1] === '-' ? null : Number(match[1]),
        deletions: match[2] === '-' ? null : Number(match[2]),
      })
    }
  }

  const files = []
  if (nameStatusResult.ok) {
    const records = nameStatusResult.stdout.split('\0')
    for (let index = 0; index + 1 < records.length; index += 2) {
      const status = records[index]
      const filePath = records[index + 1]
      if (status === '' || filePath === '') continue
      const counts = lineCounts.get(filePath) ?? { insertions: 0, deletions: 0 }
      files.push({
        status,
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
  const fileCount = files.length
  let retainedBytes = 0
  let retainedCount = 0
  for (const file of files) {
    const size = Buffer.byteLength(JSON.stringify(file))
    if (retainedCount >= MAX_FILES || retainedBytes + size > FILE_LIST_BYTE_LIMIT) break
    retainedBytes += size
    retainedCount += 1
  }
  const filesTruncated = fileCount > retainedCount
  files.length = retainedCount

  const parents = (fields[8] ?? '').split(' ').filter((item) => item !== '')
  let merge = null
  if (parents.length > 1) {
    const introduced = await readIntroducedCommits(repo, hash, request.signal, ctx)
    merge = { base: parents[0], introduced: introduced.commits, truncated: introduced.truncated }
  }

  const value = {
    hash: fields[0] ?? hash,
    short: fields[1] ?? hash.slice(0, 8),
    author: { name: truncate(fields[2] ?? '', FIELD_LIMIT), email: truncate(fields[3] ?? '', FIELD_LIMIT), date: fields[4] ?? '' },
    committer: { name: truncate(fields[5] ?? '', FIELD_LIMIT), email: truncate(fields[6] ?? '', FIELD_LIMIT), date: fields[7] ?? '' },
    parents,
    merge,
    refs: truncate(fields[9] ?? '', FIELD_LIMIT),
    subject,
    body,
    files,
    filesTruncated,
    stat: { files: fileCount, insertions, deletions },
  }
  if (Buffer.byteLength(JSON.stringify(value)) > DETAIL_BYTE_LIMIT) return jsonResponse(413, { error: 'resource-limit' })
  if (!request.signal.aborted) setBoundedCache(commitCache, cacheKey, value, COMMIT_CACHE_LIMIT, COMMIT_CACHE_BYTE_LIMIT)
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
  // 同一工作区同时只允许一个 fetch；否则并发请求会成倍放大网络与进程开销。
  if (fetchLocks.has(root)) return jsonResponse(409, { error: 'fetch-in-progress', root })

  const control = new AbortController()
  const abort = () => control.abort()
  request.signal.addEventListener('abort', abort, { once: true })
  if (request.signal.aborted) abort()
  fetchLocks.set(root, control)
  const deadline = setTimeout(() => control.abort(), FETCH_TOTAL_TIMEOUT_MS)
  const started = Date.now()
  const results = []

  try {
    const signal = control.signal
    const discovered = await discoverRepos(root, 4, signal)
    const verified = await filterRepoRoots(discovered.repos, ctx, signal)
    for (const repo of verified.skipped) {
      results.push({
        name: path.relative(root, repo) || '.',
        path: repo,
        ok: false,
        message: 'not-a-repository-root',
        ms: 0,
      })
    }
    const queue = [...verified.repos]

    await Promise.all(
      Array.from({ length: Math.min(FETCH_CONCURRENCY, Math.max(queue.length, 1)) }, async () => {
        for (;;) {
          const repo = queue.shift()
          if (repo === undefined || signal.aborted) return
          const name = path.relative(root, repo) || '.'
          const begin = Date.now()
          const outcome = await git(['fetch', '--all', '--prune', '--quiet', '--no-recurse-submodules'], repo, {
            timeout: FETCH_TIMEOUT_MS,
            signal,
            network: true,
            ctx,
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
      timedOut: control.signal.aborted && !request.signal.aborted,
      reposTruncated: discovered.truncated,
      failed: results.filter((item) => !item.ok).length,
      results,
    })
  } finally {
    clearTimeout(deadline)
    request.signal.removeEventListener('abort', abort)
    if (fetchLocks.get(root) === control) fetchLocks.delete(root)
  }
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
  if (!(await isGitRepoRoot(repo, ctx, request.signal))) return jsonResponse(400, { error: 'invalid-repo', repo })
  if (!REQUEST_HASH.test(hash)) return jsonResponse(400, { error: 'invalid-hash', hash })
  const fileError = safeRelativePath(file)
  if (fileError !== null) return jsonResponse(400, { error: fileError, file })

  const result = await git(
    [
      'show',
      '--format=',
      '--no-color',
      // --no-textconv / --no-ext-diff 由 git() 对 show 统一追加。
      '-U3',
      '-m',
      '--first-parent',
      '--end-of-options',
      hash,
      '--',
      file,
    ],
    repo,
    { signal: request.signal, ctx },
  )
  if (!result.ok) {
    return readFailure(result, 'patch-not-found')
  }

  return jsonResponse(200, { file, ...parseUnifiedDiff(result.stdout) })
}

/**
 * 判断路径是否严格位于目录内部（不包含目录自身）。
 * @param {string} base 目录绝对路径。
 * @param {string} target 目标绝对路径。
 * @returns {boolean} 是否在目录内部。
 */
function isInsideDirectory(base, target) {
  const relative = path.relative(base, target)
  return (
    relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  )
}

/**
 * 为未跟踪文件本地合成 diff。
 * 不走 `git diff --no-index`：退出码 1 会被误判为失败，且符号链接/编码
 * 处理不可控。这里只读取文件内容并渲染成单 hunk。
 * @param {string} repo 仓库绝对路径。
 * @param {string} file 仓库内相对路径。
 * @returns {Response} 查询响应。
 */
function readUntrackedPreview(repo, file) {
  const target = path.join(repo, file)
  let stats
  try {
    stats = lstatSync(target)
  } catch {
    return jsonResponse(404, { error: 'patch-not-found', file })
  }
  if (stats.isSymbolicLink()) {
    return jsonResponse(200, {
      file,
      binary: false,
      truncated: false,
      additions: 0,
      deletions: 0,
      hunks: [],
      symbolicLink: true,
    })
  }
  if (!stats.isFile()) return jsonResponse(400, { error: 'invalid-file', file })
  // 拒绝通过符号链接目录逃逸到仓库之外。
  const real = canonicalPath(target)
  if (real === null || !isInsideDirectory(repo, real)) {
    return jsonResponse(404, { error: 'patch-not-found', file })
  }
  if (stats.size > UNTRACKED_READ_LIMIT) {
    return jsonResponse(200, {
      file,
      binary: false,
      truncated: true,
      additions: 0,
      deletions: 0,
      hunks: [],
      tooLarge: true,
    })
  }
  let buffer
  try {
    buffer = readFileSync(real)
  } catch {
    return jsonResponse(404, { error: 'patch-not-found', file })
  }
  if (buffer.length > UNTRACKED_READ_LIMIT) {
    return jsonResponse(200, {
      file,
      binary: false,
      truncated: true,
      additions: 0,
      deletions: 0,
      hunks: [],
      tooLarge: true,
    })
  }
  if (buffer.includes(0)) {
    return jsonResponse(200, {
      file,
      binary: true,
      truncated: false,
      additions: 0,
      deletions: 0,
      hunks: [],
    })
  }

  let text = buffer.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rawLines = text.split('\n')
  // 末尾换行是行结束符而不是额外的一行空行。
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop()
  const lines = []
  let truncated = false
  for (const rawLine of rawLines) {
    if (lines.length >= PATCH_LINE_LIMIT) {
      truncated = true
      break
    }
    // Windows 换行按文本行渲染，不把 CR 带进正文。
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    lines.push({
      type: 'add',
      text: line.length > PATCH_LINE_CHARS ? `${line.slice(0, PATCH_LINE_CHARS)}…` : line,
    })
  }
  return jsonResponse(200, {
    file,
    binary: false,
    truncated,
    additions: rawLines.length,
    deletions: 0,
    hunks: lines.length === 0 ? [] : [{ header: `@@ -0,0 +1,${rawLines.length} @@`, lines }],
  })
}

/**
 * 处理工作区改动列表请求。
 * @param {Request} request 已鉴权请求。
 * @param {any} ctx cordis 上下文。
 */
async function handleWorktree(request, ctx) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('root')
  const root = resolveWorkspaceRoot(requested)
  if (root === null) return jsonResponse(400, { error: 'invalid-root', root: requested ?? '' })
  if (!isInsideWorkspace(ctx, root)) return jsonResponse(403, { error: 'outside-workspace', root })

  const maxDepth = Math.floor(
    Math.min(Math.max(Number(url.searchParams.get('depth') ?? 4) || 4, 1), 10),
  )
  const cacheKey = `${root}|${maxDepth}`

  pruneCache(worktreeCache, WORKTREE_CACHE_TTL)
  const cached = worktreeCache.get(cacheKey)
  if (cached !== undefined) return jsonResponse(200, cached.value)

  const value = await collectWorktree({ root, maxDepth, signal: request.signal, ctx })
  if (!request.signal.aborted) {
    setBoundedCache(worktreeCache, cacheKey, value, WORKTREE_CACHE_LIMIT, WORKTREE_CACHE_BYTE_LIMIT)
  }
  return jsonResponse(200, value)
}

/**
 * 处理单文件工作区差异请求。
 * @param {Request} request 已鉴权请求。
 * @param {any} ctx cordis 上下文。
 */
async function handleWorktreeDiff(request, ctx) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('repo')
  const repo = resolveWorkspaceRoot(requested)
  const scope = url.searchParams.get('scope') ?? ''
  const file = url.searchParams.get('file') ?? ''

  if (repo === null) return jsonResponse(400, { error: 'invalid-repo', repo: requested ?? '' })
  if (!isInsideWorkspace(ctx, repo)) return jsonResponse(403, { error: 'outside-workspace', repo })
  if (scope !== 'staged' && scope !== 'unstaged' && scope !== 'untracked') {
    return jsonResponse(400, { error: 'invalid-scope', scope })
  }
  const fileError = safeRelativePath(file)
  if (fileError !== null) return jsonResponse(400, { error: fileError, file })
  if (!(await isGitRepoRoot(repo, ctx, request.signal))) {
    return jsonResponse(400, { error: 'invalid-repo', repo })
  }

  // 差异输出同样可能触发仓库本地的 filter/textconv；先中和再执行。
  const neutralisers = await readOnlyConfigNeutralisers(repo, request.signal, ctx)
  if (!neutralisers.ok) return readFailure(neutralisers, 'unsafe-config')
  if (scope === 'untracked') return readUntrackedPreview(repo, file)

  const result = await git(
    [
      'diff',
      ...(scope === 'staged' ? ['--cached'] : []),
      '-U3',
      '--no-color',
      '--no-renames',
      '--ignore-submodules=all',
      '--',
      file,
    ],
    repo,
    { signal: request.signal, ctx, config: neutralisers.config },
  )
  if (!result.ok) return readFailure(result, 'patch-not-found')
  return jsonResponse(200, { scope, file, ...parseUnifiedDiff(result.stdout) })
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
        fetch: (request) => runRequest(request, ctx, handleState),
      }),
    'git-multirepo: state route',
  )
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_COMMIT,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: (request) => runRequest(request, ctx, handleCommit),
      }),
    'git-multirepo: commit route',
  )
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_FETCH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => runRequest(request, ctx, handleFetch),
      }),
    'git-multirepo: fetch route',
  )
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_PATCH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: (request) => runRequest(request, ctx, handlePatch),
      }),
    'git-multirepo: patch route',
  )
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_WORKTREE,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: (request) => runRequest(request, ctx, handleWorktree),
      }),
    'git-multirepo: worktree route',
  )
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE_WORKTREE_DIFF,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: (request) => runRequest(request, ctx, handleWorktreeDiff),
      }),
    'git-multirepo: worktree diff route',
  )
}
