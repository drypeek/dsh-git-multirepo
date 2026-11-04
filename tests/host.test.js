import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, rmSync, chmodSync, copyFileSync } from 'node:fs'
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
  const filterCommand = `${process.execPath.replaceAll('\\', '/')} ${filterScript.replaceAll('\\', '/')}`
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
