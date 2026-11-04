import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

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

function loadClient(fetchImpl, localStorage = new Map()) {
  const React = fakeReact()
  const registrations = new Map()
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
    console,
    fetch: fetchImpl,
    localStorage: storage,
    Response,
    URL,
    URLSearchParams,
    AbortController,
    getComputedStyle: () => ({ overflowY: 'visible' }),
  }
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })
  const translate = (key) => key
  const ctx = {
    effect(start) {
      return start()
    },
    locale: {
      bind: () => translate,
      register: () => undefined,
    },
    sidebarRightTabs: { register: () => undefined },
    sidebarRight: { openTab: () => undefined },
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
  sandbox.client.apply(ctx)
  return {
    view: registrations.get('conversation.view'),
    title: registrations.get('sidebar.right.pane.tab.title'),
    diff: registrations.get('sidebar.right.pane.tab'),
    storage,
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
    const kind = pathname.endsWith('/state') ? 'state' : pathname.endsWith('/commit') ? 'commit' : pathname.endsWith('/fetch') ? 'fetch' : 'other'
    const root = parsed.searchParams.get('root') ?? parsed.searchParams.get('repo') ?? ''
    const request = { kind, root, options, settled: false }
    requests.push(request)
    return new Promise((resolve, reject) => {
      request.resolve = (value) => {
        request.settled = true
        resolve(response(value))
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

test('repositories view hides the conversation composer while mounted', async () => {
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
