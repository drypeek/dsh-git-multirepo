import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, rmSync, chmodSync, copyFileSync, symlinkSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import vm from 'node:vm'
import { apply } from '../index.js'

const root = mkdtempSync(path.join(process.env.DSH_TEST_TMPDIR ?? tmpdir(), 'multirepo-tests-'))
// Isolate the test process from the developer's URL rewrites, SSH commands and
// credential configuration. Only the explicit local fixture commands may run.
const profile = path.join(root, 'profile'); mkdirSync(profile)
const savedEnv = new Map()
const envKeys = new Set(['HOME', 'USERPROFILE', ...Object.keys(process.env).filter((key) => /^GIT_/i.test(key))])
for (const key of envKeys) { savedEnv.set(key, process.env[key]); delete process.env[key] }
process.env.HOME = profile
process.env.USERPROFILE = profile
process.env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null'
process.env.GIT_CONFIG_NOSYSTEM = '1'
after(() => {
  for (const key of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', ...envKeys]) delete process.env[key]
  for (const [key, value] of savedEnv) if (value !== undefined) process.env[key] = value
  const relative = path.relative(path.resolve(process.env.DSH_TEST_TMPDIR ?? tmpdir()), root)
  assert.ok(relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative))
  rmSync(root, { recursive: true, force: true })
})
let next = 0
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_ALLOW_PROTOCOL: 'file', GIT_TERMINAL_PROMPT: '0' }
function g(repo, args, input) {
  return execFileSync('git', ['-c', 'core.hooksPath=', ...args], { cwd: repo, env: gitEnv, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}
function fixture(options = []) {
  const repo = path.join(root, `repo-${next++}`)
  mkdirSync(repo)
  g(repo, ['init', '-q', ...options])
  g(repo, ['config', 'user.name', 'Regression'])
  g(repo, ['config', 'user.email', 'test@example.invalid'])
  writeFileSync(path.join(repo, 'file.txt'), 'before\n')
  g(repo, ['add', '.'])
  g(repo, ['commit', '-qm', 'initial'])
  return repo
}
function host(roots) {
  const routes = new Map()
  apply({ effect: (start) => start(), workspaceRegistry: { list: () => roots.map((p) => ({ path: p })) }, connection: { fetch: { register: (route) => { routes.set(route.path, route.fetch); return () => {} } } } })
  return async (name, params, options = {}) => {
    const response = await routes.get(`/api/git-multirepo/${name}`)(new Request(`http://localhost/api/git-multirepo/${name}?${new URLSearchParams(params)}`, options))
    return { status: response.status, data: await response.json() }
  }
}
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`
function trap(repo) {
  const marker = path.join(repo, 'executed-marker')
  const script = path.join(repo, 'trap.cjs')
  writeFileSync(script, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); process.exit(1)`)
  return { marker, command: `${quote(process.execPath.replaceAll('\\', '/'))} ${quote(script.replaceAll('\\', '/'))}` }
}

test('ordinary state, untracked files, special names, literal pathspec and diff content', async () => {
  const repo = fixture()
  writeFileSync(path.join(repo, 'file.txt'), '-- before\n')
  writeFileSync(path.join(repo, '[ab].txt'), 'bracket\n')
  writeFileSync(path.join(repo, 'a.txt'), 'another\n')
  g(repo, ['add', '.']); g(repo, ['commit', '-qm', 'prefix base'])
  const base = g(repo, ['rev-parse', 'HEAD'])
  writeFileSync(path.join(repo, 'file.txt'), '++ after\n')
  g(repo, ['add', '.']); g(repo, ['commit', '-qm', 'prefix change'])
  const hash = g(repo, ['rev-parse', 'HEAD'])
  writeFileSync(path.join(repo, 'untracked.txt'), 'new')
  const call = host([repo])
  const state = await call('state', { root: repo })
  assert.equal(state.status, 200); assert.equal(state.data.repos[0].dirty, true)
  const patch = await call('patch', { repo, hash, file: 'file.txt' })
  assert.equal(patch.data.additions, 1); assert.equal(patch.data.deletions, 1)
  assert.deepEqual(patch.data.hunks[0].lines.map((line) => line.text), ['-- before', '++ after'])
  const bracket = await call('patch', { repo, hash: base, file: '[ab].txt' })
  assert.equal(bracket.data.additions, 1)
  const empty = path.join(repo, 'packages', 'empty')
  mkdirSync(empty, { recursive: true }); g(empty, ['init', '-q'])
  const nested = await call('state', { root: path.join(repo, 'packages') })
  assert.equal(nested.data.repos.length, 1)
  assert.equal(nested.data.repos[0].error, null)
  assert.equal(nested.data.total, 0)
  // A Git object can contain a POSIX path that cannot be checked out on Windows.
  const blob = g(repo, ['hash-object', '-w', '--stdin'], 'special\n')
  const tree = g(repo, ['mktree', '-z'], `100644 blob ${blob}\tline\tname.txt\0`)
  const special = g(repo, ['commit-tree', tree], 'special filename\n')
  const detail = await call('commit', { repo, hash: special })
  assert.equal(detail.data.files[0].path, 'line\tname.txt')
  const specialPatch = await call('patch', { repo, hash: special, file: detail.data.files[0].path })
  assert.equal(specialPatch.data.additions, 1)
})

test('SHA-256 history, details and patch remain usable', async () => {
  const repo = fixture(['--object-format=sha256'])
  const call = host([repo])
  const state = await call('state', { root: repo })
  assert.equal(state.data.commits.length, 1)
  const hash = state.data.commits[0].hash
  assert.equal(hash.length, 64)
  assert.equal((await call('commit', { repo, hash })).status, 200)
  assert.equal((await call('patch', { repo, hash, file: 'file.txt' })).data.additions, 1)
})

test('effective local/worktree filters, multiline values and equals names cannot execute', async () => {
  for (const mode of ['local', 'worktree', 'equals', 'multiline', 'huge-value']) {
    const repo = fixture()
    const { marker, command } = trap(repo)
    if (mode === 'worktree') g(repo, ['config', 'extensions.worktreeConfig', 'true'])
    const name = mode === 'equals' ? 'a=b' : 'trap'
    const scope = mode === 'worktree' ? ['--worktree'] : ['--local']
    g(repo, ['config', ...scope, `filter.${name}.clean`, command])
    g(repo, ['config', ...scope, `filter.${name}.required`, 'true'])
    if (mode === 'multiline') {
      g(repo, ['config', 'filter.unused.smudge', 'inert\ncore.fsmonitor=./payload'])
      const payload = path.join(repo, 'payload=')
      writeFileSync(payload, `#!/bin/sh\nprintf executed > ${quote(marker.replaceAll('\\', '/'))}\n`)
      chmodSync(payload, 0o700)
    }
    if (mode === 'huge-value') {
      // Write directly to avoid Windows command-line length limits.
      const config = path.join(repo, '.git', 'config')
      writeFileSync(config, `${readFileSync(config, 'utf8')}\n[filter "unused"]\n smudge = ${'x'.repeat(1100000)}\n`)
    }
    writeFileSync(path.join(repo, '.gitattributes'), `file.txt filter=${name}\n`)
    writeFileSync(path.join(repo, 'file.txt'), 'changed tracked content\n')
    const result = await host([repo])('state', { root: repo })
    assert.equal(result.status, 200, mode)
    assert.equal(result.data.repos[0].error, null, mode)
    assert.equal(result.data.repos[0].dirty, true, mode)
    assert.equal(existsSync(marker), false, mode)
  }
})

test('config inventory overflow fails closed without invoking filters', async () => {
  const repo = fixture(); const { marker, command } = trap(repo)
  g(repo, ['config', 'filter.trap.clean', command])
  const config = path.join(repo, '.git', 'config')
  const entries = Array.from({ length: 1800 }, (_, i) => `[filter "${'x'.repeat(100)}${i}"]\n clean = ignored\n`).join('')
  writeFileSync(config, readFileSync(config, 'utf8') + '\n' + entries)
  writeFileSync(path.join(repo, '.gitattributes'), 'file.txt filter=trap\n')
  writeFileSync(path.join(repo, 'file.txt'), 'changed\n')
  const result = await host([repo])('state', { root: repo })
  assert.match(result.data.repos[0].error, /unsafe-config/)
  assert.equal(result.data.repos[0].dirty, null)
  assert.equal(existsSync(marker), false)
})

test('submodule inspection cannot bypass filter isolation', async () => {
  const source = fixture(); const repo = fixture()
  g(repo, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', source.replaceAll('\\', '/'), 'module'])
  g(repo, ['commit', '-qam', 'add submodule'])
  const child = path.join(repo, 'module')
  const { marker, command } = trap(child)
  g(child, ['config', 'filter.trap.clean', command])
  writeFileSync(path.join(child, '.gitattributes'), 'file.txt filter=trap\n')
  writeFileSync(path.join(child, 'file.txt'), 'changed child tracked content\n')
  const result = await host([repo])('state', { root: repo })
  assert.equal(result.status, 200)
  assert.equal(result.data.repos.length, 2)
  assert.equal(result.data.repos.find((item) => item.name === 'module').dirty, true)
  assert.equal(existsSync(marker), false)
})

test('missing promisor objects cannot invoke SSH during read; explicit Fetch keeps configured transport', async () => {
  const repo = fixture(); const { marker, command } = trap(repo)
  const hash = g(repo, ['rev-parse', 'HEAD'])
  const blob = g(repo, ['rev-parse', 'HEAD:file.txt'])
  g(repo, ['config', 'remote.origin.url', 'ssh://example.invalid/not-contacted'])
  g(repo, ['config', 'remote.origin.promisor', 'true'])
  g(repo, ['config', 'extensions.partialClone', 'origin'])
  g(repo, ['config', 'core.sshCommand', command])
  g(repo, ['config', 'protocol.ssh.allow', 'always'])
  const blobPath = path.join(repo, '.git', 'objects', blob.slice(0, 2), blob.slice(2))
  chmodSync(blobPath, 0o600)
  unlinkSync(blobPath)
  const call = host([repo])
  const patch = await call('patch', { repo, hash, file: 'file.txt' })
  assert.equal(patch.status, 404)
  assert.equal(existsSync(marker), false)
  const fetched = await call('fetch', { root: repo }, { method: 'POST' })
  assert.equal(fetched.status, 200)
  assert.equal(fetched.data.failed, 1)
  assert.equal(existsSync(marker), true, 'explicit Fetch may use the configured local transport command')
})

test('external gitdir and alternates are refused; registered linked worktree is allowed', async () => {
  const outside = fixture()
  const inside = path.join(root, `pointer-${next++}`); mkdirSync(inside)
  writeFileSync(path.join(inside, '.git'), `gitdir: ${outside.replaceAll('\\', '/')}/.git\n`)
  const blocked = host([inside])
  const hash = g(outside, ['rev-parse', 'HEAD'])
  assert.equal((await blocked('commit', { repo: inside, hash })).status, 400)
  assert.equal((await blocked('fetch', { root: inside }, { method: 'POST' })).data.failed, 1)
  const linked = path.join(root, `linked-${next++}`)
  g(outside, ['worktree', 'add', '--detach', linked, 'HEAD'])
  const allowed = await host([outside, linked])('state', { root: linked })
  assert.equal(allowed.data.commits[0].hash, hash)
  writeFileSync(path.join(outside, '.git', 'objects', 'info', 'alternates'), `${path.join(inside, 'objects')}\n`)
  assert.equal((await host([outside])('commit', { repo: outside, hash })).status, 400)
})

test('local file remote Fetch still works', async () => {
  const upstream = fixture(); const repo = fixture()
  g(repo, ['remote', 'add', 'origin', upstream.replaceAll('\\', '/')])
  const result = await host([repo])('fetch', { root: repo }, { method: 'POST' })
  assert.equal(result.status, 200)
  assert.equal(result.data.failed, 0, JSON.stringify(result))
  assert.equal(g(repo, ['rev-parse', 'refs/remotes/origin/' + g(upstream, ['branch', '--show-current'])]), g(upstream, ['rev-parse', 'HEAD']))
})

test('oversized subjects are bounded and aborted requests stop before work', async () => {
  const repo = fixture()
  g(repo, ['commit', '--allow-empty', '-q', '-F', '-'], 's'.repeat(300000))
  const call = host([repo])
  const result = await call('state', { root: repo })
  assert.ok(result.data.commits[0].subject.length <= 4002)
  assert.ok(JSON.stringify(result.data).length < 20000)
  const controller = new AbortController(); controller.abort()
  assert.equal((await call('state', { root: repo }, { signal: controller.signal })).status, 408)
})

test('old Git is rejected before a repository command can interpret fsmonitor=false as a hook', async () => {
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
  for (const [version, status] of [['2.31.0', 503], ['2.35.1', 503], ['2.36.0', 400], ['2.55.0.windows.5', 400]]) {
    let calls = 0
    const sandbox = {
      execFile(_file, args, _options, callback) {
        calls += 1
        assert.equal(args.at(-1), '--version', 'version gate must not run any repository command')
        callback(null, `git version ${version}\n`, '')
      },
      accessSync: () => {},
      fsConstants: { X_OK: 1 },
      tmpdir: () => '.',
      existsSync: () => false,
      path, process: { env: { PATH: process.platform === 'win32' ? 'C:\\fake-git' : '/fake-git' }, platform: process.platform },
      Request, Response, URL, AbortController, Buffer, setTimeout, clearTimeout,
    }
    vm.runInNewContext(source + '\nglobalThis.pluginApply = apply', sandbox)
    const routes = new Map()
    sandbox.pluginApply({ effect: (start) => start(), workspaceRegistry: { list: () => [] }, connection: { fetch: { register: (route) => routes.set(route.path, route.fetch) } } })
    const response = await routes.get('/api/git-multirepo/state')(new Request('http://localhost/?root=' + encodeURIComponent(root)))
    assert.equal(response.status, status, version)
    assert.equal(calls, 1, version)
  }
})

test('detail cache enforces bytes as well as count and rejects oversized entries', () => {
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
  const sandbox = { process: { platform: process.platform, env: {} }, Buffer }
  vm.runInNewContext(source + '\nglobalThis.insert = setBoundedCache; globalThis.budget = COMMIT_CACHE_BYTE_LIMIT; globalThis.stateBudget = STATE_CACHE_BYTE_LIMIT', sandbox)
  const cache = new Map()
  for (let index = 0; index < 100; index += 1) sandbox.insert(cache, String(index), { body: 'x'.repeat(100000) }, 128, sandbox.budget)
  assert.ok(cache.size < 100, 'byte cap must evict entries before the count cap')
  const bytes = [...cache.values()].reduce((sum, entry) => sum + Buffer.byteLength(JSON.stringify(entry.value)), 0)
  assert.ok(bytes <= sandbox.budget)
  assert.ok(cache.has('99'))
  sandbox.insert(cache, 'oversized', { body: 'x'.repeat(sandbox.budget + 1) }, 128, sandbox.budget)
  assert.equal(cache.has('oversized'), false)
  const states = new Map()
  for (let index = 0; index < 8; index += 1) sandbox.insert(states, String(index), { data: 'x'.repeat(3000000) }, 8, sandbox.stateBudget)
  assert.ok(states.size < 8, 'state cache must also enforce a total byte limit')
  assert.ok([...states.values()].reduce((sum, entry) => sum + Buffer.byteLength(JSON.stringify(entry.value)), 0) <= sandbox.stateBudget)
})

test('large identity fields are bounded and file paths are omitted whole rather than rewritten', async () => {
  const repo = fixture()
  const blob = g(repo, ['hash-object', '-w', '--stdin'], 'text\n')
  const longPath = 'p'.repeat(150000) + '.txt'
  const tree = g(repo, ['mktree', '-z'], `100644 blob ${blob}\t${longPath}\0`)
  const raw = `tree ${tree}\nauthor ${'a'.repeat(20000)} <test@example.invalid> 1700000000 +0000\ncommitter Regression <test@example.invalid> 1700000000 +0000\n\nlarge fields\n`
  const hash = g(repo, ['hash-object', '-t', 'commit', '-w', '--stdin'], raw)
  const result = await host([repo])('commit', { repo, hash })
  assert.equal(result.status, 200)
  assert.ok(result.data.author.name.length <= 4002)
  assert.equal(result.data.filesTruncated, true)
  assert.equal(result.data.files.length, 0, 'do not reinterpret an oversized path as another path')
  assert.equal(result.data.stat.files, 1)
  assert.ok(Buffer.byteLength(JSON.stringify(result.data)) <= 512 * 1024)
})

test('repository-local git executable is never used', async () => {
  const repo = fixture()
  const fake = path.join(repo, process.platform === 'win32' ? 'git.exe' : 'git')
  if (process.platform === 'win32') copyFileSync(process.execPath, fake)
  else {
    writeFileSync(fake, '#!/bin/sh\nexit 42\n')
    chmodSync(fake, 0o755)
  }
  const result = await host([repo])('state', { root: repo })
  assert.equal(result.status, 200)
  assert.equal(result.data.repos[0].error, null)
  assert.equal(result.data.commits.length, 1)
})

test('filters pulled in through a local include are neutralised', async () => {
  const repo = fixture()
  const { marker, command } = trap(repo)
  const includeFile = path.join(repo, 'included.conf')
  writeFileSync(includeFile, `[filter "trap"]\n\tclean = ${command}\n\trequired = true\n`)
  g(repo, ['config', '--local', 'include.path', includeFile.replaceAll('\\', '/')])
  writeFileSync(path.join(repo, '.gitattributes'), 'file.txt filter=trap\n')
  writeFileSync(path.join(repo, 'file.txt'), 'changed\n')
  const result = await host([repo])('state', { root: repo })
  assert.equal(result.status, 200)
  assert.equal(result.data.repos[0].dirty, true)
  assert.equal(existsSync(marker), false)
})

test('trusted global filters stay active for accurate dirty state', async () => {
  const repo = fixture()
  const globalConfig = path.join(profile, '.gitconfig')
  const filterScript = path.join(profile, 'filter.cjs')
  writeFileSync(filterScript, 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>process.stdout.write(d.replace("REAL","POINTER")))\n')
  const filterCommand = `${quote(process.execPath.replaceAll('\\', '/'))} ${quote(filterScript.replaceAll('\\', '/'))}`
  writeFileSync(globalConfig, `[filter "globalF"]\n\tclean = ${filterCommand}\n\trequired = true\n`)
  writeFileSync(path.join(repo, '.gitattributes'), 'file.txt filter=globalF\n')
  writeFileSync(path.join(repo, 'file.txt'), 'REAL\n')
  const globalEnv = { ...gitEnv, GIT_CONFIG_GLOBAL: globalConfig }
  execFileSync('git', ['-c', 'core.hooksPath=', 'add', '.gitattributes', 'file.txt'], { cwd: repo, env: globalEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  execFileSync('git', ['-c', 'core.hooksPath=', 'commit', '-qm', 'filtered'], { cwd: repo, env: globalEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  const result = await host([repo])('state', { root: repo })
  assert.equal(result.status, 200)
  assert.equal(result.data.repos[0].error, null)
  assert.equal(result.data.repos[0].dirty, false, 'a clean repository using a trusted global filter stays clean')
  unlinkSync(globalConfig)
})

/** 在指定目录创建仓库 fixture（用于多仓库工作区用例）。 */
function fixtureAt(repo, options = []) {
  mkdirSync(repo)
  g(repo, ['init', '-q', ...options])
  g(repo, ['config', 'user.name', 'Regression'])
  g(repo, ['config', 'user.email', 'test@example.invalid'])
  writeFileSync(path.join(repo, 'file.txt'), 'before\n')
  g(repo, ['add', '.'])
  g(repo, ['commit', '-qm', 'initial'])
  return repo
}

test('worktree lists staged, unstaged, untracked and conflicted groups with totals and branch', async () => {
  const repo = fixture()
  const branch = g(repo, ['branch', '--show-current'])

  // 两侧修改同一文件后合并，制造 UU 冲突。
  g(repo, ['checkout', '-qb', 'side'])
  writeFileSync(path.join(repo, 'file.txt'), 'side\n')
  g(repo, ['commit', '-qam', 'side change'])
  g(repo, ['checkout', '-q', branch])
  writeFileSync(path.join(repo, 'file.txt'), 'main\n')
  g(repo, ['commit', '-qam', 'main change'])
  assert.throws(() => g(repo, ['merge', '-q', 'side']))

  // 部分暂存与未跟踪文件在合并冲突之后建立，避免被分支提交带走。
  writeFileSync(path.join(repo, 'partial.txt'), 'one\n')
  g(repo, ['add', 'partial.txt'])
  writeFileSync(path.join(repo, 'partial.txt'), 'one\ntwo\n')

  writeFileSync(path.join(repo, 'untracked.txt'), 'plain\n')
  mkdirSync(path.join(repo, 'untracked-dir'))
  writeFileSync(path.join(repo, 'untracked-dir', 'nested.txt'), 'nested\n')

  const call = host([repo])
  const result = await call('worktree', { root: repo })
  assert.equal(result.status, 200)
  assert.equal(result.data.totalRepos, 1)
  assert.equal(result.data.dirtyRepos, 1)
  assert.equal(result.data.cleanRepos, 0)
  assert.equal(result.data.totalFiles, 5)
  assert.equal(result.data.truncated, false)
  assert.equal(result.data.reposTruncated, false)
  assert.equal(result.data.reposSkipped, 0)
  const detail = result.data.repos[0]
  assert.equal(detail.error, null)
  assert.equal(detail.branch, branch)
  assert.equal(detail.upstream, null)
  assert.equal(detail.unborn, false)
  assert.deepEqual(detail.staged, [{ path: 'partial.txt', status: 'A', insertions: 1, deletions: 0, binary: false }])
  assert.deepEqual(detail.unstaged, [{ path: 'partial.txt', status: 'M', insertions: 1, deletions: 0, binary: false }])
  assert.deepEqual(detail.untracked, [
    { path: 'untracked-dir/', status: '?', directory: true },
    { path: 'untracked.txt', status: '?', directory: false },
  ])
  assert.deepEqual(detail.conflicted, [{ path: 'file.txt', status: 'U' }])
  assert.deepEqual(detail.totals, { insertions: 2, deletions: 0 })
  assert.equal(detail.filesTruncated, false)
  // 相同查询在 TTL 内命中缓存，返回同一个快照。
  assert.deepEqual((await call('worktree', { root: repo })).data, result.data)
})

test('worktree diff separates staged and unstaged content for a partially staged file', async () => {
  const repo = fixture()
  writeFileSync(path.join(repo, 'file.txt'), 'staged line\n')
  g(repo, ['add', 'file.txt'])
  writeFileSync(path.join(repo, 'file.txt'), 'staged line\nunstaged line\n')
  const call = host([repo])

  const staged = await call('worktree-diff', { repo, scope: 'staged', file: 'file.txt' })
  assert.equal(staged.status, 200)
  assert.equal(staged.data.scope, 'staged')
  assert.equal(staged.data.file, 'file.txt')
  assert.equal(staged.data.binary, false)
  assert.equal(staged.data.truncated, false)
  assert.equal(staged.data.additions, 1)
  assert.equal(staged.data.deletions, 1)
  assert.deepEqual(staged.data.hunks[0].lines.map((line) => [line.type, line.text]), [
    ['del', 'before'],
    ['add', 'staged line'],
  ])

  const unstaged = await call('worktree-diff', { repo, scope: 'unstaged', file: 'file.txt' })
  assert.equal(unstaged.status, 200)
  assert.equal(unstaged.data.additions, 1)
  assert.equal(unstaged.data.deletions, 0)
  assert.deepEqual(unstaged.data.hunks[0].lines.map((line) => [line.type, line.text]), [
    ['context', 'staged line'],
    ['add', 'unstaged line'],
  ])
})

test('untracked diff is synthesized for text, empty, binary, oversized, directory and symlink files', async () => {
  const repo = fixture()
  writeFileSync(path.join(repo, 'text.txt'), 'one\r\ntwo\r\n')
  writeFileSync(path.join(repo, 'bom.txt'), '\uFEFFone\n')
  writeFileSync(path.join(repo, 'empty.txt'), '')
  writeFileSync(path.join(repo, 'binary.dat'), Buffer.from('a\u0000b', 'utf8'))
  writeFileSync(path.join(repo, 'large.txt'), Buffer.alloc(512 * 1024 + 1, 0x61))
  mkdirSync(path.join(repo, 'adir'))
  let linkCreated = false
  try {
    symlinkSync(path.join(repo, 'file.txt'), path.join(repo, 'link.txt'), 'file')
    linkCreated = true
  } catch {
    // Windows 未开启开发者模式时可能禁止创建符号链接。
    linkCreated = false
  }
  const call = host([repo])

  const text = await call('worktree-diff', { repo, scope: 'untracked', file: 'text.txt' })
  assert.equal(text.status, 200)
  assert.equal(text.data.binary, false)
  assert.equal(text.data.additions, 2)
  assert.equal(text.data.deletions, 0)
  assert.equal(text.data.hunks.length, 1)
  assert.equal(text.data.hunks[0].header, '@@ -0,0 +1,2 @@')
  assert.deepEqual(text.data.hunks[0].lines, [
    { type: 'add', text: 'one' },
    { type: 'add', text: 'two' },
  ])

  const bom = await call('worktree-diff', { repo, scope: 'untracked', file: 'bom.txt' })
  assert.equal(bom.status, 200)
  assert.equal(bom.data.additions, 1)
  assert.equal(bom.data.hunks[0].lines[0].text, 'one')

  const empty = await call('worktree-diff', { repo, scope: 'untracked', file: 'empty.txt' })
  assert.equal(empty.status, 200)
  assert.equal(empty.data.additions, 0)
  assert.deepEqual(empty.data.hunks, [])

  const binary = await call('worktree-diff', { repo, scope: 'untracked', file: 'binary.dat' })
  assert.equal(binary.status, 200)
  assert.equal(binary.data.binary, true)
  assert.equal(binary.data.additions, 0)
  assert.deepEqual(binary.data.hunks, [])

  const large = await call('worktree-diff', { repo, scope: 'untracked', file: 'large.txt' })
  assert.equal(large.status, 200)
  assert.equal(large.data.tooLarge, true)
  assert.equal(large.data.truncated, true)
  assert.deepEqual(large.data.hunks, [])

  const directory = await call('worktree-diff', { repo, scope: 'untracked', file: 'adir' })
  assert.equal(directory.status, 400)
  assert.equal(directory.data.error, 'invalid-file')

  if (linkCreated) {
    const link = await call('worktree-diff', { repo, scope: 'untracked', file: 'link.txt' })
    assert.equal(link.status, 200)
    assert.equal(link.data.symbolicLink, true)
    assert.deepEqual(link.data.hunks, [])
  }
})

test('worktree and worktree-diff reject invalid roots, scopes, files and outside repositories', async () => {
  const repo = fixture()
  const outside = fixture()
  const plain = path.join(repo, 'plain')
  mkdirSync(plain)
  const call = host([repo])

  const missingRoot = await call('worktree', { root: path.join(root, 'missing-dir') })
  assert.equal(missingRoot.status, 400)
  assert.equal(missingRoot.data.error, 'invalid-root')
  const outsideRoot = await call('worktree', { root: outside })
  assert.equal(outsideRoot.status, 403)
  assert.equal(outsideRoot.data.error, 'outside-workspace')

  let result = await call('worktree-diff', { repo, scope: 'bad', file: 'file.txt' })
  assert.equal(result.status, 400)
  assert.equal(result.data.error, 'invalid-scope')
  result = await call('worktree-diff', { repo, scope: 'staged', file: '../x' })
  assert.equal(result.status, 400)
  assert.equal(result.data.error, 'invalid-file')
  result = await call('worktree-diff', { repo, scope: 'staged', file: path.join(repo, 'file.txt') })
  assert.equal(result.status, 400)
  assert.equal(result.data.error, 'invalid-file')
  result = await call('worktree-diff', { repo, scope: 'staged', file: 'bad\u0000name' })
  assert.equal(result.status, 400)
  assert.equal(result.data.error, 'invalid-file')
  result = await call('worktree-diff', { repo, scope: 'staged', file: 'dir/' })
  assert.equal(result.status, 400)
  assert.equal(result.data.error, 'invalid-file')
  result = await call('worktree-diff', { repo: path.join(root, 'missing-repo'), scope: 'staged', file: 'file.txt' })
  assert.equal(result.status, 400)
  assert.equal(result.data.error, 'invalid-repo')
  result = await call('worktree-diff', { repo: outside, scope: 'staged', file: 'file.txt' })
  assert.equal(result.status, 403)
  assert.equal(result.data.error, 'outside-workspace')
  result = await call('worktree-diff', { repo: plain, scope: 'staged', file: 'file.txt' })
  assert.equal(result.status, 400)
  assert.equal(result.data.error, 'invalid-repo')
  result = await call('worktree-diff', { repo, scope: 'untracked', file: 'missing.txt' })
  assert.equal(result.status, 404)
  assert.equal(result.data.error, 'patch-not-found')
  // depth 会被钳制，不影响响应状态。
  assert.equal((await call('worktree', { root: repo, depth: '99' })).status, 200)
})

test('worktree listing and diffs never execute local filter or textconv drivers', async () => {
  const repo = fixture()
  const { marker, command } = trap(repo)
  writeFileSync(path.join(repo, '.gitattributes'), 'file.txt filter=trap diff=trap\n')
  g(repo, ['add', '.gitattributes'])
  g(repo, ['commit', '-qm', 'attributes'])
  g(repo, ['config', '--local', 'filter.trap.clean', command])
  g(repo, ['config', '--local', 'filter.trap.required', 'true'])
  g(repo, ['config', '--local', 'diff.trap.textconv', command])
  writeFileSync(path.join(repo, 'file.txt'), 'changed tracked content\n')
  writeFileSync(path.join(repo, 'new-staged.txt'), 'staged\n')
  g(repo, ['add', 'new-staged.txt'])

  const call = host([repo])
  const listing = await call('worktree', { root: repo })
  assert.equal(listing.status, 200)
  assert.ok(listing.data.repos.length >= 1)
  const detail = listing.data.repos[0]
  assert.equal(detail.error, null)
  assert.ok(detail.unstaged.some((entry) => entry.path === 'file.txt'))

  const unstaged = await call('worktree-diff', { repo, scope: 'unstaged', file: 'file.txt' })
  assert.equal(unstaged.status, 200)
  assert.equal(unstaged.data.binary, false)
  assert.ok(unstaged.data.additions >= 1)
  const staged = await call('worktree-diff', { repo, scope: 'staged', file: 'new-staged.txt' })
  assert.equal(staged.status, 200)
  assert.equal(staged.data.additions, 1)
  assert.equal(existsSync(marker), false, 'no local driver may execute')
})

test('worktree ignores submodule content changes in the parent but scans the submodule repository', async () => {
  const source = fixture()
  const repo = fixture()
  g(repo, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', source.replaceAll('\\', '/'), 'module'])
  g(repo, ['commit', '-qam', 'add submodule'])
  const child = path.join(repo, 'module')
  writeFileSync(path.join(child, 'file.txt'), 'changed child tracked content\n')
  const result = await host([repo])('worktree', { root: repo })
  assert.equal(result.status, 200)
  const module = result.data.repos.find((item) => item.name === 'module')
  assert.ok(module, JSON.stringify(result.data))
  assert.equal(module.error, null)
  assert.equal(module.unstaged.length, 1)
  assert.equal(module.unstaged[0].path, 'file.txt')
  assert.equal(result.data.repos.length, 1, 'parent stays clean when only submodule content changed')
})

test('worktree lists and diffs staged files in an unborn HEAD repository', async () => {
  const repo = path.join(root, `repo-${next++}`)
  mkdirSync(repo)
  g(repo, ['init', '-q'])
  g(repo, ['config', 'user.name', 'Regression'])
  g(repo, ['config', 'user.email', 'test@example.invalid'])
  writeFileSync(path.join(repo, 'file.txt'), 'hello\n')
  g(repo, ['add', 'file.txt'])
  const branch = g(repo, ['branch', '--show-current'])
  const call = host([repo])

  const listing = await call('worktree', { root: repo })
  assert.equal(listing.status, 200)
  const detail = listing.data.repos[0]
  assert.equal(detail.error, null)
  assert.equal(detail.unborn, true)
  assert.equal(detail.branch, branch)
  assert.deepEqual(detail.staged, [{ path: 'file.txt', status: 'A', insertions: 1, deletions: 0, binary: false }])
  assert.deepEqual(detail.totals, { insertions: 1, deletions: 0 })

  const diff = await call('worktree-diff', { repo, scope: 'staged', file: 'file.txt' })
  assert.equal(diff.status, 200)
  assert.equal(diff.data.additions, 1)
  assert.equal(diff.data.deletions, 0)
  assert.match(diff.data.hunks[0].header, /^@@ -0,0 \+1(?:,1)? @@$/)
  assert.deepEqual(diff.data.hunks[0].lines, [{ type: 'add', text: 'hello' }])
})

test('unreadable repository configuration is reported per repository without failing the listing', async () => {
  const container = path.join(root, `container-${next++}`)
  mkdirSync(container)
  const good = fixtureAt(path.join(container, 'good'))
  const bad = fixtureAt(path.join(container, 'bad'))
  writeFileSync(path.join(good, 'file.txt'), 'good change\n')
  writeFileSync(path.join(bad, 'file.txt'), 'bad change\n')
  const config = path.join(bad, '.git', 'config')
  const entries = Array.from({ length: 700 }, (_, index) => `[filter "${'x'.repeat(20)}${index}"]\n clean = ignored\n`).join('')
  writeFileSync(config, readFileSync(config, 'utf8') + '\n' + entries)

  const result = await host([container])('worktree', { root: container })
  assert.equal(result.status, 200)
  assert.equal(result.data.totalRepos, 2)
  assert.equal(result.data.dirtyRepos, 2)
  assert.deepEqual(result.data.repos.map((item) => item.name), ['bad', 'good'])
  const badDetail = result.data.repos.find((item) => item.name === 'bad')
  assert.match(badDetail.error, /unsafe-config/)
  assert.equal(badDetail.staged.length + badDetail.unstaged.length + badDetail.untracked.length + badDetail.conflicted.length, 0)
  const goodDetail = result.data.repos.find((item) => item.name === 'good')
  assert.equal(goodDetail.error, null)
  assert.equal(goodDetail.unstaged.length, 1)
  assert.equal(goodDetail.unstaged[0].path, 'file.txt')
})

test('worktree handles spaces, unicode and bracket filenames with literal pathspec diffs', async () => {
  const repo = fixture()
  const names = ['a b.txt', '中文 文件.txt', '[ab].txt']
  for (const name of names) writeFileSync(path.join(repo, name), 'x\n')
  g(repo, ['add', '.'])
  const call = host([repo])

  const listing = await call('worktree', { root: repo })
  assert.equal(listing.status, 200)
  const detail = listing.data.repos[0]
  assert.deepEqual(detail.staged.map((entry) => entry.path).sort(), names.slice().sort())
  for (const name of names) {
    const diff = await call('worktree-diff', { repo, scope: 'staged', file: name })
    assert.equal(diff.status, 200, name)
    assert.equal(diff.data.file, name)
    assert.equal(diff.data.additions, 1, name)
    assert.deepEqual(diff.data.hunks[0].lines, [{ type: 'add', text: 'x' }])
  }
})

test('workspace roots using Windows 8.3 short paths resolve like Git long paths', async () => {
  if (process.platform !== 'win32') return
  const longContainer = path.join(root, 'short-path-alias-container')
  mkdirSync(longContainer)
  // 只有启用了 8.3 别名的卷才能构造出短路径；没有别名时跳过该回归。
  let shortContainer = ''
  try {
    const script = `(New-Object -ComObject Scripting.FileSystemObject).GetFolder(${JSON.stringify(longContainer)}).ShortPath`
    const probe = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim()
    if (probe !== '' && !probe.startsWith('"') && probe.toLowerCase() !== longContainer.toLowerCase()) {
      shortContainer = probe
    }
  } catch {
    shortContainer = ''
  }
  if (shortContainer === '') return

  const repo = fixtureAt(path.join(shortContainer, 'repo'))
  const call = host([shortContainer])
  const state = await call('state', { root: shortContainer })
  assert.equal(state.status, 200)
  assert.equal(state.data.repos.length, 1, 'short workspace root must still discover the repository')
  assert.equal(state.data.repos[0].path, realpathSync.native(repo))
  assert.equal(state.data.commits.length, 1)
  const listing = await call('worktree', { root: shortContainer })
  assert.equal(listing.status, 200)
  assert.equal(listing.data.repos.length, 0, 'a clean repository has no working-tree changes')
})
