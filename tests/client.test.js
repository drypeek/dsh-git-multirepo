import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

const VIEW_MODE_STORAGE_KEY = 'dsh-git-multirepo:view-mode:v1'
const TAB_PARAMS_STORAGE_KEY = 'dsh-git-multirepo:tab-params:v1'

function sameDeps(left, right) {
  if (left === undefined || right === undefined) return false
  if (left.length !== right.length) return false
  return left.every((value, index) => Object.is(value, right[index]))
}

class HookRenderer {
  constructor(component, props) {
    this.component = component
    this.props = props
    this.hooks = []
    this.hookIndex = 0
    this.pendingEffects = []
    this.needsRender = false
    this.tree = null
  }

  useState(initial) {
    const index = this.hookIndex++
    if (!(index in this.hooks)) this.hooks[index] = typeof initial === 'function' ? initial() : initial
    const setState = (value) => {
      const next = typeof value === 'function' ? value(this.hooks[index]) : value
      if (Object.is(next, this.hooks[index])) return
      this.hooks[index] = next
      this.needsRender = true
    }
    return [this.hooks[index], setState]
  }

  useRef(initial) {
    const index = this.hookIndex++
    if (!(index in this.hooks)) this.hooks[index] = { current: initial }
    return this.hooks[index]
  }

  useMemo(factory, deps) {
    const index = this.hookIndex++
    const previous = this.hooks[index]
    if (previous !== undefined && sameDeps(previous.deps, deps)) return previous.value
    const value = factory()
    this.hooks[index] = { deps, value }
    return value
  }

  useCallback(callback, deps) {
    return this.useMemo(() => callback, deps)
  }

  useEffect(effect, deps) {
    const index = this.hookIndex++
    const previous = this.hooks[index]
    const changed = previous === undefined || !sameDeps(previous.deps, deps)
    this.hooks[index] = { deps, cleanup: previous?.cleanup }
    if (changed) this.pendingEffects.push({ index, effect })
  }

  render() {
    this.hookIndex = 0
    this.pendingEffects = []
    HookRenderer.current = this
    this.tree = this.component(this.props)
    HookRenderer.current = null
    for (const { index, effect } of this.pendingEffects) {
      const previous = this.hooks[index]
      previous.cleanup?.()
      previous.cleanup = effect()
    }
    return this.tree
  }

  async flush() {
    for (let index = 0; index < 20; index += 1) {
      await Promise.resolve()
      await Promise.resolve()
      if (!this.needsRender) continue
      this.needsRender = false
      this.render()
    }
    assert.equal(this.needsRender, false, 'hook renderer did not settle')
    return this.tree
  }

  unmount() {
    for (const hook of this.hooks) hook?.cleanup?.()
  }
}

function fakeReact() {
  const React = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false) }
    },
    useState(initial) {
      return HookRenderer.current.useState(initial)
    },
    useRef(initial) {
      return HookRenderer.current.useRef(initial)
    },
    useMemo(factory, deps) {
      return HookRenderer.current.useMemo(factory, deps)
    },
    useCallback(callback, deps) {
      return HookRenderer.current.useCallback(callback, deps)
    },
    useEffect(effect, deps) {
      return HookRenderer.current.useEffect(effect, deps)
    },
  }
  return React
}

function textContent(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return (node.children ?? []).map(textContent).join('')
}

function findAll(node, predicate, result = []) {
  if (node === null || node === undefined || typeof node === 'string' || typeof node === 'number') return result
  if (predicate(node)) result.push(node)
  for (const child of node.children ?? []) findAll(child, predicate, result)
  return result
}

function findOne(node, predicate) {
  return findAll(node, predicate)[0]
}

function response(value, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

function stateValue(root, subject, hash, repoOverrides = {}) {
  return {
    root,
    scannedAt: new Date().toISOString(),
    repos: [{ name: 'repo', path: `${root}/repo`, branch: 'main', dirty: false, upstream: null, error: null, ...repoOverrides }],
    commits: [{
      repo: 'repo',
      hash,
      short: hash.slice(0, 8),
      author: 'Tester',
      date: '2026-01-01T00:00:00Z',
      subject,
      refs: 'HEAD -> main',
      source: '',
      committerDate: '2026-01-01T00:00:00Z',
      parentCount: 1,
      remoteOnly: false,
    }],
    total: 1,
    truncated: false,
    reposTruncated: false,
    reposSkipped: 0,
  }
}

function detailValue(hash, subject = 'DETAIL') {
  return {
    hash,
    short: hash.slice(0, 8),
    author: { name: 'Tester', email: 'test@example.invalid', date: '2026-01-01T00:00:00Z' },
    committer: { name: 'Tester', email: 'test@example.invalid', date: '2026-01-01T00:00:00Z' },
    parents: [],
    merge: null,
    refs: '',
    subject,
    body: '',
    files: [],
    filesTruncated: false,
    stat: { files: 0, insertions: 0, deletions: 0 },
  }
}

function loadClient(fetchImpl, localStorage = new Map(), options = {}) {
  const React = fakeReact()
  const registrations = new Map()
  const openedTabs = []
  const dictionaries = new Map()
  const rules = []
  const injected = []
  const logs = { warn: [], error: [] }
  const testConsole = {
    log: (...args) => console.log(...args),
    warn: (...args) => logs.warn.push(args.map((value) => String(value)).join(' ')),
    error: (...args) => logs.error.push(args.map((value) => String(value)).join(' ')),
  }
  /** uiConversation 服务桩：正常路径由 ctx.get 取得，延迟路径由 ctx.inject 回调取得。 */
  const uiConversation = {
    userText: {
      register: (rule) => {
        rules.push(rule)
        return () => {}
      },
    },
  }
  const storage = {
    getItem(key) {
      return localStorage.has(key) ? localStorage.get(key) : null
    },
    setItem(key, value) {
      localStorage.set(key, String(value))
    },
  }
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(module) {
          const loaded = module.factory((name) => {
            if (name === 'react') return React
            throw new Error(`unexpected module: ${name}`)
          })
          sandbox.client = loaded
        },
      },
    },
    console: testConsole,
    fetch: fetchImpl,
    localStorage: storage,
    Response,
    URL,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    getComputedStyle: () => ({ overflowY: 'visible' }),
  }
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })
  const translate = (key) => key
  const ctx = {
    get(name) {
      return ctx[name]
    },
    inject(deps, callback) {
      injected.push({ deps, callback })
      return () => {}
    },
    effect(start) {
      return start()
    },
    locale: {
      bind: () => translate,
      register: (namespace, value) => {
        dictionaries.set(namespace, value)
        return undefined
      },
    },
    sidebarRightTabs: { register: () => undefined },
    sidebarRight: {
      openTab: (kind, payload) => {
        openedTabs.push({ kind, payload })
      },
    },
    slots: {
      inject(_name, start) {
        return start()
      },
      register(meta, component) {
        registrations.set(meta.name, component)
        return undefined
      },
    },
  }
  if (options.uiConversation !== 'deferred') ctx.uiConversation = uiConversation
  sandbox.client.apply(ctx)
  return {
    view: registrations.get('conversation.view'),
    title: registrations.get('sidebar.right.pane.tab.title'),
    diff: registrations.get('sidebar.right.pane.tab'),
    storage,
    openedTabs,
    dictionaries,
    rules,
    injected,
    logs,
    uiConversation,
    registrations,
  }
}

function deferredRequest(requests, kind, root) {
  const request = requests.find((entry) => entry.kind === kind && entry.root === root && !entry.settled)
  assert.ok(request, `missing ${kind} request for ${root}`)
  return request
}

function requestFetch(requests) {
  return (url, options = {}) => {
    const parsed = new URL(url, 'http://localhost')
    const pathname = parsed.pathname
    const kind = pathname.endsWith('/state')
      ? 'state'
      : pathname.endsWith('/commit')
        ? 'commit'
        : pathname.endsWith('/fetch')
          ? 'fetch'
          : pathname.endsWith('/worktree-diff')
            ? 'worktree-diff'
            : pathname.endsWith('/worktree')
              ? 'worktree'
              : 'other'
    const root = parsed.searchParams.get('root') ?? parsed.searchParams.get('repo') ?? ''
    const request = { kind, root, options, url: parsed, settled: false }
    requests.push(request)
    return new Promise((resolve, reject) => {
      request.resolve = (value) => {
        request.settled = true
        resolve(response(value))
      }
      request.respond = (value, status = 200) => {
        request.settled = true
        resolve(response(value, status))
      }
      request.reject = (error) => {
        request.settled = true
        reject(error)
      }
    })
  }
}

function viewProps(renderer) {
  return {
    sessionId: 'session',
    useSessions: (select) => select({ byId: { session: { cwd: renderer.cwd } } }),
  }
}

function clickMode(renderer, mode) {
  const button = findOne(renderer.tree, (node) => node.type === 'button' && node.props?.['data-gm-mode'] === mode)
  assert.ok(button, `missing ${mode} mode button`)
  button.props.onClick()
  return button
}

/** 构造一个符合 host /worktree 契约的仓库条目。 */
function worktreeRepo(root, overrides = {}) {
  return {
    name: 'repo',
    path: `${root}/repo`,
    branch: 'main',
    upstream: null,
    unborn: false,
    error: null,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    totals: { insertions: 0, deletions: 0 },
    filesTruncated: false,
    ...overrides,
  }
}

/** 构造一个符合 host /worktree 契约的工作区改动响应。 */
function worktreeValue(root, repos) {
  const scopes = ['conflicted', 'staged', 'unstaged', 'untracked']
  const fileCount = (repo) =>
    scopes.reduce((sum, scope) => sum + (Array.isArray(repo[scope]) ? repo[scope].length : 0), 0)
  let totalFiles = 0
  let dirtyRepos = 0
  let cleanRepos = 0
  for (const repo of repos) {
    const files = fileCount(repo)
    totalFiles += files
    if (typeof repo.error === 'string' && repo.error !== '') continue
    if (files > 0) dirtyRepos += 1
    else cleanRepos += 1
  }
  return {
    root,
    scannedAt: '2026-01-01T00:00:00Z',
    totalRepos: repos.length,
    dirtyRepos,
    cleanRepos,
    totalFiles,
    truncated: false,
    reposTruncated: false,
    reposSkipped: 0,
    repos,
  }
}

test('workspace changes drop old state and late detail responses', async () => {
  const requests = []
  const client = loadClient(requestFetch(requests))
  const hashA = 'a'.repeat(40)
  const hashB = 'b'.repeat(40)
  const renderer = new HookRenderer(client.view, null)
  renderer.cwd = 'C:/workspace-a'
  renderer.props = viewProps(renderer)
  renderer.render()
  deferredRequest(requests, 'state', renderer.cwd).resolve(stateValue(renderer.cwd, 'OLD', hashA))
  await renderer.flush()
  assert.match(textContent(renderer.tree), /OLD/)

  renderer.cwd = 'C:/workspace-b'
  renderer.props = viewProps(renderer)
  renderer.render()
  assert.doesNotMatch(textContent(renderer.tree), /OLD/)
  deferredRequest(requests, 'state', renderer.cwd).resolve(stateValue(renderer.cwd, 'NEW', hashB))
  await renderer.flush()
  assert.match(textContent(renderer.tree), /NEW/)

  const row = findOne(renderer.tree, (node) => node.props?.['data-gm-head'] === 'true')
  assert.ok(row, 'HEAD row should be marked for direct navigation')
  row.props.onClick()
  await renderer.flush()
  const detail = deferredRequest(requests, 'commit', `${renderer.cwd}/repo`)
  renderer.cwd = 'C:/workspace-c'
  renderer.props = viewProps(renderer)
  renderer.render()
  detail.resolve(detailValue(hashB, 'STALE DETAIL'))
  await renderer.flush()
  assert.doesNotMatch(textContent(renderer.tree), /STALE DETAIL/)
  renderer.unmount()
})

test('late Fetch completion cannot finish a newer Fetch', async () => {
  const requests = []
  const client = loadClient(requestFetch(requests))
  const renderer = new HookRenderer(client.view, null)
  renderer.cwd = 'C:/workspace-b'
  renderer.props = viewProps(renderer)
  renderer.render()
  deferredRequest(requests, 'state', renderer.cwd).resolve(stateValue(renderer.cwd, 'CURRENT', 'c'.repeat(40)))
  await renderer.flush()

  const fetchButton = findOne(renderer.tree, (node) => node.type === 'button' && node.props?.title?.startsWith('action.fetchHint'))
  assert.ok(fetchButton)
  fetchButton.props.onClick()
  await renderer.flush()
  const confirm = findOne(renderer.tree, (node) => node.type === 'button' && textContent(node) === 'fetch.confirmYes')
  assert.ok(confirm)
  confirm.props.onClick()
  await renderer.flush()
  const oldFetch = deferredRequest(requests, 'fetch', renderer.cwd)

  const allBranches = findOne(renderer.tree, (node) => node.type === 'button' && node.props?.title === 'branch.allHint')
  allBranches.props.onClick()
  await renderer.flush()
  assert.equal(oldFetch.options.signal.aborted, false, 'changing branch view must not cancel a workspace Fetch')
  deferredRequest(requests, 'state', renderer.cwd).resolve(stateValue(renderer.cwd, 'ALL BRANCHES', 'c'.repeat(40)))
  await renderer.flush()

  renderer.cwd = 'C:/workspace-c'
  renderer.props = viewProps(renderer)
  renderer.render()
  deferredRequest(requests, 'state', renderer.cwd).resolve(stateValue(renderer.cwd, 'NEXT', 'd'.repeat(40)))
  await renderer.flush()
  const nextFetchButton = findOne(renderer.tree, (node) => node.type === 'button' && node.props?.title?.startsWith('action.fetchHint'))
  nextFetchButton.props.onClick()
  await renderer.flush()
  const nextConfirm = findOne(renderer.tree, (node) => node.type === 'button' && textContent(node) === 'fetch.confirmYes')
  nextConfirm.props.onClick()
  await renderer.flush()
  const newFetch = deferredRequest(requests, 'fetch', renderer.cwd)
  oldFetch.resolve({ failed: 0, results: [] })
  await renderer.flush()
  const activeFetchButton = findOne(renderer.tree, (node) => node.type === 'button' && node.props?.title?.startsWith('action.fetchHint'))
  assert.equal(activeFetchButton.props.disabled, true, 'old finally must not end the new Fetch')
  newFetch.resolve({ failed: 0, results: [] })
  await renderer.flush()
  renderer.unmount()
})

test('restored diff tab title and body recover absent or empty navigation parameters', async () => {
  const storage = new Map([[
    'dsh-git-multirepo:tab-params:v1',
    JSON.stringify({ tab1: { repo: 'C:/workspace/repo', hash: 'a'.repeat(40), file: 'src/restored.js' } }),
  ]])
  for (const navigation of [{}, { params: {} }]) {
    const requests = []
    const client = loadClient(requestFetch(requests), storage)
    const props = { useTabInfo: () => ({ tab: { contentId: 'tab1', navigation } }) }
    assert.equal(textContent(client.title(props)), 'restored.js')
    const renderer = new HookRenderer(client.diff, props)
    renderer.render()
    const patch = deferredRequest(requests, 'other', 'C:/workspace/repo')
    patch.resolve({ file: 'src/restored.js', additions: 0, deletions: 0, hunks: [], binary: false })
    await renderer.flush()
    assert.match(textContent(renderer.tree), /src\/restored.js/)
    assert.doesNotMatch(textContent(renderer.tree), /diff.missingParams/)
    renderer.unmount()
  }
})

test('Go to HEAD selects the actual detached HEAD row before the local section', async () => {
  const requests = []
  const client = loadClient(requestFetch(requests))
  const renderer = new HookRenderer(client.view, null)
  renderer.cwd = 'C:/head-workspace'
  renderer.props = viewProps(renderer)
  renderer.render()
  const value = stateValue(renderer.cwd, 'DETACHED', 'e'.repeat(40))
  value.commits[0].refs = 'HEAD'
  deferredRequest(requests, 'state', renderer.cwd).resolve(value)
  await renderer.flush()
  assert.ok(findOne(renderer.tree, (node) => node.props?.['data-gm-head'] === 'true'))
  const list = findOne(renderer.tree, (node) => node.props?.className === 'gm-list')
  const selectors = []
  let scrolled = false
  list.props.ref.current = { querySelector(selector) {
    selectors.push(selector)
    assert.equal(selector, '[data-gm-head="true"]')
    return { scrollIntoView(options) { assert.equal(options.block, 'start'); scrolled = true } }
  } }
  const button = findOne(renderer.tree, (node) => node.type === 'button' && node.props.title === 'action.gotoHead')
  button.props.onClick()
  assert.equal(scrolled, true)
  assert.equal(selectors.length, 1)
  renderer.unmount()
})

test('repository status errors do not render as all clean', async () => {
  const requests = []
  const client = loadClient(requestFetch(requests))
  const renderer = new HookRenderer(client.view, null)
  renderer.cwd = 'C:/workspace-failed'
  renderer.props = viewProps(renderer)
  renderer.render()
  deferredRequest(requests, 'state', renderer.cwd).resolve(
    stateValue(renderer.cwd, 'FAILED', 'e'.repeat(40), { dirty: null, error: 'status failed' }),
  )
  await renderer.flush()
  assert.match(textContent(renderer.tree), /summary\.unknown/)
  assert.doesNotMatch(textContent(renderer.tree), /summary\.clean/)
  renderer.unmount()
})

test('git log view hides the conversation composer while mounted', async () => {
  const requests = []
  const client = loadClient(requestFetch(requests))
  const renderer = new HookRenderer(client.view, null)
  renderer.cwd = 'C:/workspace-composer'
  renderer.props = viewProps(renderer)
  renderer.render()
  deferredRequest(requests, 'state', renderer.cwd).resolve(stateValue(renderer.cwd, 'ONE', 'f'.repeat(40)))
  await renderer.flush()
  const style = findOne(renderer.tree, (node) => node.type === 'style')
  assert.ok(style, 'the view should ship its stylesheet')
  assert.match(textContent(style), /\[data-composer-seat\]\{display:none/)
  renderer.unmount()
})

test('truncated state is surfaced in the header', async () => {
  const requests = []
  const client = loadClient(requestFetch(requests))
  const renderer = new HookRenderer(client.view, null)
  renderer.cwd = 'C:/workspace-truncated'
  renderer.props = viewProps(renderer)
  renderer.render()
  const value = stateValue(renderer.cwd, 'ONE', 'f'.repeat(40))
  value.truncated = true
  deferredRequest(requests, 'state', renderer.cwd).resolve(value)
  await renderer.flush()
  assert.match(textContent(renderer.tree), /state\.truncated/)
  renderer.unmount()
})

test('workspace changes mode loads worktree data and renders grouped files', async () => {
  const requests = []
  const client = loadClient(requestFetch(requests))
  const renderer = new HookRenderer(client.view, null)
  const cwd = 'C:/workspace-changes'
  renderer.cwd = cwd
  renderer.props = viewProps(renderer)
  renderer.render()
  deferredRequest(requests, 'state', cwd).resolve(stateValue(cwd, 'ONE', 'a'.repeat(40), { dirty: true }))
  await renderer.flush()

  const dirtyLink = findOne(renderer.tree, (node) => node.props?.['data-gm-dirty-link'] === 'true')
  assert.ok(dirtyLink, 'history summary should link dirty repositories to changes mode')
  dirtyLink.props.onClick()
  await renderer.flush()

  const worktree = deferredRequest(requests, 'worktree', cwd)
  assert.equal(worktree.url.pathname, '/api/git-multirepo/worktree')
  assert.equal(worktree.url.searchParams.get('root'), cwd)
  assert.equal(client.storage.getItem(VIEW_MODE_STORAGE_KEY), 'changes')

  worktree.resolve(worktreeValue(cwd, [worktreeRepo(cwd, {
    upstream: { ahead: 2, behind: 1 },
    staged: [{ path: 'src/staged.js', status: 'M', insertions: 3, deletions: 1, binary: false }],
    unstaged: [{ path: 'src/live.js', status: 'M', insertions: 5, deletions: 2, binary: false }],
    untracked: [{ path: 'docs/new.md', status: '?', directory: false }],
    conflicted: [{ path: 'src/conflict.js', status: 'U' }],
    totals: { insertions: 8, deletions: 3 },
  })]))
  await renderer.flush()

  const root = findOne(renderer.tree, (node) => node.props?.className === 'gm-root')
  assert.ok(root)
  assert.equal(root.props['data-gm-mode'], 'changes')
  assert.equal(root.props['data-gm-status'], 'ready')
  assert.ok(findOne(renderer.tree, (node) => node.props?.['data-gm-wt-repo'] === 'repo'))

  const text = textContent(renderer.tree)
  const groupOrder = ['changes.conflicted', 'changes.staged', 'changes.unstaged', 'changes.untracked']
    .map((key) => text.indexOf(key))
  assert.ok(groupOrder.every((index) => index >= 0), 'all four change groups should render')
  assert.deepEqual(
    [...groupOrder].sort((left, right) => left - right),
    groupOrder,
    'groups should render conflicts, staged, unstaged, then untracked',
  )
  assert.match(text, /↑2/)
  assert.match(text, /↓1/)
  assert.match(text, /changes\.summary/)
  assert.match(text, /changes\.repoSummary/)

  const badge = findOne(renderer.tree, (node) => node.props?.className === 'gm-mode-badge')
  assert.ok(badge, 'changes mode should show a changed-file badge')
  assert.equal(textContent(badge), '4')

  const search = findOne(renderer.tree, (node) => node.type === 'input')
  assert.equal(search.props.placeholder, 'changes.filterPlaceholder')

  assert.equal(
    findOne(renderer.tree, (node) => node.type === 'button' && node.props?.title?.startsWith('action.fetchHint')),
    undefined,
    'history-only fetch tool should be hidden in changes mode',
  )
  renderer.unmount()
})

test('workspace changes request failures surface an error status', async () => {
  const requests = []
  const client = loadClient(requestFetch(requests))
  const renderer = new HookRenderer(client.view, null)
  const cwd = 'C:/workspace-changes-error'
  renderer.cwd = cwd
  renderer.props = viewProps(renderer)
  renderer.render()
  clickMode(renderer, 'changes')
  await renderer.flush()

  deferredRequest(requests, 'worktree', cwd).respond({ error: 'request-failed' }, 500)
  await renderer.flush()

  assert.match(textContent(renderer.tree), /changes\.error/)
  const root = findOne(renderer.tree, (node) => node.props?.className === 'gm-root')
  assert.equal(root.props['data-gm-status'], 'error')
  renderer.unmount()
})

test('workspace change rows open scoped diffs and disable unsupported rows', async () => {
  const requests = []
  const client = loadClient(requestFetch(requests))
  const renderer = new HookRenderer(client.view, null)
  const cwd = 'C:/workspace-change-rows'
  renderer.cwd = cwd
  renderer.props = viewProps(renderer)
  renderer.render()
  clickMode(renderer, 'changes')
  await renderer.flush()

  deferredRequest(requests, 'worktree', cwd).resolve(worktreeValue(cwd, [worktreeRepo(cwd, {
    unstaged: [{ path: 'src/live.js', status: 'M', insertions: 5, deletions: 2, binary: false }],
    untracked: [{ path: 'docs/', status: '?', directory: true }],
    conflicted: [{ path: 'src/conflict.js', status: 'U' }],
  })]))
  await renderer.flush()

  const row = findOne(
    renderer.tree,
    (node) => node.props?.['data-gm-wt-file'] === 'src/live.js' && node.props?.['data-gm-wt-scope'] === 'unstaged',
  )
  assert.ok(row, 'unstaged file row should render')
  assert.equal(row.props.role, 'button')
  row.props.onClick()
  const opened = client.openedTabs[client.openedTabs.length - 1]
  assert.equal(opened.kind, 'git-diff')
  assert.equal(opened.payload.params.repo, `${cwd}/repo`)
  assert.equal(opened.payload.params.scope, 'unstaged')
  assert.equal(opened.payload.params.file, 'src/live.js')
  assert.deepEqual(Object.keys(opened.payload.params).sort(), ['file', 'repo', 'scope'])
  row.props.onKeyDown({ key: 'Enter', preventDefault: () => undefined })
  assert.equal(client.openedTabs.length, 2, 'file rows should also open with the keyboard')

  const conflict = findOne(
    renderer.tree,
    (node) => node.props?.['data-gm-wt-file'] === 'src/conflict.js' && node.props?.['data-gm-wt-scope'] === 'conflicted',
  )
  assert.ok(conflict)
  assert.equal(conflict.props['aria-disabled'], true)
  assert.equal(conflict.props.onClick, undefined)

  const directory = findOne(renderer.tree, (node) => node.props?.['data-gm-wt-file'] === 'docs/')
  assert.ok(directory)
  assert.equal(directory.props['aria-disabled'], true)
  assert.equal(directory.props.onClick, undefined)
  assert.equal(directory.props.title, 'changes.directory')
  renderer.unmount()
})

test('restored worktree diff tabs use the worktree diff route and scope badge', async () => {
  for (const scenario of [
    { scope: 'unstaged', deletions: 2, expectDeletions: true },
    { scope: 'untracked', deletions: 4, expectDeletions: false },
  ]) {
    const storage = new Map([[TAB_PARAMS_STORAGE_KEY, JSON.stringify({
      tab1: { repo: 'C:/workspace/repo', scope: scenario.scope, file: 'src/live.js' },
    })]])
    const requests = []
    const client = loadClient(requestFetch(requests), storage)
    const props = { useTabInfo: () => ({ tab: { contentId: 'tab1', navigation: {} } }) }
    assert.equal(textContent(client.title(props)), 'live.js')
    const renderer = new HookRenderer(client.diff, props)
    renderer.render()

    const diffRequest = deferredRequest(requests, 'worktree-diff', 'C:/workspace/repo')
    assert.equal(diffRequest.url.pathname, '/api/git-multirepo/worktree-diff')
    assert.equal(diffRequest.url.searchParams.get('repo'), 'C:/workspace/repo')
    assert.equal(diffRequest.url.searchParams.get('scope'), scenario.scope)
    assert.equal(diffRequest.url.searchParams.get('file'), 'src/live.js')
    assert.equal(diffRequest.url.searchParams.get('hash'), null)
    diffRequest.resolve({
      file: 'src/live.js',
      additions: 4,
      deletions: scenario.deletions,
      hunks: [{
        header: '@@ -1,2 +1,3 @@',
        lines: [
          { type: 'context', text: ' same line' },
          { type: 'add', text: '+added line' },
          { type: 'del', text: '-removed line' },
        ],
      }],
      binary: false,
    })
    await renderer.flush()

    const text = textContent(renderer.tree)
    assert.match(text, /@@ -1,2 \+1,3 @@/)
    assert.match(text, /\+added line/)
    assert.match(text, new RegExp(`changes\\.${scenario.scope}`))
    assert.equal(
      findOne(renderer.tree, (node) => node.props?.className === 'gd-del') !== undefined,
      scenario.expectDeletions,
    )
    assert.doesNotMatch(text, /diff\.missingParams/)
    renderer.unmount()
  }

  const oldStorage = new Map([[TAB_PARAMS_STORAGE_KEY, JSON.stringify({
    tab2: { repo: 'C:/workspace/repo', hash: 'a'.repeat(40), file: 'src/old.js' },
  })]])
  const oldRequests = []
  const oldClient = loadClient(requestFetch(oldRequests), oldStorage)
  const oldProps = { useTabInfo: () => ({ tab: { contentId: 'tab2', navigation: {} } }) }
  const oldRenderer = new HookRenderer(oldClient.diff, oldProps)
  oldRenderer.render()
  const patch = deferredRequest(oldRequests, 'other', 'C:/workspace/repo')
  assert.equal(patch.url.pathname, '/api/git-multirepo/patch')
  assert.equal(patch.url.searchParams.get('hash'), 'a'.repeat(40))
  assert.equal(patch.url.searchParams.get('scope'), null)
  patch.resolve({ file: 'src/old.js', additions: 1, deletions: 1, hunks: [], binary: false })
  await oldRenderer.flush()
  assert.doesNotMatch(textContent(oldRenderer.tree), /diff\.missingParams/)
  oldRenderer.unmount()
})

test('worktree diff notices cover binary, too large and symbolic link payloads', async () => {
  for (const scenario of [
    { payload: { binary: true }, notice: 'changes\\.binary' },
    { payload: { tooLarge: true }, notice: 'changes\\.tooLarge' },
    { payload: { symbolicLink: true }, notice: 'changes\\.symbolicLink' },
  ]) {
    const storage = new Map([[TAB_PARAMS_STORAGE_KEY, JSON.stringify({
      tab1: { repo: 'C:/workspace/repo', scope: 'staged', file: 'bin.dat' },
    })]])
    const requests = []
    const client = loadClient(requestFetch(requests), storage)
    const props = { useTabInfo: () => ({ tab: { contentId: 'tab1', navigation: {} } }) }
    const renderer = new HookRenderer(client.diff, props)
    renderer.render()
    deferredRequest(requests, 'worktree-diff', 'C:/workspace/repo').resolve({
      file: 'bin.dat',
      additions: 0,
      deletions: 0,
      hunks: [],
      binary: false,
      ...scenario.payload,
    })
    await renderer.flush()
    assert.match(textContent(renderer.tree), new RegExp(scenario.notice))
    renderer.unmount()
  }
})

test('changing workspace drops in-flight workspace changes responses', async () => {
  const requests = []
  const client = loadClient(requestFetch(requests))
  const renderer = new HookRenderer(client.view, null)
  renderer.cwd = 'C:/changes-a'
  renderer.props = viewProps(renderer)
  renderer.render()
  clickMode(renderer, 'changes')
  await renderer.flush()
  const oldRequest = deferredRequest(requests, 'worktree', 'C:/changes-a')

  renderer.cwd = 'C:/changes-b'
  renderer.props = viewProps(renderer)
  renderer.render()
  await renderer.flush()
  assert.equal(
    oldRequest.options.signal.aborted,
    true,
    'changing workspace must abort the previous workspace changes request',
  )
  const newRequest = deferredRequest(requests, 'worktree', 'C:/changes-b')

  oldRequest.resolve(worktreeValue('C:/changes-a', [worktreeRepo('C:/changes-a', {
    unstaged: [{ path: 'OLD.js', status: 'M', insertions: 1, deletions: 0, binary: false }],
  })]))
  await renderer.flush()
  assert.doesNotMatch(textContent(renderer.tree), /OLD\.js/)

  newRequest.resolve(worktreeValue('C:/changes-b', [worktreeRepo('C:/changes-b', {
    unstaged: [{ path: 'NEW.js', status: 'M', insertions: 1, deletions: 0, binary: false }],
  })]))
  await renderer.flush()
  assert.match(textContent(renderer.tree), /NEW\.js/)
  renderer.unmount()
})

test('view mode restores from local storage with invalid values falling back to history', async () => {
  for (const [stored, expected] of [['bogus', 'history'], ['changes', 'changes']]) {
    const requests = []
    const client = loadClient(requestFetch(requests), new Map([[VIEW_MODE_STORAGE_KEY, stored]]))
    const renderer = new HookRenderer(client.view, null)
    renderer.cwd = `C:/mode-${expected}`
    renderer.props = viewProps(renderer)
    renderer.render()
    const root = findOne(renderer.tree, (node) => node.props?.className === 'gm-root')
    assert.equal(root.props['data-gm-mode'], expected)
    if (expected === 'changes') {
      deferredRequest(requests, 'worktree', renderer.cwd).resolve(worktreeValue(renderer.cwd, []))
      await renderer.flush()
      assert.match(textContent(renderer.tree), /changes\.empty/)
    } else {
      deferredRequest(requests, 'state', renderer.cwd).resolve(stateValue(renderer.cwd, 'ONE', 'b'.repeat(40)))
      await renderer.flush()
    }
    renderer.unmount()
  }
})

test('zh and en dictionaries expose identical keys', () => {
  const client = loadClient(requestFetch([]))
  const dictionaries = [...client.dictionaries.values()][0]
  assert.ok(dictionaries, 'the client should register its dictionaries')
  const zhKeys = Object.keys(dictionaries.zh).sort()
  const enKeys = Object.keys(dictionaries.en).sort()
  assert.deepEqual(zhKeys, enKeys, 'zh and en dictionaries must have the same keys')
  for (const key of zhKeys) {
    assert.equal(typeof dictionaries.zh[key], 'string', `zh.${key} should be a string`)
    assert.equal(typeof dictionaries.en[key], 'string', `en.${key} should be a string`)
    assert.notEqual(dictionaries.zh[key].trim(), '', `zh.${key} should not be empty`)
    assert.notEqual(dictionaries.en[key].trim(), '', `en.${key} should not be empty`)
  }
  const required = [
    'mode.history',
    'mode.changes',
    'changes.filterPlaceholder',
    'changes.empty',
    'changes.cleanCount',
    'changes.staged',
    'changes.unstaged',
    'changes.untracked',
    'changes.conflicted',
    'changes.binary',
    'changes.tooLarge',
    'changes.symbolicLink',
    'changes.directory',
    'changes.conflictUnsupported',
    'changes.loading',
    'changes.error',
    'changes.truncated',
    'changes.summary',
    'changes.repoSummary',
    'changes.openDiff',
    'changes.noMatch',
    'changes.refreshHint',
    'chat.add',
    'chat.addHint',
    'chat.added',
    'chat.addFailed',
    'chat.dismiss',
    'chat.menuHint',
    'chat.menuLabel',
  ]
  for (const key of required) assert.ok(zhKeys.includes(key), `missing i18n key: ${key}`)
})

test('commit context menu inserts the commit into the chat input and reports the result', async () => {
  const requests = []
  const inserted = []
  const focusCalls = []
  const inputActions = {
    captureInsertion: () => ({ start: 0, end: 0, draftRev: 0 }),
    insertText: (text) => {
      inserted.push(text)
      return true
    },
  }
  const client = loadClient(requestFetch(requests))
  const renderer = new HookRenderer(client.view, null)
  renderer.cwd = 'C:/chat-workspace'
  renderer.props = { ...viewProps(renderer), inputActions }
  renderer.render()
  const hash = 'b'.repeat(40)
  deferredRequest(requests, 'state', renderer.cwd).resolve(stateValue(renderer.cwd, 'CHAT ME', hash))
  await renderer.flush()

  const trigger = {
    focus: () => focusCalls.push('focus'),
    getBoundingClientRect: () => ({ left: 10, bottom: 40 }),
  }
  const openMenu = async () => {
    const row = findOne(
      renderer.tree,
      (node) => typeof node.props?.onContextMenu === 'function' && node.props?.['data-gm-repo'] === 'repo',
    )
    assert.ok(row, 'commit row should expose a context menu')
    assert.equal(row.props['aria-haspopup'], 'menu', 'commit row announces its popup menu')
    row.props.onContextMenu({ preventDefault() {}, stopPropagation() {}, currentTarget: trigger, clientX: 20, clientY: 30 })
    await renderer.flush()
    const menu = findOne(renderer.tree, (node) => node.props?.role === 'menu')
    assert.ok(menu, 'right-click should open the commit menu')
    const rowAfter = findOne(
      renderer.tree,
      (node) => typeof node.props?.onContextMenu === 'function' && node.props?.['data-gm-repo'] === 'repo',
    )
    assert.equal(rowAfter.props['aria-expanded'], true, 'the open menu is announced on the row')
    assert.equal(rowAfter.props['aria-controls'], menu.props.id, 'the row points at the open menu')
    const item = findOne(menu, (node) => node.type === 'button' && node.props?.role === 'menuitem')
    assert.ok(item, 'menu should offer an add-to-chat item')
    assert.equal(item.props.title, 'chat.addHint', 'menu item explains what it does')
    return item
  }

  const item = await openMenu()
  item.props.onClick()
  await renderer.flush()
  assert.equal(
    requests.filter((entry) => entry.kind === 'commit' || entry.kind === 'chat').length,
    0,
    'adding a reference must not send or fetch anything',
  )
  assert.deepEqual(inserted, [`[commit:repo@${hash.slice(0, 8)}]\n`], 'only a compact commit marker is inserted')
  assert.deepEqual(focusCalls, ['focus'], 'focus returns to the commit row after closing the menu')
  const notice = findOne(renderer.tree, (node) => node.props?.['data-gm-notice'] === 'ok')
  assert.ok(notice, 'success should be visible')
  assert.match(textContent(notice), /chat\.added/)
  const dismiss = findOne(notice, (node) => node.props?.['aria-label'] === 'chat.dismiss')
  assert.ok(dismiss, 'notice should be dismissible')
  dismiss.props.onClick()
  await renderer.flush()
  assert.equal(findOne(renderer.tree, (node) => node.props?.['data-gm-notice'] !== undefined), undefined)

  // 输入框正忙时 insertText 返回 false：不插入，但要显示可见失败提示。
  inputActions.insertText = () => false
  const retry = await openMenu()
  retry.props.onClick()
  await renderer.flush()
  assert.equal(inserted.length, 1)
  const failure = findOne(renderer.tree, (node) => node.props?.['data-gm-notice'] === 'error')
  assert.ok(failure, 'failure should not be silent')
  assert.match(textContent(failure), /chat\.addFailed/)
  renderer.unmount()
})

test('changing the session workspace closes the commit menu and inserts with the new state', async () => {
  const requests = []
  const inserted = []
  const inputActions = {
    captureInsertion: () => ({ start: 0, end: 0, draftRev: 0 }),
    insertText: (text) => {
      inserted.push(text)
      return true
    },
  }
  const client = loadClient(requestFetch(requests))
  const renderer = new HookRenderer(client.view, null)
  renderer.cwd = 'C:/chat-workspace'
  renderer.props = { ...viewProps(renderer), inputActions }
  renderer.render()
  deferredRequest(requests, 'state', renderer.cwd).resolve(stateValue(renderer.cwd, 'OLD', 'c'.repeat(40)))
  await renderer.flush()

  const row = findOne(renderer.tree, (node) => typeof node.props?.onContextMenu === 'function')
  row.props.onContextMenu({ preventDefault() {}, stopPropagation() {}, clientX: 5, clientY: 5 })
  await renderer.flush()
  assert.ok(findOne(renderer.tree, (node) => node.props?.role === 'menu'), 'menu opens for the old cwd')

  renderer.cwd = 'C:/chat-workspace-2'
  renderer.render()
  deferredRequest(requests, 'state', renderer.cwd).resolve(stateValue(renderer.cwd, 'NEW', 'd'.repeat(40)))
  await renderer.flush()
  assert.equal(findOne(renderer.tree, (node) => node.props?.role === 'menu'), undefined, 'cwd change closes the menu')

  const nextRow = findOne(renderer.tree, (node) => typeof node.props?.onContextMenu === 'function')
  nextRow.props.onContextMenu({ preventDefault() {}, stopPropagation() {}, clientX: 8, clientY: 8 })
  await renderer.flush()
  const item = findOne(renderer.tree, (node) => node.type === 'button' && node.props?.role === 'menuitem')
  item.props.onClick()
  await renderer.flush()
  assert.equal(inserted.length, 1)
  assert.match(inserted[0], /d{8}/, 'the marker comes from the current workspace state')
  renderer.unmount()
})

test('commit reference rule defers registration when uiConversation is not ready', () => {
  const client = loadClient(requestFetch([]), new Map(), { uiConversation: 'deferred' })
  assert.equal(client.rules.length, 0, 'the rule must not be silently dropped without a trace')
  assert.ok(
    client.logs.warn.some((line) => line.includes('uiConversation')),
    'a deferred registration must be logged',
  )
  assert.equal(client.injected.length, 1)
  assert.equal(client.injected[0].deps.length, 1)
  assert.equal(client.injected[0].deps[0], 'uiConversation')
  client.injected[0].callback({
    get: (name) => (name === 'uiConversation' ? client.uiConversation : undefined),
    effect: (start) => start(),
  })
  assert.equal(client.rules.length, 1, 'the rule registers once the service becomes available')
  assert.equal(client.rules[0].id, 'git-commit')
})

test('commit reference markers are matched and rendered as inline chips', () => {
  const requests = []
  const client = loadClient(requestFetch(requests))
  const rule = client.rules.find((item) => item.id === 'git-commit')
  assert.ok(rule, 'the user-text rule should be registered')

  const text = '看看 [commit:dsh-git-multirepo@abcdef123] 这个提交\n'
  const match = rule.match(text, 0)
  assert.ok(match)
  assert.equal(match.id, 'git-commit')
  assert.equal(match.start, text.indexOf('['))
  assert.equal(match.end, text.indexOf(']') + 1)
  assert.equal(text.slice(match.start, match.end), '[commit:dsh-git-multirepo@abcdef123]')
  assert.equal(match.data.repo, 'dsh-git-multirepo')
  assert.equal(match.data.hash, 'abcdef123')
  assert.equal(rule.match('plain text without a marker', 0), undefined)
  assert.equal(rule.match('[commit:repo@xyz]', 0), undefined, 'invalid hash must not match')
  const abbreviated = rule.match('[commit:repo@abcd]', 0)
  assert.ok(abbreviated, 'git can abbreviate a hash to four characters')
  assert.equal(abbreviated.data.hash, 'abcd')
  const encoded = rule.match('x [commit:my%20repo@abcdef123] y', 0)
  assert.ok(encoded, 'URL-encoded repository names should match')
  assert.equal(encoded.data.repo, 'my repo')

  const chip = client.registrations.get('conversation.user.text.node')
  assert.ok(chip, 'the inline chip renderer should be registered')
  const raw = text.slice(match.start, match.end)
  const tree = chip({ node: { data: match.data }, raw })
  const content = textContent(tree)
  assert.ok(content.includes('dsh-git-multirepo'))
  assert.ok(content.includes('abcdef1'))
  assert.equal(tree.props.title, raw)
})
