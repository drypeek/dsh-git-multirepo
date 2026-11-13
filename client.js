window.__ModuleLoader__.load({
  id: 'dsh-git-multirepo',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    /** 视图标识，即 conversation.view 的注册 id。 */
    const VIEW_ID = 'git-multirepo'
    /** 本插件文案命名空间。 */
    const NS = 'gitMultirepo'
    /** 状态数据路由。 */
    const STATE_URL = '/api/git-multirepo/state'
    /** 单个提交详情路由。 */
    const COMMIT_URL = '/api/git-multirepo/commit'
    /** 远程拉取路由。 */
    const FETCH_URL = '/api/git-multirepo/fetch'
    /** 单个文件差异路由。 */
    const PATCH_URL = '/api/git-multirepo/patch'
    /** 工作区未提交改动路由。 */
    const WORKTREE_URL = '/api/git-multirepo/worktree'
    /** 工作区单文件差异路由。 */
    const WORKTREE_DIFF_URL = '/api/git-multirepo/worktree-diff'
    /** 工作区 diff 支持的改动范围。 */
    const WORKTREE_SCOPES = ['staged', 'unstaged', 'untracked']
    /** 改动范围到徽标文案键的映射。 */
    const WORKTREE_SCOPE_KEYS = {
      staged: 'changes.staged',
      unstaged: 'changes.unstaged',
      untracked: 'changes.untracked',
    }
    /** 视图模式（提交历史 / 工作区改动）的持久化键。 */
    const VIEW_MODE_KEY = 'dsh-git-multirepo:view-mode:v1'
    /** 差异页签的实现标识。 */
    const DIFF_ID = 'git-multirepo-diff'
    /** 差异页签的 kind。 */
    const DIFF_KIND = 'git-diff'
    /** 每个仓库默认取的提交条数。 */
    const DEFAULT_LIMIT = 40
    /** 仓库配色，按仓库出现顺序循环分配。 */
    const PALETTE = [
      '#5b8ff9', '#5ad8a6', '#f6bd16', '#e8684a', '#6dc8ec', '#9270ca',
      '#ff9d4d', '#269a99', '#ff99c3', '#5d7092', '#bd8fe8', '#4e9b5f',
      '#c15c5c', '#3a9bd9', '#b8a04a', '#8f6bc4',
    ]

    /** 中文文案。 */
    const zh = {
      'view.label': 'GIT日志',
      title: '多仓库 Git 提交日志',
      'action.refresh': '刷新',
      'action.fetch': '拉取',
      'action.fetching': '拉取中…',
      'action.fetchHint': '对所有仓库执行 git fetch --all --prune，拉取后自动刷新',
      'fetch.ok': '已拉取 {count} 个仓库',
      'fetch.partial': '已拉取，{count} 个仓库失败',
      'fetch.error': '拉取请求失败：{message}',
      'fetch.doneTitle': '拉取完成',
      'fetch.partialTitle': '部分仓库拉取失败',
      'fetch.errorTitle': '拉取失败',
      'fetch.timeoutTitle': '拉取超时',
      'fetch.dismiss': '关闭',
      'upstream.ahead': '领先远程 {count} 个提交（本地未推送）',
      'upstream.behind': '落后远程 {count} 个提交（需要拉取）',
      'branch.current': '当前分支',
      'branch.currentHint': '每个仓库只取当前检出分支的提交（git log）',
      'branch.all': '所有分支',
      'branch.allHint': '包含所有本地与远程跟踪分支（git log --all）',
      'state.loading': '正在读取仓库…',
      'state.empty': '该目录下没有找到 git 仓库。',
      'state.noWorkspace': '当前会话还没有工作目录。',
      'state.error': '读取失败：{message}',
      'state.noMatch': '没有匹配的提交。',
      'filter.placeholder': '筛选提交信息 / 作者 / 仓库 / 哈希',
      'summary.repos': '{count} 个仓库',
      'summary.commits': '{count} 条提交',
      'summary.dirty': '{count} 个有未提交改动',
      'summary.clean': '全部干净',
      'summary.unknown': '{count} 个仓库状态未知',
      'summary.filtered': '筛出 {count} 条',
      'summary.hidden': '已隐藏 {count} 个',
      'chip.showAll': '全部显示',
      'repo.error': '读取失败',
      'detail.loading': '正在读取提交…',
      'detail.error': '提交详情读取失败：{message}',
      'detail.hash': '哈希',
      'detail.author': '作者',
      'detail.authorDate': '作者时间',
      'detail.commitDate': '提交时间',
      'detail.committer': '提交者',
      'detail.merge': '合并 {count} 个父提交',
      'detail.mergeIntroduced': '本次合并引入 {count} 个提交',
      'detail.mergeTruncated': '已截断',
      'detail.mergeNone': '没有引入额外提交',
      'range.all': '全部时间',
      'range.today': '今天',
      'range.3d': '近 3 天',
      'range.7d': '近 7 天',
      'range.label': '时间范围',
      'diff.title': '文件差异',
      'diff.loading': '正在读取差异…',
      'diff.error': '差异读取失败：{message}',
      'diff.binary': '二进制文件，无法预览差异。',
      'diff.empty': '该文件在此提交中没有可显示的差异。',
      'diff.truncated': '差异过长，已截断。',
      'diff.open': '在右侧栏打开差异',
      'diff.gap': '⋯ 省略 {count} 行未修改 ⋯',
      'badge.head': 'HEAD',
      'badge.headHint': '本地当前 HEAD 位置',
      'badge.remoteHint': '只在远程分支上，本地尚未同步',
      'action.gotoHead': '回到 HEAD',
      'action.gotoTop': '回到顶部',
      'action.gotoHeadMissing': '当前列表中找不到本地 HEAD 行（请点刷新，或检查取数是否被截断）',
      'section.remote': '未合并的远程提交 · {count}',
      'section.local': '本地提交历史',
      'section.all': '所有分支提交',
      'detail.refs': '引用',
      'detail.parents': '父提交',
      'detail.stat': '统计',
      'detail.statValue': '{files} 个文件  +{insertions}  −{deletions}',
      'detail.files': '变更文件',
      'detail.noFiles': '没有文件变更',
      'detail.expand': '点击展开提交详情',
      'diff.missingParams': '差异页签缺少定位参数，请回到提交详情重新打开。',
      'diff.openFailed': '打开差异页签失败：{message}',
      'fetch.confirm': '将对 {count} 个仓库执行 git fetch（只更新远程跟踪引用，不会合并或改动工作区文件）。继续？',
      'fetch.confirmTitle': '拉取远程更新？',
      'fetch.confirmYes': '开始拉取',
      'fetch.confirmNo': '取消',
      'fetch.timedOut': '拉取超时，已停止剩余仓库',
      'state.reposTruncated': '仓库数量已达扫描上限，部分仓库未列出',
      'state.reposSkipped': '{count} 个目录不是有效仓库根，已跳过',
      'state.truncated': '结果已截断，仅显示部分提交',
      'error.busy': '请求过于频繁，请稍后再试',
      'detail.retry': '重试',
      'detail.filesTruncated': '文件列表过大，仅显示前 {count} 个',
      'error.http': '请求失败（HTTP {status}）',
      'error.outsideWorkspace': '该目录不在已注册的工作区内',
      'error.invalidRoot': '工作区目录无效',
      'error.invalidRepo': '不是有效的 git 仓库',
      'error.invalidHash': '提交哈希无效',
      'error.invalidFile': '文件路径无效',
      'error.fetchInProgress': '已有拉取任务在进行，请稍后再试',
      'error.commitNotFound': '找不到该提交',
      'error.patchNotFound': '找不到该文件的差异',
      'error.unsupportedObjectFormat': '该仓库使用了暂不支持的 Git 对象格式',
      'error.repositoryBoundary': '仓库元数据超出当前工作区边界',
      'error.unsafeConfig': '仓库配置无法安全读取',
      'error.offlineObjectMissing': '缺少对象；只读查看不会联网补取',
      'error.resourceLimit': '仓库规模超过本次读取上限',
      'error.unsupportedGitVersion': 'Git 版本过低，无法安全读取',
      'error.requestCancelled': '读取请求已取消',
      'error.requestFailed': '读取请求失败',
      'mode.history': '提交历史',
      'mode.changes': '工作区改动',
      'mode.hint': '在提交历史与工作区改动之间切换',
      'mode.historyHint': '按提交时间线查看各仓库历史',
      'mode.changesHint': '查看各仓库未提交的工作区改动',
      'changes.filterPlaceholder': '筛选文件路径 / 仓库名',
      'changes.empty': '所有仓库都没有未提交改动。',
      'changes.cleanCount': '{count} 个仓库无改动',
      'changes.staged': '暂存',
      'changes.unstaged': '未暂存',
      'changes.untracked': '未跟踪',
      'changes.conflicted': '冲突未解决',
      'changes.binary': '二进制文件，无法预览差异。',
      'changes.tooLarge': '差异过大，无法预览。',
      'changes.symbolicLink': '符号链接，无法预览差异。',
      'changes.directory': '目录：v0.2 暂不展开逐个文件',
      'changes.conflictUnsupported': '冲突文件的差异暂不支持预览',
      'changes.loading': '正在读取工作区改动…',
      'changes.error': '工作区改动读取失败：{message}',
      'changes.truncated': '改动文件过多，仅显示部分结果',
      'changes.summary': '{repos} 个仓库有改动 · {files} 个文件 · +{insertions} −{deletions}',
      'changes.repoSummary': '{files} 个文件',
      'changes.openDiff': '在右侧栏打开差异',
      'changes.noMatch': '没有匹配的改动文件。',
      'changes.refreshHint': '重新读取工作区改动',
      'changes.unborn': '尚无提交',
      'changes.repoTruncated': '该仓库文件过多，仅显示部分文件',
      'changes.diffEmpty': '该文件没有可显示的差异。',
    }

    /** 英文文案。 */
    const en = {
      'view.label': 'Git log',
      title: 'Multi-repo Git commit log',
      'action.refresh': 'Refresh',
      'action.fetch': 'Fetch',
      'action.fetching': 'Fetching…',
      'action.fetchHint': 'Run git fetch --all --prune for every repository, then refresh',
      'fetch.ok': 'Fetched {count} repositories',
      'fetch.partial': 'Fetched, {count} failed',
      'fetch.error': 'Fetch request failed: {message}',
      'fetch.doneTitle': 'Fetch complete',
      'fetch.partialTitle': 'Fetch completed with failures',
      'fetch.errorTitle': 'Fetch failed',
      'fetch.timeoutTitle': 'Fetch timed out',
      'fetch.dismiss': 'Dismiss',
      'upstream.ahead': '{count} commits ahead of upstream (not pushed)',
      'upstream.behind': '{count} commits behind upstream (needs fetch)',
      'branch.current': 'Current branch',
      'branch.currentHint': 'Only commits on each repository current branch (git log)',
      'branch.all': 'All branches',
      'branch.allHint': 'Include every local and remote-tracking branch (git log --all)',
      'state.loading': 'Reading repositories…',
      'state.empty': 'No git repository found under this directory.',
      'state.noWorkspace': 'This session has no working directory.',
      'state.error': 'Read failed: {message}',
      'state.noMatch': 'No commit matches this filter.',
      'filter.placeholder': 'Filter message, author, repository or hash',
      'summary.repos': '{count} repos',
      'summary.commits': '{count} commits',
      'summary.dirty': '{count} with uncommitted changes',
      'summary.clean': 'All clean',
      'summary.unknown': '{count} repositories have unknown status',
      'summary.filtered': '{count} shown',
      'summary.hidden': '{count} hidden',
      'chip.showAll': 'Show all',
      'repo.error': 'Read failed',
      'detail.loading': 'Reading commit…',
      'detail.error': 'Commit detail failed: {message}',
      'detail.hash': 'Hash',
      'detail.author': 'Author',
      'detail.authorDate': 'Authored',
      'detail.commitDate': 'Committed',
      'detail.committer': 'Committer',
      'detail.merge': 'Merge of {count} parents',
      'detail.mergeIntroduced': 'This merge brought in {count} commits',
      'detail.mergeTruncated': 'truncated',
      'detail.mergeNone': 'No additional commits',
      'range.all': 'All time',
      'range.today': 'Today',
      'range.3d': 'Last 3 days',
      'range.7d': 'Last 7 days',
      'range.label': 'Time range',
      'diff.title': 'File diff',
      'diff.loading': 'Reading diff…',
      'diff.error': 'Diff failed: {message}',
      'diff.binary': 'Binary file, no diff preview available.',
      'diff.empty': 'This commit shows no diff for that file.',
      'diff.truncated': 'Diff truncated.',
      'diff.open': 'Open diff in the right sidebar',
      'diff.gap': '⋯ {count} unchanged lines ⋯',
      'badge.head': 'HEAD',
      'badge.headHint': 'Current local HEAD',
      'badge.remoteHint': 'Only on the remote branch; not synced locally yet',
      'action.gotoHead': 'Go to HEAD',
      'action.gotoTop': 'Back to top',
      'action.gotoHeadMissing': 'No local HEAD row in the current list (refresh or check truncation)',
      'section.remote': 'Unmerged remote commits · {count}',
      'section.local': 'Local commit history',
      'section.all': 'All branch commits',
      'detail.refs': 'Refs',
      'detail.parents': 'Parents',
      'detail.stat': 'Stat',
      'detail.statValue': '{files} files  +{insertions}  −{deletions}',
      'detail.files': 'Changed files',
      'detail.noFiles': 'No file changed',
      'detail.expand': 'Click to expand commit detail',
      'diff.missingParams': 'Diff tab is missing its target; reopen it from the commit detail.',
      'diff.openFailed': 'Cannot open the diff tab: {message}',
      'fetch.confirm': 'Run git fetch on {count} repositories? Only remote-tracking refs are updated; nothing is merged and no working-tree file is changed.',
      'fetch.confirmTitle': 'Fetch remote updates?',
      'fetch.confirmYes': 'Start fetch',
      'fetch.confirmNo': 'Cancel',
      'fetch.timedOut': 'Fetch timed out; remaining repositories were stopped',
      'state.reposTruncated': 'Repository scan hit its limit; some repositories are not listed',
      'state.reposSkipped': '{count} directories are not valid repository roots and were skipped',
      'state.truncated': 'Results were truncated; only part of the history is shown',
      'error.busy': 'Too many requests at once; try again in a moment',
      'detail.retry': 'Retry',
      'detail.filesTruncated': 'File list limited; showing the first {count}',
      'error.http': 'Request failed (HTTP {status})',
      'error.outsideWorkspace': 'This directory is outside the registered workspace',
      'error.invalidRoot': 'Invalid workspace directory',
      'error.invalidRepo': 'Not a valid git repository',
      'error.invalidHash': 'Invalid commit hash',
      'error.invalidFile': 'Invalid file path',
      'error.fetchInProgress': 'A fetch is already running; try again later',
      'error.commitNotFound': 'Commit not found',
      'error.patchNotFound': 'No diff found for this file',
      'error.unsupportedObjectFormat': 'This repository uses an unsupported Git object format',
      'error.repositoryBoundary': 'Repository metadata is outside the workspace boundary',
      'error.unsafeConfig': 'Repository configuration could not be read safely',
      'error.offlineObjectMissing': 'Object is missing; read-only viewing will not fetch it',
      'error.resourceLimit': 'Repository size exceeds the read limit',
      'error.unsupportedGitVersion': 'Git is too old for safe read-only access',
      'error.requestCancelled': 'The read request was cancelled',
      'error.requestFailed': 'The read request failed',
      'mode.history': 'Commit history',
      'mode.changes': 'Working tree',
      'mode.hint': 'Switch between commit history and working-tree changes',
      'mode.historyHint': 'Browse each repository history as a commit timeline',
      'mode.changesHint': 'Inspect uncommitted working-tree changes per repository',
      'changes.filterPlaceholder': 'Filter file path or repository',
      'changes.empty': 'No repository has uncommitted changes.',
      'changes.cleanCount': '{count} clean repositories',
      'changes.staged': 'Staged',
      'changes.unstaged': 'Unstaged',
      'changes.untracked': 'Untracked',
      'changes.conflicted': 'Unresolved conflicts',
      'changes.binary': 'Binary file, no diff preview available.',
      'changes.tooLarge': 'Diff too large to preview.',
      'changes.symbolicLink': 'Symbolic link, no diff preview available.',
      'changes.directory': 'Directory: expanding its files is not supported yet',
      'changes.conflictUnsupported': 'Diff preview for conflicted files is not supported yet',
      'changes.loading': 'Reading working-tree changes…',
      'changes.error': 'Working-tree changes failed: {message}',
      'changes.truncated': 'Too many changed files; only part of the result is shown',
      'changes.summary': '{repos} repos with changes · {files} files · +{insertions} −{deletions}',
      'changes.repoSummary': '{files} files',
      'changes.openDiff': 'Open diff in the right sidebar',
      'changes.noMatch': 'No changed file matches this filter.',
      'changes.refreshHint': 'Reload working-tree changes',
      'changes.unborn': 'No commits yet',
      'changes.repoTruncated': 'Too many files in this repository; only part of them is shown',
      'changes.diffEmpty': 'No diff preview available for this file.',
    }

    /** 插件样式，随视图渲染。 */
    const STYLE = `
.gm-root{height:100%;min-height:0;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.5;box-sizing:border-box;background:var(--dsw-alias-bg-base)}
.gm-toolbar{flex:none;position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:8px;height:44px;padding:0 10px 0 20px;border-bottom:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.gm-heading{flex:none;display:flex;align-items:baseline;gap:10px;max-width:26%;overflow:hidden}
.gm-heading-text{flex:none;font-size:14px;font-weight:600;white-space:nowrap}
.gm-spacer{flex:auto;min-width:0}
.gm-seg{flex:none;display:inline-flex;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,4px);overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.gm-seg button{border:0;background:0 0;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);padding:4px 11px;cursor:pointer;white-space:nowrap;transition:background .12s ease,color .12s ease}
.gm-seg button+button{border-left:.5px solid var(--dsw-alias-border-l1)}
.gm-seg button:hover{color:var(--dsw-alias-label-primary)}
.gm-seg button[aria-pressed=true]{background:color-mix(in srgb,var(--dsw-alias-label-primary) 15%,transparent);color:var(--dsw-alias-label-primary);font-weight:600}
.gm-seg button[aria-pressed=true]:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent)}
.gm-seg button[disabled]{opacity:.5;cursor:default}
.gm-tool{height:28px;flex:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;border:0;background:0 0;padding:0 8px;border-radius:var(--dsw-radius-sm,4px);color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;white-space:nowrap}
.gm-tool:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));color:var(--dsw-alias-label-primary)}
.gm-tool[disabled]{opacity:.45;cursor:default}
.gm-tool[aria-busy=true]{color:var(--dsw-alias-brand-primary)}
.gm-tool svg{width:15px;height:15px;display:block;flex:none}
.gm-bar{flex:none;display:flex;align-items:center;gap:14px;padding:8px 20px;flex-wrap:wrap;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.gm-meta{flex:none;display:flex;align-items:center;gap:14px;color:var(--dsw-alias-label-secondary);font-size:12px}
.gm-meta-warn{color:var(--dsw-alias-state-warn-primary)}
.gm-meta-ok{color:var(--dsw-alias-state-success-primary)}
.gm-search{flex:auto;min-width:180px;max-width:460px}
.gm-search input{width:100%;box-sizing:border-box;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,4px);padding:5px 9px;outline:none}
.gm-search input:focus{border-color:var(--dsw-alias-brand-primary)}
.gm-search input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.7}
.gm-chips{flex:none;display:flex;align-items:center;gap:6px;padding:8px 20px 10px;flex-wrap:wrap;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.gm-chip{display:inline-flex;align-items:center;gap:5px;font:inherit;font-size:11px;line-height:1.4;padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border:.5px solid var(--dsw-alias-border-l1);cursor:pointer;white-space:nowrap}
.gm-chip:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.gm-chip[aria-pressed=false]{opacity:.38}
.gm-chip-dot{width:7px;height:7px;border-radius:50%;flex:none}
.gm-chip-dirty{color:var(--dsw-alias-state-warn-primary)}
.gm-chip-unknown{color:var(--dsw-alias-state-warn-primary)}
.gm-chip-error{color:var(--dsw-alias-state-error-primary)}
.gm-chip-track{display:inline-flex;gap:4px;font-size:10px;font-variant-numeric:tabular-nums}
.gm-up{color:var(--dsw-alias-state-warn-primary)}
.gm-down{color:var(--dsw-alias-label-secondary)}
.gm-dialog-backdrop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.42)}
.gm-dialog{width:min(440px,100%);box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:18px 20px 16px;border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);box-shadow:0 16px 48px rgba(0,0,0,.28);color:var(--dsw-alias-label-primary)}
.gm-dialog-title{margin:0;font-size:14px;font-weight:600;line-height:1.4}
.gm-dialog-text{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}
.gm-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}
.gm-dialog-btn{height:30px;padding:0 13px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,4px);background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
.gm-dialog-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}
.gm-dialog-btn:focus{outline:none}
.gm-dialog-btn:focus-visible{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent);outline-offset:2px}
.gm-dialog-btn-primary{border-color:transparent;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 11%,transparent);color:var(--dsw-alias-brand-primary);font-weight:600}
.gm-dialog-btn-primary:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 17%,transparent)}
.gm-fetch-toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:1000;display:flex;align-items:flex-start;gap:10px;width:min(560px,calc(100vw - 32px));box-sizing:border-box;padding:12px 14px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);box-shadow:0 8px 24px rgba(0,0,0,.18);font-size:12px;color:var(--dsw-alias-label-primary)}
.gm-fetch-toast-ok{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 55%,transparent)}
.gm-fetch-toast-partial{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 55%,transparent)}
.gm-fetch-toast-error{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent)}
.gm-fetch-toast-icon{flex:none;display:flex;margin-top:1px;color:var(--dsw-alias-label-secondary)}
.gm-fetch-toast-ok .gm-fetch-toast-icon{color:var(--dsw-alias-state-success-primary)}
.gm-fetch-toast-partial .gm-fetch-toast-icon{color:var(--dsw-alias-state-warn-primary)}
.gm-fetch-toast-error .gm-fetch-toast-icon{color:var(--dsw-alias-state-error-primary)}
.gm-fetch-toast-body{flex:auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.gm-fetch-toast-title{font-weight:600}
.gm-fetch-toast-text{color:var(--dsw-alias-label-secondary);line-height:1.5;word-break:break-word}
.gm-fetch-toast-close{flex:none;border:0;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:15px;line-height:1;padding:2px 5px;border-radius:3px;cursor:pointer}
.gm-fetch-toast-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));color:var(--dsw-alias-label-primary)}
.gm-list{flex:auto;min-height:0;overflow:auto;padding:2px 0 24px;position:relative}
.gm-list::-webkit-scrollbar-track{margin:2px}
.gm-row{display:flex;align-items:flex-start;gap:10px;padding:4px 20px;cursor:pointer;outline:none;scroll-margin-top:56px}
.gm-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}
.gm-row-remote{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 7%,transparent)}
.gm-row-remote:hover{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent)}
.gm-row-remote .gm-rail{opacity:.35}
.gm-divider{display:flex;align-items:center;gap:10px;padding:8px 20px;color:var(--dsw-alias-state-warn-primary);font-size:11px;white-space:nowrap;scroll-margin-top:56px}
.gm-section{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;border:0;border-top:.5px solid var(--dsw-alias-border-l1);border-bottom:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font:inherit;font-size:11px;white-space:nowrap;text-align:left;padding:7px 20px;margin-top:6px;cursor:pointer;color:var(--dsw-alias-label-secondary);scroll-margin-top:56px}
.gm-section:hover{color:var(--dsw-alias-label-primary)}
.gm-section::after{content:'';flex:auto;height:1px;background:currentColor;opacity:.25}
.gm-section-remote{color:var(--dsw-alias-state-warn-primary)}
.gm-section-remote:hover{color:var(--dsw-alias-state-warn-primary);opacity:.85}
.gm-caret{flex:none;display:block;opacity:.75}
.gm-divider::before,.gm-divider::after{content:'';flex:auto;height:1px;background:currentColor;opacity:.3}
.gm-row:focus-visible{box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}
.gm-row-open{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}
.gm-rail{flex:none;width:3px;border-radius:2px;align-self:stretch;margin:3px 0}
.gm-main{flex:auto;min-width:0;display:flex;flex-direction:column;gap:1px}
.gm-line1{display:flex;align-items:baseline;gap:8px;min-width:0}
.gm-line2{display:flex;align-items:baseline;gap:10px;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary)}
.gm-repo{flex:none;max-width:180px;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gm-subject{flex:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gm-branch{flex:none;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-brand-primary);font-size:11px}
.gm-refs{flex:none;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-brand-primary);font-size:11px;opacity:.85}
.gm-author{flex:none;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gm-time{flex:none;margin-left:auto;padding-left:8px;color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.gm-hash{flex:none;font-family:var(--dsh-code-font-family,ui-monospace,SFMono-Regular,Consolas,monospace);opacity:.85}
.gm-merge{flex:none;font-size:10px;line-height:1.5;padding:0 5px;border-radius:3px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.gm-badge{flex:none;font-size:10px;line-height:1.5;padding:0 5px;border-radius:3px;border:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.gm-badge-head{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent)}
.gm-badge-remote{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,transparent)}
.gm-merge-block{margin:10px 0 0;border:.5px solid var(--dsw-alias-border-l1);border-radius:4px;background:var(--dsw-alias-bg-base);overflow:hidden}
.gm-merge-summary{padding:5px 10px;cursor:pointer;color:var(--dsw-alias-brand-primary);font-size:11px;user-select:none}
.gm-merge-list{margin:0;padding:0 10px 6px;list-style:none;max-height:220px;overflow:auto}
.gm-merge-item{display:flex;align-items:baseline;gap:8px;padding:1px 0;font-size:11px}
.gm-merge-date{flex:none;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.gm-merge-subject{flex:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gm-merge-hash{flex:none;font-family:var(--dsh-code-font-family,ui-monospace,SFMono-Regular,Consolas,monospace);color:var(--dsw-alias-label-secondary);opacity:.85}
.gm-range{flex:none;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,4px);padding:4px 6px;outline:none;cursor:pointer}
.gm-detail{margin:0 20px 10px 33px;padding:10px 14px;border:.5px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);font-size:12px;line-height:1.6}
.gm-detail-loading{color:var(--dsw-alias-label-secondary)}
.gm-detail-error{color:var(--dsw-alias-state-error-primary)}
.gm-detail-grid{display:grid;grid-template-columns:64px minmax(0,1fr);gap:3px 12px;align-items:baseline}
.gm-detail-key{color:var(--dsw-alias-label-secondary);font-size:11px}
.gm-detail-mono{font-family:var(--dsh-code-font-family,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:11px;word-break:break-all;user-select:all}
.gm-detail-message{margin:10px 0 0;padding:8px 10px;background:var(--dsw-alias-bg-base);border-radius:4px;border:.5px solid var(--dsw-alias-border-l1);white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:12px;line-height:1.65;max-height:200px;overflow:auto}
.gm-detail-files-head{margin:12px 0 4px;color:var(--dsw-alias-label-secondary);font-size:11px}
.gm-detail-empty{color:var(--dsw-alias-label-secondary);font-size:11px}
.gm-detail-files{margin:0;padding:0;list-style:none;max-height:240px;overflow:auto}
.gm-file{display:flex;align-items:baseline;gap:8px;padding:1px 0;font-size:11px}
.gm-file-status{flex:none;width:16px;text-align:center;font-weight:600}
.gm-file-A{color:var(--dsw-alias-state-success-primary)}
.gm-file-D{color:var(--dsw-alias-state-error-primary)}
.gm-file-M,.gm-file-R{color:var(--dsw-alias-state-warn-primary)}
.gm-file-path{flex:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsh-code-font-family,ui-monospace,SFMono-Regular,Consolas,monospace)}
.gm-file-open{border:0;background:0 0;padding:0;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer}
.gm-file-open:hover{color:var(--dsw-alias-brand-primary);text-decoration:underline}
.gm-file-num,.gm-file-del{flex:none;font-variant-numeric:tabular-nums;font-size:11px}
.gm-file-num{color:var(--dsw-alias-state-success-primary)}
.gm-file-del{color:var(--dsw-alias-state-error-primary)}
.gm-status{padding:28px 20px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.7}
.gm-status-error{color:var(--dsw-alias-state-error-primary)}
.gm-confirm{flex:none;display:flex;align-items:center;gap:10px;padding:8px 20px;border-bottom:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:12px}
.gm-confirm-text{flex:auto;min-width:0;color:var(--dsw-alias-label-secondary);line-height:1.5}
.gm-confirm-error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.gm-confirm-error .gm-confirm-text{color:var(--dsw-alias-state-error-primary)}
.gm-retry{margin-left:10px;font:inherit;font-size:11px;padding:1px 8px;border-radius:3px;border:.5px solid var(--dsw-alias-border-l1);background:0 0;color:var(--dsw-alias-brand-primary);cursor:pointer}
.gm-retry:hover{border-color:var(--dsw-alias-brand-primary)}
.gm-mode{flex:none;display:inline-flex;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,4px);overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.gm-mode-btn{border:0;background:0 0;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);padding:4px 11px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;transition:background .12s ease,color .12s ease}
.gm-mode-btn+.gm-mode-btn{border-left:.5px solid var(--dsw-alias-border-l1)}
.gm-mode-btn:hover{color:var(--dsw-alias-label-primary)}
.gm-mode-btn[aria-selected=true]{background:color-mix(in srgb,var(--dsw-alias-label-primary) 15%,transparent);color:var(--dsw-alias-label-primary);font-weight:600}
.gm-mode-btn:focus-visible{outline:none;box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}
.gm-mode-badge{font-size:10px;line-height:1.5;padding:0 5px;border-radius:3px;border:.5px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent);color:var(--dsw-alias-brand-primary);font-variant-numeric:tabular-nums}
.gm-summary{gap:8px;flex-wrap:wrap}
.gm-summary-part+.gm-summary-part::before{content:'·';margin-right:8px;opacity:.45}
.gm-summary-link{border:0;background:0 0;padding:0;font:inherit;font-size:12px;cursor:pointer;color:var(--dsw-alias-state-warn-primary);text-decoration:underline;text-underline-offset:2px}
.gm-summary-link:hover{color:var(--dsw-alias-label-primary)}
.gm-summary-link:focus-visible{outline:none;border-radius:2px;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}
.gm-grow{flex:auto;min-width:0}
.gm-changes{padding:4px 16px 24px}
.gm-wt-repo{margin:6px 0 2px;border:.5px solid var(--dsw-alias-border-l1);border-radius:6px;overflow:hidden;background:var(--dsw-alias-bg-base)}
.gm-wt-head{display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;outline:none;user-select:none;background:var(--dsw-alias-bg-layer-1)}
.gm-wt-head:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}
.gm-wt-head:focus-visible{box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}
.gm-wt-name{flex:none;max-width:240px;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gm-wt-track{flex:none;display:inline-flex;gap:4px;font-size:10px;font-variant-numeric:tabular-nums}
.gm-wt-files{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.gm-wt-group{border-top:.5px solid var(--dsw-alias-border-l1)}
.gm-wt-group-title{display:flex;align-items:center;gap:6px;padding:4px 12px 3px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.gm-wt-group-count{flex:none;font-size:10px;line-height:1.5;padding:0 5px;border-radius:3px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);font-variant-numeric:tabular-nums}
.gm-wt-row{display:flex;align-items:baseline;gap:8px;padding:2px 12px 2px 24px;outline:none;cursor:pointer}
.gm-wt-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}
.gm-wt-row:focus-visible{box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}
.gm-wt-row-disabled{cursor:default;opacity:.55}
.gm-wt-row-disabled:hover{background:0 0}
.gm-wt-status{flex:none;width:16px;text-align:center;font-weight:600;font-family:var(--dsh-code-font-family,ui-monospace,SFMono-Regular,Consolas,monospace)}
.gm-wt-status-A{color:var(--dsw-alias-state-success-primary)}
.gm-wt-status-D{color:var(--dsw-alias-state-error-primary)}
.gm-wt-status-M,.gm-wt-status-R,.gm-wt-status-U{color:var(--dsw-alias-state-warn-primary)}
.gm-wt-path{flex:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsh-code-font-family,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:11px}
.gm-wt-dir{color:var(--dsw-alias-label-secondary);opacity:.85}
.gm-wt-file{color:inherit}
.gm-wt-counts{flex:none;margin-left:auto;padding-left:8px;display:inline-flex;gap:6px;font-variant-numeric:tabular-nums;font-size:11px}
.gm-wt-add{color:var(--dsw-alias-state-success-primary)}
.gm-wt-del{color:var(--dsw-alias-state-error-primary)}
.gm-wt-bin{color:var(--dsw-alias-label-secondary)}
.gm-wt-empty{padding:24px 20px;color:var(--dsw-alias-label-secondary)}
.gm-wt-error{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent)}
.gm-wt-error .gm-wt-head{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.gm-wt-error .gm-wt-name{color:var(--dsw-alias-state-error-primary)}
.gm-wt-error-msg{padding:4px 12px 6px;font-size:11px;color:var(--dsw-alias-state-error-primary);word-break:break-word}
.gm-wt-note{padding:4px 12px 6px;font-size:11px;color:var(--dsw-alias-state-warn-primary)}
.gm-summary-filtered{color:var(--dsw-alias-label-secondary)}
/* The Git log tab is a full-surface inspection view: while it is mounted the
   conversation composer is hidden so the timeline can use the whole height. The
   style tag lives inside this view, so it disappears when the user switches back
   to Chat or Trajectory. :has() keeps the rules scoped to the conversation that
   actually contains this view, so a second pane is never affected. */
[data-conversation-scroll]:has(.gm-root)>*:first-child,
[data-conversation-scroll]:has(.gm-root)>*:first-child>*:first-child{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
[data-conversation-scroll]:has(.gm-root) [data-composer-seat]{display:none!important}
@media (max-width:900px){.gm-author{display:none}}
@media (max-width:700px){.gm-branch{max-width:150px}.gm-refs{display:none}}
`

    /** 差异页签样式。 */
    const DIFF_STYLE = `
.gd-root{height:100%;min-height:0;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.5;box-sizing:border-box;background:var(--dsw-alias-bg-base)}
.gd-head{flex:none;display:flex;align-items:center;gap:8px;height:34px;padding:0 12px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.gd-name{flex:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.gd-add{flex:none;color:var(--dsw-alias-state-success-primary);font-variant-numeric:tabular-nums}
.gd-del{flex:none;color:var(--dsw-alias-state-error-primary);font-variant-numeric:tabular-nums}
.gd-body{flex:auto;min-height:0;overflow:auto;font-family:var(--dsh-code-font-family,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:12px;line-height:1.55;padding-bottom:20px}
.gd-hunk{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);padding:2px 10px;white-space:pre;overflow:hidden;text-overflow:ellipsis;border-top:.5px solid var(--dsw-alias-border-l1);border-bottom:.5px solid var(--dsw-alias-border-l1);margin-top:6px}
.gd-gap{padding:2px 12px;color:var(--dsw-alias-label-secondary);opacity:.7;font-size:11px;text-align:center;background:var(--dsw-alias-bg-layer-1)}
.gd-row{display:flex;white-space:pre}
.gd-num{flex:none;width:46px;text-align:right;padding-right:8px;color:var(--dsw-alias-label-secondary);opacity:.55;user-select:none}
.gd-sign{flex:none;width:14px;text-align:center;user-select:none;opacity:.8}
.gd-text{flex:auto;min-width:0;padding-right:12px;white-space:pre-wrap;word-break:break-all}
.gd-add-row{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent)}
.gd-del-row{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.gd-add-row .gd-sign{color:var(--dsw-alias-state-success-primary)}
.gd-del-row .gd-sign{color:var(--dsw-alias-state-error-primary)}
.gd-status{padding:14px 12px;color:var(--dsw-alias-label-secondary);font-size:12px}
.gd-error{color:var(--dsw-alias-state-error-primary)}
.gd-scope{flex:none;font-size:10px;line-height:1.6;padding:0 6px;border-radius:3px;border:.5px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent);color:var(--dsw-alias-brand-primary);white-space:nowrap}
`

    /**
     * 把 ISO 时间转成浏览器本地时区的紧凑显示。
     * @param {string} iso ISO 8601 时间。
     */
    function formatTime(iso) {
      const date = new Date(iso || '')
      if (Number.isNaN(date.getTime())) return iso || ''
      const pad = (value) => String(value).padStart(2, '0')
      const sameYear = date.getFullYear() === new Date().getFullYear()
      return sameYear
        ? `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
        : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    /**
     * 渲染带占位符的文案。
     * @param {(key: string) => string} t 翻译函数。
     * @param {string} key 文案键。
     * @param {Record<string, string|number>} [values] 占位值。
     */
    function text(t, key, values) {
      let value = t(key)
      if (values === undefined) return value
      for (const name of Object.keys(values)) {
        value = value.split(`{${name}}`).join(String(values[name]))
      }
      return value
    }

    /**
     * 渲染拉取确认模态框：遮罩 + 居中卡片，明确展示仓库数量与只读语义。
     * @param {(key: string) => string} t 翻译函数。
     * @param {number} count 仓库数量。
     * @param {() => void} onConfirm 开始拉取。
     * @param {() => void} onCancel 取消。
     */
    function renderFetchConfirm(t, count, onConfirm, onCancel) {
      return h(
        'div',
        { className: 'gm-dialog-backdrop', onClick: onCancel },
        h(
          'div',
          {
            className: 'gm-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'gm-fetch-confirm-title',
            'aria-describedby': 'gm-fetch-confirm-text',
            onClick: (event) => event.stopPropagation(),
          },
          h('h2', { id: 'gm-fetch-confirm-title', className: 'gm-dialog-title' }, t('fetch.confirmTitle')),
          h('p', { id: 'gm-fetch-confirm-text', className: 'gm-dialog-text' }, text(t, 'fetch.confirm', { count })),
          h(
            'div',
            { className: 'gm-dialog-actions' },
            h('button', { type: 'button', className: 'gm-dialog-btn', onClick: onCancel }, t('fetch.confirmNo')),
            h(
              'button',
              {
                type: 'button',
                className: 'gm-dialog-btn gm-dialog-btn-primary',
                autoFocus: true,
                onClick: onConfirm,
              },
              t('fetch.confirmYes'),
            ),
          ),
        ),
      )
    }

    /**
     * 渲染拉取结果横幅：成功、部分失败、失败都用可关闭的醒目浮层反馈。
     * @param {(key: string) => string} t 翻译函数。
     * @param {{ status: string, count?: number, failed?: number, timedOut?: boolean, message?: string }} report 拉取结果。
     * @param {() => void} onDismiss 关闭横幅。
     */
    function renderFetchToast(t, report, onDismiss) {
      const error = report.status === 'error'
      const partial = report.status === 'partial'
      const title = error
        ? t('fetch.errorTitle')
        : report.timedOut === true
          ? t('fetch.timeoutTitle')
          : partial
            ? t('fetch.partialTitle')
            : t('fetch.doneTitle')
      const detail = error
        ? text(t, 'fetch.error', { message: report.message ?? '' })
        : report.timedOut === true
          ? t('fetch.timedOut')
          : partial
            ? text(t, 'fetch.partial', { count: report.failed ?? 0 })
            : text(t, 'fetch.ok', { count: report.count ?? 0 })
      return h(
        'div',
        {
          className: `gm-fetch-toast gm-fetch-toast-${error ? 'error' : partial ? 'partial' : 'ok'}`,
          role: error ? 'alert' : 'status',
          'data-gm-fetch-report': error ? 'error' : partial ? 'partial' : 'ok',
        },
        h('span', { className: 'gm-fetch-toast-icon' }, error || partial ? h(AlertGlyph) : h(CheckGlyph)),
        h(
          'div',
          { className: 'gm-fetch-toast-body' },
          h('div', { className: 'gm-fetch-toast-title' }, title),
          h('div', { className: 'gm-fetch-toast-text' }, detail),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'gm-fetch-toast-close',
            title: t('fetch.dismiss'),
            'aria-label': t('fetch.dismiss'),
            onClick: onDismiss,
          },
          '×',
        ),
      )
    }

    /** 拉取图标。 */
    function FetchGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true, fill: 'none' },
        h('path', {
          d: 'M8 2.2v7m0 0 2.6-2.6M8 9.2 5.4 6.6M2.6 10.6v1.3a1.5 1.5 0 0 0 1.5 1.5h7.8a1.5 1.5 0 0 0 1.5-1.5v-1.3',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    /** 成功状态图标。 */
    function CheckGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true, fill: 'none' },
        h('path', {
          d: 'm3.5 8.4 3 3 6-6.2',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    /** 警告/失败状态图标。 */
    function AlertGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true, fill: 'none' },
        h('path', {
          d: 'M8 2.2 1.8 13.4h12.4z',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M8 6.2v3.2', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
        h('circle', { cx: 8, cy: 11.6, r: 0.8, fill: 'currentColor' }),
      )
    }

    /** 回到 HEAD 图标。 */
    function TargetGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true, fill: 'none' },
        h('circle', { cx: 8, cy: 8, r: 4.2, stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', {
          d: 'M8 1.6v2.4M8 12v2.4M1.6 8h2.4M12 8h2.4',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinecap: 'round',
        }),
      )
    }

    /** 折叠指示图标。 */
    function CaretGlyph({ collapsed }) {
      return h(
        'svg',
        { viewBox: '0 0 12 12', width: 12, height: 12, className: 'gm-caret', 'aria-hidden': true },
        h('path', {
          d: collapsed ? 'M4.2 2.6 7.6 6l-3.4 3.4' : 'M2.6 4.2 6 7.6l3.4-3.4',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    /** 回到顶部图标。 */
    function TopGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true, fill: 'none' },
        h('path', {
          d: 'M8 13V4.4M8 4.4 4.6 7.8M8 4.4l3.4 3.4M3 2.4h10',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    /** 刷新图标。 */
    function RefreshGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true, fill: 'none' },
        h('path', {
          d: 'M13 8a5 5 0 1 1-1.6-3.7M13 2.6V6h-3.4',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    /**
     * 过滤引用标签，去掉与分支来源重复的项。
     * @param {string} refs git 的 %D 输出。
     * @param {string} source 已显示的分支来源。
     */
    function extraRefs(refs, source) {
      if (refs === '') return ''
      return refs
        .split(',')
        .map((item) => item.trim().replace(/^HEAD -> /, ''))
        .filter((item) => item !== '' && item !== source && item !== `origin/${source}`)
        .join(', ')
    }

    /** 工作区状态缓存：切回视图时先用旧数据渲染，再后台刷新。 */
    const stateCache = new Map()
    /** 工作区改动缓存：切模式或重挂载时先用旧数据渲染。 */
    const changesCache = new Map()
    /** 提交详情缓存：重复展开同一条提交不再请求。 */
    const detailCache = new Map()
    /** 状态缓存条目上限。 */
    const STATE_CACHE_LIMIT = 4
    /** 工作区改动缓存条目上限。 */
    const CHANGES_CACHE_LIMIT = 4
    /** 详情缓存条目上限。 */
    const DETAIL_CACHE_LIMIT = 120

    /**
     * 写入有上限的缓存，超出时淘汰最旧的条目。
     * @param {Map<string, unknown>} cache 目标缓存。
     * @param {string} key 键。
     * @param {unknown} value 值。
     * @param {number} limit 条目上限。
     */
    function remember(cache, key, value, limit) {
      cache.set(key, value)
      while (cache.size > limit) {
        const oldest = cache.keys().next().value
        if (oldest === undefined) break
        cache.delete(oldest)
      }
    }

    /**
     * 写入有上限的对象状态，按插入顺序淘汰最早的详情。
     * @param {Record<string, unknown>} record 目标状态对象。
     * @param {string} key 条目键。
     * @param {unknown} value 条目值。
     * @param {number} limit 条目上限。
     * @returns {Record<string, unknown>} 新状态对象。
     */
    function rememberRecord(record, key, value, limit) {
      const next = { ...record, [key]: value }
      const keys = Object.keys(next)
      while (keys.length > limit) {
        const oldest = keys.shift()
        if (oldest !== undefined) delete next[oldest]
      }
      return next
    }

    /**
     * 判断提交引用是否指向当前 HEAD，包括 detached HEAD。
     * @param {string} refs git 的 %D 输出。
     */
    function isHeadRef(refs) {
      return refs
        .split(',')
        .map((item) => item.trim())
        .some((item) => item === 'HEAD' || item.startsWith('HEAD -> '))
    }

    /**
     * 读取持久化的视图模式；非法值（含存储不可用）回落「提交历史」。
     * @returns {'history' | 'changes'} 视图模式。
     */
    function readViewMode() {
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(VIEW_MODE_KEY)
          if (raw === 'history' || raw === 'changes') return raw
        }
      } catch {
        // 隐私模式读不到本地存储时使用默认模式。
      }
      return 'history'
    }

    /** 差异页签参数持久化键：DSH 只持久化页签的 contentId/title，不持久化 navigation.params。 */
    const TAB_PARAMS_KEY = 'dsh-git-multirepo:tab-params:v1'
    /** 最多记住多少个差异页签的定位参数。 */
    const TAB_PARAMS_LIMIT = 100
    /** 单个差异页签最多渲染的 diff 行数（服务端上限 5000，这里再兜一层）。 */
    const DIFF_RENDER_LIMIT = 3000
    /** 提交详情里最多渲染的文件条目数（服务端上限 500）。 */
    const FILES_RENDER_LIMIT = 500

    /**
     * 记住一个差异页签的定位参数，供同源页面重载后恢复
     * （桌面端冷启动换随机端口时 origin 变化，本地存储无法跨 origin，属已知限制）。
     * @param {string} contentId 页签持久化 id。
     * @param {{ repo: string, hash?: string, file: string, scope?: string }} params 定位参数。
     */
    function rememberTabParams(contentId, params) {
      if (contentId === '' || typeof localStorage === 'undefined') return
      try {
        const raw = localStorage.getItem(TAB_PARAMS_KEY)
        const parsed = raw === null ? {} : JSON.parse(raw)
        const map = typeof parsed === 'object' && parsed !== null ? parsed : {}
        map[contentId] = params
        const keys = Object.keys(map)
        while (keys.length > TAB_PARAMS_LIMIT) {
          const oldest = keys.shift()
          if (oldest !== undefined) delete map[oldest]
        }
        localStorage.setItem(TAB_PARAMS_KEY, JSON.stringify(map))
      } catch {
        // 隐私模式或存储配额不足时放弃持久化；页签重开时仍会显示缺参提示。
      }
    }

    /**
     * 读取一个差异页签记住的定位参数。
     * @param {string} contentId 页签持久化 id。
     * @returns {{ repo: string, hash?: string, file: string, scope?: string } | undefined} 定位参数。
     */
    function recallTabParams(contentId) {
      if (contentId === '' || typeof localStorage === 'undefined') return undefined
      try {
        const raw = localStorage.getItem(TAB_PARAMS_KEY)
        if (raw === null) return undefined
        const parsed = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null) return undefined
        const params = parsed[contentId]
        return typeof params === 'object' && params !== null ? params : undefined
      } catch {
        return undefined
      }
    }

    /** Empty navigation parameters are also used by the host on restoration. */
    function tabParams(tab) {
      const params = tab.navigation?.params
      if (params !== null && typeof params === 'object' && Object.keys(params).length > 0) return params
      const contentId = typeof tab.contentId === 'string' ? tab.contentId : ''
      return recallTabParams(contentId) ?? {}
    }

    /**
     * 按仓库路径稳定分配配色，避免重扫/新增仓库后颜色整体位移。
     * @param {string} value 仓库路径或名字。
     */
    function paletteIndex(value) {
      let hash = 0
      for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0
      }
      return hash % PALETTE.length
    }

    /** 服务端错误码到文案键的映射。 */
    const ERROR_CODE_KEYS = {
      'outside-workspace': 'error.outsideWorkspace',
      'invalid-root': 'error.invalidRoot',
      'invalid-repo': 'error.invalidRepo',
      'invalid-hash': 'error.invalidHash',
      'invalid-file': 'error.invalidFile',
      'fetch-in-progress': 'error.fetchInProgress',
      'commit-not-found': 'error.commitNotFound',
      'patch-not-found': 'error.patchNotFound',
      'unsupported-object-format': 'error.unsupportedObjectFormat',
      'repository-boundary': 'error.repositoryBoundary',
      'unsafe-config': 'error.unsafeConfig',
      'offline-object-missing': 'error.offlineObjectMissing',
      'resource-limit': 'error.resourceLimit',
      busy: 'error.busy',
      'unsupported-git-version': 'error.unsupportedGitVersion',
      'request-cancelled': 'error.requestCancelled',
      'request-failed': 'error.requestFailed',
    }

    /**
     * 把一个失败响应转换成可读文案：优先按服务端错误码本地化，否则回退到 HTTP 状态。
     * @param {Response} response 失败响应。
     * @param {(key: string) => string} t 翻译函数。
     */
    async function failureMessage(response, t) {
      let code = ''
      try {
        const body = await response.clone().json()
        if (typeof body?.error === 'string') code = body.error
      } catch {
        // 非 JSON 响应按 HTTP 状态兜底。
      }
      const key = ERROR_CODE_KEYS[code]
      if (key !== undefined) return t(key)
      return text(t, 'error.http', { status: response.status })
    }

    /**
     * 计算一条提交应显示的分支标注。
     * @param {any} commit 提交记录。
     * @param {any} repo 所属仓库信息。
     * @param {boolean} allBranches 是否「所有分支」模式。
     */
    function branchLabel(commit, repo, allBranches) {
      if (!allBranches) return repo === undefined ? '' : repo.branch || ''
      const source = commit.source ?? ''
      if (source === '' || source === 'HEAD') return ''
      if (source.startsWith('refs/remotes/')) return source.slice('refs/remotes/'.length)
      if (source.startsWith('refs/heads/')) return source.slice('refs/heads/'.length)
      if (source.startsWith('refs/tags/')) return `tag:${source.slice('refs/tags/'.length)}`
      return source
    }

    /**
     * 差异页签类型定义。
     * @param {(key: string) => string} t 翻译函数。
     */
    function diffDefinition(t) {
      return {
        id: DIFF_ID,
        kind: DIFF_KIND,
        priority: 'builtin',
        multiple: true,
        title: () => t('diff.title'),
      }
    }

    /**
     * 解析 hunk 头里的新旧起始行号与行数。
     * @param {string} header hunk 头。
     */
    function hunkInfo(header) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header)
      if (match === null) return { oldLine: 1, oldCount: 0, newLine: 1, newCount: 0 }
      return {
        oldLine: Number(match[1]),
        oldCount: match[2] === undefined ? 1 : Number(match[2]),
        newLine: Number(match[3]),
        newCount: match[4] === undefined ? 1 : Number(match[4]),
      }
    }

    /**
     * 构造差异页签组件：提交 patch 与工作区改动（scope）共用同一种页签。
     * @param {(key: string) => string} t 翻译函数。
     */
    function createDiffView(t) {
      /** 单个文件在一次提交或某类工作区改动中的 unified diff。 */
      return function DiffView({ useTabInfo }) {
        const { tab } = useTabInfo()
        const contentId = typeof tab.contentId === 'string' ? tab.contentId : ''
        // 同源页面重载后 DSH 不恢复 navigation.params，用本地记住的定位参数兜底。
        const params = tabParams(tab)
        const repo = typeof params.repo === 'string' ? params.repo : ''
        const hash = typeof params.hash === 'string' ? params.hash : ''
        const file = typeof params.file === 'string' ? params.file : ''
        // 工作区差异页签用 scope 定位，没有提交 hash；旧页签参数没有合法 scope，仍走提交 patch。
        const scope = WORKTREE_SCOPES.includes(params.scope) ? params.scope : ''
        const isWorktree = scope !== ''
        const [state, setState] = useState({ status: 'loading' })

        useEffect(() => {
          if (contentId === '' || repo === '' || file === '') return
          if (isWorktree) rememberTabParams(contentId, { repo, scope, file })
          else if (hash !== '') rememberTabParams(contentId, { repo, hash, file })
        }, [contentId, repo, hash, file, scope])

        useEffect(() => {
          if (repo === '' || file === '' || (!isWorktree && hash === '')) {
            setState({ status: 'error', message: t('diff.missingParams') })
            return undefined
          }
          const controller = new AbortController()
          setState({ status: 'loading' })
          const query = isWorktree
            ? new URLSearchParams({ repo, scope, file })
            : new URLSearchParams({ repo, hash, file })
          fetch(`${isWorktree ? WORKTREE_DIFF_URL : PATCH_URL}?${query.toString()}`, { signal: controller.signal })
            .then(async (response) => {
              if (!response.ok) throw new Error(await failureMessage(response, t))
              return response.json()
            })
            .then((data) => {
              if (!controller.signal.aborted) setState({ status: 'ready', data })
            })
            .catch((error) => {
              if (controller.signal.aborted) return
              setState({
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
              })
            })
          return () => controller.abort()
        }, [repo, hash, file, scope])

        const hasAdditions = state.status === 'ready' && typeof state.data.additions === 'number'
        const hasDeletions =
          state.status === 'ready' && scope !== 'untracked' && typeof state.data.deletions === 'number'
        const head = h(
          'div',
          { className: 'gd-head' },
          h('span', { className: 'gd-name', title: file }, file),
          isWorktree ? h('span', { className: 'gd-scope' }, t(WORKTREE_SCOPE_KEYS[scope])) : null,
          hasAdditions ? h('span', { className: 'gd-add' }, `+${state.data.additions}`) : null,
          hasDeletions ? h('span', { className: 'gd-del' }, `−${state.data.deletions}`) : null,
        )

        if (state.status !== 'ready') {
          return h(
            'div',
            { className: 'gd-root' },
            h('style', null, DIFF_STYLE),
            head,
            h(
              'div',
              { className: state.status === 'error' ? 'gd-status gd-error' : 'gd-status' },
              state.status === 'error' ? text(t, 'diff.error', { message: state.message }) : t('diff.loading'),
            ),
          )
        }

        const data = state.data
        const hunks = Array.isArray(data.hunks) ? data.hunks : []
        const rows = []
        let previousOldEnd = 0
        let rendered = 0
        let renderTruncated = false
        for (const hunk of hunks) {
          if (renderTruncated) break
          const info = hunkInfo(hunk.header)
          if (previousOldEnd > 0 && info.oldLine > previousOldEnd) {
            rows.push(
              h(
                'div',
                { className: 'gd-gap', key: `g${rows.length}` },
                text(t, 'diff.gap', { count: info.oldLine - previousOldEnd }),
              ),
            )
          }
          rows.push(h('div', { className: 'gd-hunk', key: `h${rows.length}` }, hunk.header))
          let oldLine = info.oldLine
          let newLine = info.newLine
          const lines = Array.isArray(hunk.lines) ? hunk.lines : []
          for (const line of lines) {
            if (rendered >= DIFF_RENDER_LIMIT) {
              renderTruncated = true
              break
            }
            let number
            if (line.type === 'add') {
              number = newLine
              newLine += 1
            } else if (line.type === 'del') {
              number = oldLine
              oldLine += 1
            } else {
              number = newLine
              oldLine += 1
              newLine += 1
            }
            rows.push(
              h(
                'div',
                { className: `gd-row gd-${line.type}-row`, key: `l${rows.length}` },
                h('span', { className: 'gd-num' }, String(number)),
                h('span', { className: 'gd-sign' }, line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '),
                h('span', { className: 'gd-text' }, line.text),
              ),
            )
            rendered += 1
          }
          previousOldEnd = info.oldLine + info.oldCount
        }

        // 无法预览的差异原因优先展示（二进制/过大/符号链接），工作区差异用改动文案。
        const notice = data.tooLarge
          ? t('changes.tooLarge')
          : data.symbolicLink
            ? t('changes.symbolicLink')
            : data.binary
              ? t(isWorktree ? 'changes.binary' : 'diff.binary')
              : ''
        const truncated = data.truncated || renderTruncated
        let body
        if (rows.length === 0) {
          body = h(
            'div',
            { className: 'gd-status' },
            notice !== '' ? notice : t(isWorktree ? 'changes.diffEmpty' : 'diff.empty'),
          )
        } else body = h('div', { className: 'gd-body' }, rows)

        return h(
          'div',
          { className: 'gd-root' },
          h('style', null, DIFF_STYLE),
          head,
          notice !== '' && rows.length > 0 ? h('div', { className: 'gd-status' }, notice) : null,
          truncated ? h('div', { className: 'gd-status' }, t('diff.truncated')) : null,
          body,
        )
      }
    }

    /** 差异页签的标题：文件名。 */
    function DiffTitle({ useTabInfo }) {
      const { tab } = useTabInfo()
      const params = tabParams(tab)
      const file = typeof params.file === 'string' ? params.file : ''
      const name = file.split(/[/\\]/).pop() ?? ''
      return h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, name)
    }

    /**
     * 构造视图组件；t 以闭包传入。
     * @param {(key: string) => string} t 翻译函数。
     * @param {(repo: string, hash: string, file: string) => void} openDiff 打开提交差异页签。
     * @param {(repo: string, scope: string, file: string) => void} openWorktreeDiff 打开工作区差异页签。
     */
    function createView(t, openDiff, openWorktreeDiff) {
      /** 汇总一个仓库四类改动的文件数（不含被搜索过滤掉的文件）。 */
      const changeRepoFiles = (repo) => {
        const count = (list) => (Array.isArray(list) ? list.length : 0)
        return count(repo.conflicted) + count(repo.staged) + count(repo.unstaged) + count(repo.untracked)
      }
      /** 所有仓库提交合并成的一条时间线。 */
      return function GitView({ sessionId, useSessions }) {
        const cwd = useSessions((sessions) => sessions.byId[sessionId]?.cwd)

        const [allBranches, setAllBranches] = useState(false)
        const [reloadToken, setReloadToken] = useState(0)
        const [query, setQuery] = useState('')
        const [hiddenRepos, setHiddenRepos] = useState([])
        const [timeRange, setTimeRange] = useState('all')
        const [collapsedRemote, setCollapsedRemote] = useState(true)
        const [collapsedLocal, setCollapsedLocal] = useState(false)
        const [expandedKey, setExpandedKey] = useState(null)
        const [details, setDetails] = useState({})
        const [fetching, setFetching] = useState(false)
        const [fetchReport, setFetchReport] = useState(null)
        const [state, setState] = useState({ status: 'idle', data: null, failure: null, key: '' })
        const [confirmingFetch, setConfirmingFetch] = useState(false)
        const [openDiffError, setOpenDiffError] = useState(null)
        // 视图模式：提交历史时间线或工作区改动；首次挂载时从本地存储恢复。
        const [mode, setMode] = useState(readViewMode)
        const [changesState, setChangesState] = useState({ status: 'idle', data: null, failure: null, key: '' })
        const [collapsedChangeRepos, setCollapsedChangeRepos] = useState([])
        const viewKey = `${typeof cwd === 'string' ? cwd : ''}|${allBranches ? 'all' : 'head'}`
        const listRef = useRef(null)
        const fetchAbortRef = useRef(null)
        const changesAbortRef = useRef(null)
        const detailAbortsRef = useRef(new Map())
        const viewKeyRef = useRef(viewKey)
        const workspaceKeyRef = useRef(cwd)
        // Keep the current view identity available to async callbacks immediately after a render.
        viewKeyRef.current = viewKey
        workspaceKeyRef.current = cwd

        /** 打开右侧栏差异页签；失败时把原因显示在视图里而不是抛出。 */
        const openDiffSafe = useCallback(
          (repo, hash, file) => {
            try {
              openDiff(repo, hash, file)
            } catch (error) {
              setOpenDiffError(error instanceof Error ? error.message : String(error))
            }
          },
          [openDiff],
        )

        /** 打开工作区差异页签；失败时把原因显示在视图里而不是抛出。 */
        const openChangeDiffSafe = useCallback(
          (repo, scope, file) => {
            try {
              openWorktreeDiff(repo, scope, file)
            } catch (error) {
              setOpenDiffError(error instanceof Error ? error.message : String(error))
            }
          },
          [openWorktreeDiff],
        )

        useEffect(
          () => () => {
            fetchAbortRef.current?.abort()
            changesAbortRef.current?.abort()
            for (const controller of detailAbortsRef.current.values()) controller.abort()
            detailAbortsRef.current.clear()
          },
          [],
        )

        // 确认拉取以模态框呈现，Esc 需要能关闭；测试环境的 DOM 桩下跳过绑定。
        useEffect(() => {
          if (!confirmingFetch) return undefined
          if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined
          const onKeyDown = (event) => {
            if (event.key === 'Escape') setConfirmingFetch(false)
          }
          document.addEventListener('keydown', onKeyDown)
          return () => document.removeEventListener('keydown', onKeyDown)
        }, [confirmingFetch])

        // A view instance can be reused while its session cwd changes. Cancel all work and
        // clear state tied to the previous workspace before accepting the new responses.
        useEffect(() => {
          fetchAbortRef.current?.abort()
          fetchAbortRef.current = null
          changesAbortRef.current?.abort()
          changesAbortRef.current = null
          for (const controller of detailAbortsRef.current.values()) controller.abort()
          detailAbortsRef.current.clear()
          setFetching(false)
          setHiddenRepos([])
          setExpandedKey(null)
          setDetails({})
          setFetchReport(null)
          setConfirmingFetch(false)
          setOpenDiffError(null)
          setCollapsedChangeRepos([])
          setChangesState({ status: 'idle', data: null, failure: null, key: '' })
        }, [cwd])

        // Search and time filters belong to a workspace, so do not carry them into a new cwd.
        useEffect(() => {
          setQuery('')
          setTimeRange('all')
        }, [cwd])

        useEffect(() => {
          if (typeof cwd !== 'string' || cwd === '') {
            setState({ status: 'no-workspace', data: null, failure: null, key: viewKey })
            return undefined
          }
          const controller = new AbortController()
          const slotKey = viewKey
          const cached = stateCache.get(slotKey)
          setState({
            status: 'loading',
            data: cached ?? null,
            failure: null,
            key: slotKey,
          })
          const params = new URLSearchParams({
            root: cwd,
            limit: String(DEFAULT_LIMIT),
            all: allBranches ? '1' : '0',
          })
          fetch(`${STATE_URL}?${params.toString()}`, { signal: controller.signal })
            .then(async (response) => {
              if (!response.ok) throw new Error(await failureMessage(response, t))
              return response.json()
            })
            .then((value) => {
              if (controller.signal.aborted || viewKeyRef.current !== slotKey) return
              remember(stateCache, slotKey, value, STATE_CACHE_LIMIT)
              setState({ status: 'ready', data: value, failure: null, key: slotKey })
            })
            .catch((error) => {
              if (controller.signal.aborted || viewKeyRef.current !== slotKey) return
              setState({
                status: 'error',
                data: null,
                failure: error instanceof Error ? error.message : String(error),
                key: slotKey,
              })
            })
          return () => controller.abort()
        }, [cwd, allBranches, reloadToken])

        // 工作区改动只在「改动」模式下请求：切模式或切 cwd 时 abort，并先用缓存渲染。
        useEffect(() => {
          if (mode !== 'changes') {
            changesAbortRef.current?.abort()
            changesAbortRef.current = null
            return undefined
          }
          if (typeof cwd !== 'string' || cwd === '') {
            setChangesState({ status: 'no-workspace', data: null, failure: null, key: '' })
            return undefined
          }
          const controller = new AbortController()
          changesAbortRef.current?.abort()
          changesAbortRef.current = controller
          const slotKey = cwd
          const cached = changesCache.get(slotKey)
          setChangesState({ status: 'loading', data: cached ?? null, failure: null, key: slotKey })
          const params = new URLSearchParams({ root: cwd })
          fetch(`${WORKTREE_URL}?${params.toString()}`, { signal: controller.signal })
            .then(async (response) => {
              if (!response.ok) throw new Error(await failureMessage(response, t))
              return response.json()
            })
            .then((value) => {
              if (controller.signal.aborted || workspaceKeyRef.current !== slotKey) return
              remember(changesCache, slotKey, value, CHANGES_CACHE_LIMIT)
              setChangesState({ status: 'ready', data: value, failure: null, key: slotKey })
            })
            .catch((error) => {
              if (controller.signal.aborted || workspaceKeyRef.current !== slotKey) return
              setChangesState({
                status: 'error',
                data: null,
                failure: error instanceof Error ? error.message : String(error),
                key: slotKey,
              })
            })
            .finally(() => {
              if (changesAbortRef.current === controller) changesAbortRef.current = null
            })
          return () => controller.abort()
        }, [cwd, mode, reloadToken])

        const cacheKey = viewKey
        const data = state.status === 'error'
          ? null
          : state.key === cacheKey ? state.data ?? stateCache.get(cacheKey) ?? null : stateCache.get(cacheKey) ?? null
        const repos = data?.repos ?? []

        const changesCacheKey = typeof cwd === 'string' ? cwd : ''
        const changesData =
          changesState.status === 'error'
            ? null
            : changesState.key === changesCacheKey
              ? changesState.data ?? changesCache.get(changesCacheKey) ?? null
              : changesCache.get(changesCacheKey) ?? null
        const changeRepos = Array.isArray(changesData?.repos) ? changesData.repos : []

        const repoInfo = useMemo(() => {
          const map = new Map()
          for (const repo of repos) map.set(repo.name, repo)
          return map
        }, [data])

        const activeHiddenRepos = useMemo(
          () => hiddenRepos.filter((name) => repoInfo.has(name)),
          [hiddenRepos, repoInfo],
        )

        const changeRepoInfo = useMemo(() => {
          const map = new Map()
          for (const repo of changeRepos) map.set(repo.name, repo)
          return map
        }, [changesData])

        const activeHiddenChangeRepos = useMemo(
          () => hiddenRepos.filter((name) => changeRepoInfo.has(name)),
          [hiddenRepos, changeRepoInfo],
        )

        const colors = useMemo(() => {
          const map = new Map()
          for (const repo of repos) map.set(repo.name, PALETTE[paletteIndex(repo.path ?? repo.name)])
          for (const repo of changeRepos) map.set(repo.name, PALETTE[paletteIndex(repo.path ?? repo.name)])
          return map
        }, [data, changesData])

        /** 汇总改动文件数/增删行数，供模式徽标与摘要栏使用。 */
        const changeTotals = useMemo(() => {
          let insertions = 0
          let deletions = 0
          let files = 0
          let dirty = 0
          let clean = 0
          for (const repo of changeRepos) {
            const totals = repo.totals ?? {}
            if (typeof totals.insertions === 'number') insertions += totals.insertions
            if (typeof totals.deletions === 'number') deletions += totals.deletions
            const repoFiles = changeRepoFiles(repo)
            files += repoFiles
            const repoError = typeof repo.error === 'string' && repo.error !== ''
            if (!repoError) {
              if (repoFiles > 0) dirty += 1
              else clean += 1
            }
          }
          if (typeof changesData?.totalFiles === 'number') files = changesData.totalFiles
          if (typeof changesData?.dirtyRepos === 'number') dirty = changesData.dirtyRepos
          if (typeof changesData?.cleanRepos === 'number') clean = changesData.cleanRepos
          return { insertions, deletions, files, dirty, clean }
        }, [changesData])

        /** 改动视图按仓库分组的可见结果：错误仓库在前，再按有改动仓库。 */
        const changeGroups = useMemo(() => {
          const needle = query.trim().toLowerCase()
          const hidden = new Set(activeHiddenChangeRepos)
          const errors = []
          const active = []
          for (const repo of changeRepos) {
            if (hidden.has(repo.name)) continue
            const repoError = typeof repo.error === 'string' && repo.error !== ''
            const repoHit =
              needle === '' ||
              String(repo.name).toLowerCase().includes(needle) ||
              String(repo.path ?? '').toLowerCase().includes(needle)
            const keep = (file) =>
              needle === '' || repoHit || String(file.path ?? '').toLowerCase().includes(needle)
            const lists = {
              conflicted: (Array.isArray(repo.conflicted) ? repo.conflicted : []).filter(keep),
              staged: (Array.isArray(repo.staged) ? repo.staged : []).filter(keep),
              unstaged: (Array.isArray(repo.unstaged) ? repo.unstaged : []).filter(keep),
              untracked: (Array.isArray(repo.untracked) ? repo.untracked : []).filter(keep),
            }
            const visibleFiles =
              lists.conflicted.length + lists.staged.length + lists.unstaged.length + lists.untracked.length
            const group = { repo, repoError, ...lists }
            if (repoError) {
              if (repoHit) errors.push(group)
              continue
            }
            if (visibleFiles === 0) continue
            active.push(group)
          }
          return [...errors, ...active]
        }, [changesData, query, activeHiddenChangeRepos])

        const changesBadge = changeTotals.files > 0 ? changeTotals.files : null

        const repoPaths = useMemo(() => {
          const map = new Map()
          for (const repo of repos) map.set(repo.name, repo.path)
          return map
        }, [data])

        /** 详情/展开状态键必须包含仓库真实路径，避免同名仓库跨工作区复用状态。 */
        const getDetailKey = useCallback(
          (commit) => `${repoPaths.get(commit.repo) ?? cwd ?? commit.repo}:${commit.hash}`,
          [repoPaths, cwd],
        )

        const cutoff = useMemo(() => {
          if (timeRange === 'all') return null
          const now = new Date()
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          if (timeRange === '3d') start.setDate(start.getDate() - 2)
          if (timeRange === '7d') start.setDate(start.getDate() - 6)
          return start.getTime()
        }, [timeRange])

        const visible = useMemo(() => {
          const list = data?.commits ?? []
          const needle = query.trim().toLowerCase()
          const hidden = new Set(activeHiddenRepos)
          const remote = []
          const local = []
          for (const commit of list) {
            if (hidden.has(commit.repo)) continue
            if (cutoff !== null) {
              const time = new Date(commit.committerDate || commit.date).getTime()
              if (!Number.isFinite(time) || time < cutoff) continue
            }
            if (needle !== '') {
              const hit =
                commit.subject.toLowerCase().includes(needle) ||
                commit.author.toLowerCase().includes(needle) ||
                commit.repo.toLowerCase().includes(needle) ||
                commit.short.toLowerCase().includes(needle) ||
                commit.refs.toLowerCase().includes(needle)
              if (!hit) continue
            }
            if (commit.remoteOnly === true) remote.push(commit)
            else local.push(commit)
          }
          return { remote, local }
        }, [data, query, activeHiddenRepos, cutoff])

        const commits = useMemo(() => [...visible.remote, ...visible.local], [visible])

        const hasCommits = useMemo(() => commits.length > 0, [commits])

        /** 找到当前列表中第一个 HEAD 提交，退回本地段或第一条。 */
        const findAnchor = useCallback((container) => {
          return (
            container.querySelector('[data-gm-head="true"]') ??
            container.querySelector('.gm-section-local') ??
            container.querySelector('.gm-row')
          )
        }, [])

        const scrollToTop = useCallback(() => {
          const container = listRef.current
          if (container === null) return
          let node = container.parentElement
          while (node !== null) {
            const style = getComputedStyle(node)
            if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
              node.scrollTop = 0
              return
            }
            node = node.parentElement
          }
          container.scrollTop = 0
        }, [])

        const scrollToHead = useCallback(() => {
          const container = listRef.current
          if (container === null) return
          const anchor = findAnchor(container)
          if (anchor === null) {
            scrollToTop()
            return
          }
          anchor.scrollIntoView({ block: 'start' })
        }, [findAnchor, scrollToTop])

        const dirtyCount = repos.filter((repo) => repo.dirty).length
        const loading = state.status === 'loading'
        const refresh = useCallback(() => setReloadToken((value) => value + 1), [])
        const toggleRepo = useCallback((name) => {
          setHiddenRepos((previous) =>
            previous.includes(name) ? previous.filter((value) => value !== name) : [...previous, name],
          )
        }, [])

        const loadDetail = useCallback(
          (key, commit, force = false) => {
            const entry = details[key]
            if (
              !force &&
              (entry?.status === 'loading' || entry?.status === 'ready' || detailCache.has(key))
            ) {
              return
            }
            const repoPath = repoPaths.get(commit.repo)
            if (repoPath === undefined) {
              setDetails((current) =>
                rememberRecord(current, key, { status: 'error', message: t('error.invalidRepo') }, DETAIL_CACHE_LIMIT),
              )
              return
            }
            if (force) detailCache.delete(key)
            // Only one commit is expanded at a time, so a detail request for a
            // different commit is stale: abort it instead of letting concurrent
            // requests pile up against the host's shared request budget.
            for (const [otherKey, otherController] of detailAbortsRef.current) {
              if (otherKey !== key) otherController.abort()
            }
            detailAbortsRef.current.get(key)?.abort()
            const controller = new AbortController()
            detailAbortsRef.current.set(key, controller)
            setDetails((current) => rememberRecord(current, key, { status: 'loading' }, DETAIL_CACHE_LIMIT))
            const params = new URLSearchParams({ repo: repoPath, hash: commit.hash })
            fetch(`${COMMIT_URL}?${params.toString()}`, { signal: controller.signal })
              .then(async (response) => {
                if (!response.ok) throw new Error(await failureMessage(response, t))
                return response.json()
              })
              .then((payload) => {
                if (controller.signal.aborted || workspaceKeyRef.current !== cwd) return
                remember(detailCache, key, payload, DETAIL_CACHE_LIMIT)
                setDetails((current) =>
                  rememberRecord(current, key, { status: 'ready', data: payload }, DETAIL_CACHE_LIMIT),
                )
              })
              .catch((error) => {
                if (controller.signal.aborted || workspaceKeyRef.current !== cwd) return
                setDetails((current) =>
                  rememberRecord(
                    current,
                    key,
                    { status: 'error', message: error instanceof Error ? error.message : String(error) },
                    DETAIL_CACHE_LIMIT,
                  ),
                )
              })
              .finally(() => {
                if (detailAbortsRef.current.get(key) === controller) detailAbortsRef.current.delete(key)
              })
          },
          [repoPaths, details, t, cwd],
        )

        const toggleCommit = useCallback(
          (commit) => {
            const key = getDetailKey(commit)
            setExpandedKey((current) => (current === key ? null : key))
            loadDetail(key, commit)
          },
          [getDetailKey, loadDetail],
        )

        const runFetch = useCallback(() => {
          if (typeof cwd !== 'string' || cwd === '') return
          const requestWorkspace = cwd
          fetchAbortRef.current?.abort()
          const controller = new AbortController()
          fetchAbortRef.current = controller
          setConfirmingFetch(false)
          setFetching(true)
          setFetchReport(null)
          const params = new URLSearchParams({ root: cwd })
          fetch(`${FETCH_URL}?${params.toString()}`, { method: 'POST', signal: controller.signal })
            .then(async (response) => {
              if (!response.ok) throw new Error(await failureMessage(response, t))
              return response.json()
            })
            .then((report) => {
              if (controller.signal.aborted || workspaceKeyRef.current !== requestWorkspace) return
              setFetchReport({
                status: (report.failed ?? 0) > 0 ? 'partial' : 'ok',
                count: report.results?.length ?? 0,
                failed: report.failed ?? 0,
                timedOut: report.timedOut === true,
              })
              setExpandedKey(null)
              setDetails({})
              setReloadToken((value) => value + 1)
            })
            .catch((error) => {
              if (controller.signal.aborted || workspaceKeyRef.current !== requestWorkspace) return
              setFetchReport({
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
              })
            })
            .finally(() => {
              if (fetchAbortRef.current !== controller || workspaceKeyRef.current !== requestWorkspace) return
              fetchAbortRef.current = null
              setFetching(false)
            })
        }, [cwd, t])

        /** 切换视图模式并持久化；刷新页面后仍停留在同一模式。 */
        const switchMode = useCallback((next) => {
          setMode(next)
          try {
            localStorage.setItem(VIEW_MODE_KEY, next)
          } catch {
            // 存储不可用时只在当前会话内切换。
          }
        }, [])

        const modeSeg = h(
          'div',
          { className: 'gm-mode', role: 'tablist', 'aria-label': t('mode.hint') },
          h(
            'button',
            {
              type: 'button',
              role: 'tab',
              className: 'gm-mode-btn',
              'aria-selected': mode === 'history',
              'data-gm-mode': 'history',
              title: t('mode.historyHint'),
              onClick: () => switchMode('history'),
            },
            t('mode.history'),
          ),
          h(
            'button',
            {
              type: 'button',
              role: 'tab',
              className: 'gm-mode-btn',
              'aria-selected': mode === 'changes',
              'data-gm-mode': 'changes',
              title: t('mode.changesHint'),
              onClick: () => switchMode('changes'),
            },
            t('mode.changes'),
            changesBadge === null ? null : h('span', { className: 'gm-mode-badge' }, String(changesBadge)),
          ),
        )

        const branchSeg = h(
          'div',
          { className: 'gm-seg', role: 'group', key: 'branch-seg', title: allBranches ? t('branch.allHint') : t('branch.currentHint') },
          h(
            'button',
            {
              type: 'button',
              'aria-pressed': !allBranches,
              title: t('branch.currentHint'),
              onClick: () => {
                setAllBranches(false)
                setExpandedKey(null)
              },
            },
            t('branch.current'),
          ),
          h(
            'button',
            {
              type: 'button',
              'aria-pressed': allBranches,
              title: t('branch.allHint'),
              onClick: () => {
                setAllBranches(true)
                setExpandedKey(null)
              },
            },
            t('branch.all'),
          ),
        )

        const fetchButton = h(
          'button',
          {
            type: 'button',
            className: 'gm-tool',
            key: 'fetch',
            title: t('action.fetchHint'),
            'aria-busy': fetching,
            disabled: loading || fetching,
            onClick: () => {
              if (repos.length > 0) setConfirmingFetch(true)
              else runFetch()
            },
          },
          h(FetchGlyph),
          fetching ? t('action.fetching') : t('action.fetch'),
        )

        const gotoHeadButton = h(
          'button',
          {
            type: 'button',
            className: 'gm-tool',
            key: 'goto-head',
            title: hasCommits ? t('action.gotoHead') : t('action.gotoHeadMissing'),
            disabled: !hasCommits,
            onClick: scrollToHead,
          },
          h(TargetGlyph),
          t('action.gotoHead'),
        )

        const gotoTopButton = h(
          'button',
          {
            type: 'button',
            className: 'gm-tool',
            key: 'goto-top',
            title: t('action.gotoTop'),
            onClick: scrollToTop,
          },
          h(TopGlyph),
          t('action.gotoTop'),
        )

        const refreshButton = h(
          'button',
          {
            type: 'button',
            className: 'gm-tool',
            key: 'refresh',
            title: mode === 'changes' ? t('changes.refreshHint') : t('action.refresh'),
            disabled: mode === 'history' && loading,
            onClick: refresh,
          },
          h(RefreshGlyph),
          t('action.refresh'),
        )

        // 历史模式保留完整工具条；改动模式只留刷新与搜索（搜索在下方 gm-bar 里）。
        const toolbarChildren = [
          h('div', { className: 'gm-heading', key: 'heading' }, h('span', { className: 'gm-heading-text' }, t('title'))),
          modeSeg,
          h('div', { className: 'gm-spacer', key: 'spacer' }),
        ]
        if (mode === 'history') toolbarChildren.push(branchSeg, fetchButton, gotoHeadButton, gotoTopButton)
        toolbarChildren.push(refreshButton)
        const toolbar = h('div', { className: 'gm-toolbar' }, toolbarChildren)

        const diffErrorBanner =
          openDiffError === null
            ? null
            : h(
                'div',
                { className: 'gm-confirm gm-confirm-error', role: 'alert' },
                h('span', { className: 'gm-confirm-text' }, text(t, 'diff.openFailed', { message: openDiffError })),
                h(
                  'button',
                  { type: 'button', className: 'gm-tool', onClick: () => setOpenDiffError(null) },
                  t('fetch.confirmNo'),
                ),
              )

        // 拉取前用模态框确认，拉取后用醒目且可关闭的横幅反馈结果。
        const fetchConfirmDialog = confirmingFetch
          ? renderFetchConfirm(t, repos.length, runFetch, () => setConfirmingFetch(false))
          : null
        const fetchToast = fetchReport === null ? null : renderFetchToast(t, fetchReport, () => setFetchReport(null))

        if (state.status === 'no-workspace') {
          return h(
            'div',
            { className: 'gm-root', 'data-gm-mode': mode },
            h('style', null, STYLE),
            toolbar,
            h('div', { className: 'gm-status', 'data-gm-state': 'no-workspace' }, t('state.noWorkspace')),
          )
        }

        // 工作区改动视图：按仓库分组展示四类改动，与提交历史完全分开渲染。
        if (mode === 'changes') {
          const collapsedKeys = new Set(collapsedChangeRepos)
          const toggleChangeRepo = (key) => {
            setCollapsedChangeRepos((previous) =>
              previous.includes(key) ? previous.filter((value) => value !== key) : [...previous, key],
            )
          }
          const renderChangeRow = (repo, scope, file) => {
            const path = typeof file.path === 'string' ? file.path : ''
            const rawStatus = typeof file.status === 'string' && file.status !== '' ? file.status.charAt(0) : ''
            const status = rawStatus !== '' ? rawStatus : scope === 'untracked' ? '?' : '•'
            const isDirectory = scope === 'untracked' && file.directory === true
            const disabled = scope === 'conflicted' || isDirectory
            const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
            const dirPart = slash > 0 ? path.slice(0, slash + 1) : ''
            const basePart = slash >= 0 ? path.slice(slash + 1) : path
            const counts = []
            if ((scope === 'staged' || scope === 'unstaged') && file.binary === true) {
              counts.push(h('span', { className: 'gm-wt-bin', key: 'bin' }, 'bin'))
            } else if (scope === 'staged' || scope === 'unstaged') {
              if (typeof file.insertions === 'number') {
                counts.push(h('span', { className: 'gm-wt-add', key: 'add' }, `+${file.insertions}`))
              }
              if (typeof file.deletions === 'number') {
                counts.push(h('span', { className: 'gm-wt-del', key: 'del' }, `−${file.deletions}`))
              }
            }
            const activate = () => openChangeDiffSafe(repo.path || repo.name, scope, path)
            const rowProps = {
              className: disabled ? 'gm-wt-row gm-wt-row-disabled' : 'gm-wt-row',
              key: `${scope}:${path}`,
              'data-gm-wt-file': path,
              'data-gm-wt-scope': scope,
            }
            if (disabled) {
              rowProps['aria-disabled'] = true
              rowProps.title =
                scope === 'conflicted' ? t('changes.conflictUnsupported') : t('changes.directory')
            } else {
              rowProps.role = 'button'
              rowProps.tabIndex = 0
              rowProps.title = t('changes.openDiff')
              rowProps.onClick = activate
              rowProps.onKeyDown = (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  activate()
                }
              }
            }
            return h(
              'div',
              rowProps,
              h(
                'span',
                { className: /^[A-Z]$/.test(status) ? `gm-wt-status gm-wt-status-${status}` : 'gm-wt-status' },
                status,
              ),
              h(
                'span',
                { className: 'gm-wt-path' },
                dirPart === '' ? null : h('span', { className: 'gm-wt-dir' }, dirPart),
                h('span', { className: 'gm-wt-file' }, basePart),
              ),
              h('span', { className: 'gm-wt-counts' }, counts),
            )
          }

          const changeItems = []
          for (const group of changeGroups) {
            const repo = group.repo
            const repoKey = repo.path ?? repo.name
            const collapsed = collapsedKeys.has(repoKey)
            const color = colors.get(repo.name) ?? PALETTE[0]
            const upstream = repo.upstream
            const totals = repo.totals ?? {}
            const headChildren = [
              h(CaretGlyph, { key: 'caret', collapsed }),
              h('span', { className: 'gm-chip-dot', key: 'dot', style: { background: color } }),
              h('span', { className: 'gm-wt-name', key: 'name', title: repo.name }, repo.name),
            ]
            if (repo.unborn === true) {
              headChildren.push(h('span', { className: 'gm-badge', key: 'unborn' }, t('changes.unborn')))
            } else if (typeof repo.branch === 'string' && repo.branch !== '') {
              headChildren.push(h('span', { className: 'gm-branch', key: 'branch', title: repo.branch }, repo.branch))
            }
            headChildren.push(h('span', { className: 'gm-grow', key: 'grow' }))
            if (upstream !== null && upstream !== undefined) {
              headChildren.push(
                h(
                  'span',
                  { className: 'gm-wt-track', key: 'track' },
                  upstream.ahead > 0
                    ? h(
                        'span',
                        { className: 'gm-up', title: text(t, 'upstream.ahead', { count: upstream.ahead }) },
                        `↑${upstream.ahead}`,
                      )
                    : null,
                  upstream.behind > 0
                    ? h(
                        'span',
                        { className: 'gm-down', title: text(t, 'upstream.behind', { count: upstream.behind }) },
                        `↓${upstream.behind}`,
                      )
                    : null,
                ),
              )
            }
            headChildren.push(
              h(
                'span',
                { className: 'gm-wt-counts', key: 'totals' },
                h('span', { className: 'gm-wt-add' }, `+${typeof totals.insertions === 'number' ? totals.insertions : 0}`),
                h('span', { className: 'gm-wt-del' }, `−${typeof totals.deletions === 'number' ? totals.deletions : 0}`),
              ),
              h(
                'span',
                { className: 'gm-wt-files', key: 'files' },
                text(t, 'changes.repoSummary', { files: changeRepoFiles(repo) }),
              ),
            )
            changeItems.push(
              h(
                'div',
                {
                  className: group.repoError ? 'gm-wt-repo gm-wt-repo-error' : 'gm-wt-repo',
                  key: repoKey,
                  'data-gm-wt-repo': repo.name,
                },
                h(
                  'div',
                  {
                    className: 'gm-wt-head',
                    role: 'button',
                    tabIndex: 0,
                    'aria-expanded': !collapsed,
                    title: typeof repo.path === 'string' ? repo.path : repo.name,
                    onClick: () => toggleChangeRepo(repoKey),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        toggleChangeRepo(repoKey)
                      }
                    },
                  },
                  headChildren,
                ),
                group.repoError
                  ? h(
                      'div',
                      { className: 'gm-wt-error-msg' },
                      `${t('repo.error')}: ${repo.error}`,
                    )
                  : null,
                !collapsed && group.repoError
                  ? h('div', { className: 'gm-wt-empty' }, t('changes.empty'))
                  : null,
                collapsed
                  ? null
                  : ['conflicted', 'staged', 'unstaged', 'untracked'].map((scope) => {
                      const files = group[scope]
                      if (!Array.isArray(files) || files.length === 0) return null
                      const labelKey =
                        scope === 'conflicted' ? 'changes.conflicted' : WORKTREE_SCOPE_KEYS[scope]
                      return h(
                        'div',
                        { className: 'gm-wt-group', key: `${repoKey}#${scope}`, 'data-gm-wt-group': scope },
                        h(
                          'div',
                          { className: 'gm-wt-group-title' },
                          t(labelKey),
                          h('span', { className: 'gm-wt-group-count' }, String(files.length)),
                        ),
                        files.map((file) => renderChangeRow(repo, scope, file)),
                      )
                    }),
                !collapsed && !group.repoError && repo.filesTruncated === true
                  ? h('div', { className: 'gm-wt-note' }, t('changes.repoTruncated'))
                  : null,
              ),
            )
          }

          const changeChips =
            changeRepos.length === 0
              ? null
              : h(
                  'div',
                  { className: 'gm-chips' },
                  changeRepos.map((repo) => {
                    const shown = !activeHiddenChangeRepos.includes(repo.name)
                    const repoError = typeof repo.error === 'string' && repo.error !== ''
                    const tone = repoError ? ' gm-chip-error' : changeRepoFiles(repo) > 0 ? ' gm-chip-dirty' : ''
                    return h(
                      'button',
                      {
                        type: 'button',
                        className: `gm-chip${tone}`,
                        key: repo.path ?? repo.name,
                        'aria-pressed': shown,
                        title: repoError
                          ? `${repo.name} · ${t('repo.error')}: ${repo.error}`
                          : `${repo.name} · ${repo.branch ?? ''}`,
                        onClick: () => toggleRepo(repo.name),
                      },
                      h('span', {
                        className: 'gm-chip-dot',
                        style: { background: colors.get(repo.name) ?? PALETTE[0] },
                      }),
                      repo.name,
                      repo.upstream === null || repo.upstream === undefined
                        ? null
                        : h(
                            'span',
                            { className: 'gm-chip-track' },
                            repo.upstream.ahead > 0
                              ? h(
                                  'span',
                                  { className: 'gm-up', title: text(t, 'upstream.ahead', { count: repo.upstream.ahead }) },
                                  `↑${repo.upstream.ahead}`,
                                )
                              : null,
                            repo.upstream.behind > 0
                              ? h(
                                  'span',
                                  { className: 'gm-down', title: text(t, 'upstream.behind', { count: repo.upstream.behind }) },
                                  `↓${repo.upstream.behind}`,
                                )
                              : null,
                          ),
                    )
                  }),
                  activeHiddenChangeRepos.length === 0
                    ? null
                    : h(
                        'button',
                        { type: 'button', className: 'gm-chip', onClick: () => setHiddenRepos([]) },
                        t('chip.showAll'),
                      ),
                )

          const visibleFileCount = changeGroups.reduce(
            (sum, group) =>
              sum +
              group.conflicted.length +
              group.staged.length +
              group.unstaged.length +
              group.untracked.length,
            0,
          )
          const changesSummaryParts = [
            h(
              'span',
              { className: 'gm-summary-part', key: 'summary' },
              text(t, 'changes.summary', {
                repos: changeTotals.dirty,
                files: changeTotals.files,
                insertions: changeTotals.insertions,
                deletions: changeTotals.deletions,
              }),
            ),
          ]
          if (changeTotals.clean > 0) {
            changesSummaryParts.push(
              h(
                'span',
                { className: 'gm-summary-part', key: 'clean' },
                text(t, 'changes.cleanCount', { count: changeTotals.clean }),
              ),
            )
          }
          if (query.trim() !== '') {
            changesSummaryParts.push(
              h(
                'span',
                { className: 'gm-summary-part gm-summary-filtered', key: 'filtered' },
                text(t, 'summary.filtered', { count: visibleFileCount }),
              ),
            )
          }

          const changesWarnings = []
          if (activeHiddenChangeRepos.length > 0) {
            changesWarnings.push(
              h(
                'span',
                { className: 'gm-meta', key: 'hidden' },
                text(t, 'summary.hidden', { count: activeHiddenChangeRepos.length }),
              ),
            )
          }
          if (changesData?.reposTruncated === true) {
            changesWarnings.push(
              h('span', { className: 'gm-meta gm-meta-warn', key: 'repos-truncated' }, t('state.reposTruncated')),
            )
          }
          if ((changesData?.reposSkipped ?? 0) > 0) {
            changesWarnings.push(
              h(
                'span',
                { className: 'gm-meta gm-meta-warn', key: 'repos-skipped' },
                text(t, 'state.reposSkipped', { count: changesData.reposSkipped }),
              ),
            )
          }
          if (changesData?.truncated === true) {
            changesWarnings.push(
              h('span', { className: 'gm-meta gm-meta-warn', key: 'truncated' }, t('changes.truncated')),
            )
          }
          if (changesState.status === 'loading' && changesData !== null) {
            changesWarnings.push(h('span', { className: 'gm-meta', key: 'loading' }, t('changes.loading')))
          }

          const changesBar = h(
            'div',
            { className: 'gm-bar' },
            h('div', { className: 'gm-meta gm-summary' }, changesData === null ? null : changesSummaryParts),
            changesWarnings,
            h(
              'div',
              { className: 'gm-search' },
              h('input', {
                type: 'search',
                value: query,
                placeholder: t('changes.filterPlaceholder'),
                'aria-label': t('changes.filterPlaceholder'),
                onChange: (event) => setQuery(event.currentTarget.value),
              }),
            ),
          )

          let changesBody
          if (changesState.status === 'error') {
            changesBody = h(
              'div',
              { className: 'gm-status gm-status-error', 'data-gm-state': 'error' },
              text(t, 'changes.error', { message: changesState.failure ?? '' }),
            )
          } else if ((changesState.status === 'loading' || changesState.status === 'idle') && changesData === null) {
            changesBody = h('div', { className: 'gm-status', 'data-gm-state': 'loading' }, t('changes.loading'))
          } else if (changeRepos.length === 0) {
            changesBody = h('div', { className: 'gm-status', 'data-gm-state': 'empty' }, t('changes.empty'))
          } else if (changeGroups.length === 0) {
            changesBody = h(
              'div',
              { className: 'gm-status', 'data-gm-state': query.trim() !== '' ? 'no-match' : 'empty' },
              query.trim() !== '' ? t('changes.noMatch') : t('changes.empty'),
            )
          } else {
            changesBody = h(
              'div',
              { className: 'gm-list gm-changes', 'data-gm-count': changeGroups.length, ref: listRef },
              changeItems,
            )
          }

          return h(
            'div',
            { className: 'gm-root', 'data-gm-status': changesState.status, 'data-gm-mode': 'changes' },
            h('style', null, STYLE),
            toolbar,
            diffErrorBanner,
            changesBar,
            changeChips,
            changesBody,
          )
        }

        /** 渲染一条提交的详情面板。 */
        const renderDetail = (commit) => {
          const key = getDetailKey(commit)
          const entry =
            details[key] ??
            (detailCache.has(key) ? { status: 'ready', data: detailCache.get(key) } : undefined)
          if (entry === undefined || entry.status === 'loading') {
            return h('div', { className: 'gm-detail gm-detail-loading', key: `${key}#d` }, t('detail.loading'))
          }
          if (entry.status === 'error') {
            return h(
              'div',
              { className: 'gm-detail gm-detail-error', key: `${key}#d` },
              h('span', null, text(t, 'detail.error', { message: entry.message })),
              h(
                'button',
                {
                  type: 'button',
                  className: 'gm-retry',
                  onClick: (event) => {
                    event.stopPropagation()
                    loadDetail(key, commit, true)
                  },
                },
                t('detail.retry'),
              ),
            )
          }

          const info = entry.data
          const cells = []
          const field = (label, value, mono) => {
            cells.push(h('span', { className: 'gm-detail-key', key: `${label}#k` }, label))
            cells.push(
              h('span', { className: mono ? 'gm-detail-mono' : undefined, key: `${label}#v` }, value),
            )
          }
          field(t('detail.hash'), info.hash, true)
          field(t('detail.author'), `${info.author.name} <${info.author.email}>`)
          field(t('detail.authorDate'), info.author.date)
          if (info.committer.date !== info.author.date) {
            field(t('detail.commitDate'), info.committer.date)
          }
          if (info.committer.name !== info.author.name || info.committer.email !== info.author.email) {
            field(t('detail.committer'), `${info.committer.name} <${info.committer.email}>`)
          }
          if (info.refs !== '') field(t('detail.refs'), info.refs)
          if (info.parents.length > 0) {
            field(
              t('detail.parents'),
              info.parents.map((value) => value.slice(0, 10)).join('  '),
              true,
            )
          }
          field(
            t('detail.stat'),
            text(t, 'detail.statValue', {
              files: info.stat.files,
              insertions: info.stat.insertions,
              deletions: info.stat.deletions,
            }),
          )

          const message = info.body === '' ? info.subject : `${info.subject}\n\n${info.body}`

          return h(
            'div',
            { className: 'gm-detail', key: `${key}#d` },
            h('div', { className: 'gm-detail-grid' }, cells),
            h('pre', { className: 'gm-detail-message' }, message),
            info.merge === null || info.merge === undefined
              ? null
              : h(
                  'details',
                  { className: 'gm-merge-block' },
                  h(
                    'summary',
                    { className: 'gm-merge-summary' },
                    info.merge.truncated
                      ? `${text(t, 'detail.mergeIntroduced', { count: info.merge.introduced.length })} (${t('detail.mergeTruncated')})`
                      : text(t, 'detail.mergeIntroduced', { count: info.merge.introduced.length }),
                  ),
                  info.merge.introduced.length === 0
                    ? h('div', { className: 'gm-detail-empty' }, t('detail.mergeNone'))
                    : h(
                        'ul',
                        { className: 'gm-merge-list' },
                        info.merge.introduced.map((item) =>
                          h(
                            'li',
                            { className: 'gm-merge-item', key: item.hash },
                            h('span', { className: 'gm-merge-date' }, formatTime(item.committerDate || item.date)),
                            h('span', { className: 'gm-merge-subject', title: item.subject }, item.subject),
                            h('span', { className: 'gm-merge-hash' }, item.short),
                          ),
                        ),
                      ),
                ),
            h('div', { className: 'gm-detail-files-head' }, t('detail.files')),
            info.files.length === 0
              ? h('div', { className: 'gm-detail-empty' }, info.filesTruncated
                ? text(t, 'detail.filesTruncated', { count: 0 }) : t('detail.noFiles'))
              : h(
                  'ul',
                  { className: 'gm-detail-files' },
                  [
                    ...info.files.slice(0, FILES_RENDER_LIMIT).map((file) =>
                      h(
                        'li',
                        { className: 'gm-file', key: file.path },
                        h(
                          'span',
                          { className: `gm-file-status gm-file-${file.status.charAt(0)}`, title: file.status },
                          file.status.charAt(0),
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'gm-file-path gm-file-open',
                            title: t('diff.open'),
                            onClick: (event) => {
                              event.stopPropagation()
                              openDiffSafe(repoPaths.get(commit.repo) ?? '', commit.hash, file.path)
                            },
                          },
                          file.path,
                        ),
                        h('span', { className: 'gm-file-num' }, file.insertions === null ? 'bin' : `+${file.insertions}`),
                        h('span', { className: 'gm-file-del' }, file.deletions === null ? '' : `−${file.deletions}`),
                      ),
                    ),
                    info.filesTruncated === true || info.files.length > FILES_RENDER_LIMIT
                      ? h(
                          'li',
                          { className: 'gm-detail-empty', key: 'files-truncated' },
                          text(t, 'detail.filesTruncated', {
                            count: Math.min(info.files.length, FILES_RENDER_LIMIT),
                          }),
                        )
                      : null,
                  ].filter(Boolean),
                ),
          )
        }

        const items = []
        const pushRow = (commit) => {
          const key = getDetailKey(commit)
          const expanded = expandedKey === key
          const color = colors.get(commit.repo) ?? PALETTE[0]
          const source = branchLabel(commit, repoInfo.get(commit.repo), allBranches)
          const refs = extraRefs(commit.refs, source)
          const activate = () => toggleCommit(commit)
          items.push(
            h(
              'div',
              { className: 'gm-item', key },
              h(
                'div',
                {
                  className: ['gm-row', expanded ? 'gm-row-open' : '', commit.remoteOnly === true ? 'gm-row-remote' : '']
                    .filter(Boolean)
                    .join(' '),
                  role: 'button',
                  tabIndex: 0,
                  'aria-expanded': expanded,
                  title: commit.remoteOnly === true ? t('badge.remoteHint') : t('detail.expand'),
                  onClick: activate,
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      activate()
                    }
                  },
                  'data-gm-repo': commit.repo,
                  'data-gm-head': isHeadRef(commit.refs) ? 'true' : undefined,
                },
                h('span', { className: 'gm-rail', style: { background: color } }),
                h(
                  'div',
                  { className: 'gm-main' },
                  h(
                    'div',
                    { className: 'gm-line1' },
                    h('span', { className: 'gm-repo', style: { color }, title: commit.repo }, commit.repo),
                    h('span', { className: 'gm-subject' }, commit.subject),
                    h(
                      'span',
                      {
                        className: 'gm-time',
                        title: `${t('detail.authorDate')} ${commit.date} / ${t('detail.commitDate')} ${commit.committerDate}`,
                      },
                      formatTime(commit.committerDate || commit.date),
                    ),
                  ),
                  h(
                    'div',
                    { className: 'gm-line2' },
                    source === '' ? null : h('span', { className: 'gm-branch', title: source }, source),
                    isHeadRef(commit.refs)
                      ? h('span', { className: 'gm-badge gm-badge-head', title: t('badge.headHint') }, t('badge.head'))
                      : null,
                    commit.parentCount > 1
                      ? h(
                          'span',
                          { className: 'gm-merge', title: text(t, 'detail.merge', { count: commit.parentCount }) },
                          'merge',
                        )
                      : null,
                    refs === '' ? null : h('span', { className: 'gm-refs', title: commit.refs }, refs),
                    h('span', { className: 'gm-author', title: commit.author }, commit.author),
                    h('span', { className: 'gm-hash', title: commit.hash }, commit.short),
                  ),
                ),
              ),
              expanded ? renderDetail(commit) : null,
            ),
          )
        }

        if (visible.remote.length > 0) {
          items.push(
            h(
              'button',
              {
                type: 'button',
                className: 'gm-section gm-section-remote',
                key: 'sec-remote',
                'aria-expanded': !collapsedRemote,
                onClick: () => setCollapsedRemote((value) => !value),
              },
              h(CaretGlyph, { collapsed: collapsedRemote }),
              text(t, 'section.remote', { count: visible.remote.length }),
            ),
          )
          if (!collapsedRemote) for (const commit of visible.remote) pushRow(commit)
        }
        if (visible.local.length > 0) {
          items.push(
            h(
              'button',
              {
                type: 'button',
                className: 'gm-section gm-section-local',
                key: 'sec-local',
                'aria-expanded': !collapsedLocal,
                onClick: () => setCollapsedLocal((value) => !value),
              },
              h(CaretGlyph, { collapsed: collapsedLocal }),
              allBranches ? t('section.all') : t('section.local'),
            ),
          )
          if (!collapsedLocal) for (const commit of visible.local) pushRow(commit)
        }

        const chips =
          repos.length === 0
            ? null
            : h(
                'div',
                { className: 'gm-chips' },
                repos.map((repo) => {
                  const shown = !activeHiddenRepos.includes(repo.name)
                  const repoError = typeof repo.error === 'string' && repo.error !== ''
                  const tone = repoError
                    ? ' gm-chip-error'
                    : repo.dirty === null || repo.dirty === undefined
                      ? ' gm-chip-unknown'
                      : repo.dirty
                        ? ' gm-chip-dirty'
                        : ''
                  return h(
                    'button',
                    {
                      type: 'button',
                      className: `gm-chip${tone}`,
                      key: repo.path,
                      'aria-pressed': shown,
                      title:
                        repoError
                          ? `${repo.name} · ${t('repo.error')}: ${repo.error}`
                          : `${repo.name} · ${repo.branch}`,
                      onClick: () => toggleRepo(repo.name),
                    },
                    h('span', { className: 'gm-chip-dot', style: { background: colors.get(repo.name) ?? PALETTE[0] } }),
                    repo.name,
                    repo.upstream === null || repo.upstream === undefined
                      ? null
                      : h(
                          'span',
                          { className: 'gm-chip-track' },
                          repo.upstream.ahead > 0
                            ? h(
                                'span',
                                { className: 'gm-up', title: text(t, 'upstream.ahead', { count: repo.upstream.ahead }) },
                                `↑${repo.upstream.ahead}`,
                              )
                            : null,
                          repo.upstream.behind > 0
                            ? h(
                                'span',
                                { className: 'gm-down', title: text(t, 'upstream.behind', { count: repo.upstream.behind }) },
                                `↓${repo.upstream.behind}`,
                              )
                            : null,
                        ),
                  )
                }),
                activeHiddenRepos.length === 0
                  ? null
                  : h('button', { type: 'button', className: 'gm-chip', onClick: () => setHiddenRepos([]) }, t('chip.showAll')),
              )

        let body
        if (state.status === 'error') {
          body = h(
            'div',
            { className: 'gm-status gm-status-error', 'data-gm-state': 'error' },
            text(t, 'state.error', { message: state.failure ?? '' }),
          )
        } else if ((state.status === 'loading' || state.status === 'idle') && data === null) {
          body = h('div', { className: 'gm-status', 'data-gm-state': 'loading' }, t('state.loading'))
        } else if (repos.length === 0) {
          body = h('div', { className: 'gm-status', 'data-gm-state': 'empty' }, t('state.empty'))
        } else if (items.length === 0) {
          body = h('div', { className: 'gm-status', 'data-gm-state': 'no-match' }, t('state.noMatch'))
        } else {
          body = h('div', { className: 'gm-list', 'data-gm-count': items.length, ref: listRef }, items)
        }

        const unknownStatusCount = repos.filter(
          (repo) => repo.dirty === null || repo.dirty === undefined || (typeof repo.error === 'string' && repo.error !== ''),
        ).length
        const summaryParts = [
          h('span', { className: 'gm-summary-part', key: 'repos' }, text(t, 'summary.repos', { count: repos.length })),
          h('span', { className: 'gm-summary-part', key: 'commits' }, text(t, 'summary.commits', { count: data?.total ?? 0 })),
        ]
        if (unknownStatusCount > 0) {
          summaryParts.push(
            h(
              'span',
              { className: 'gm-summary-part', key: 'unknown' },
              text(t, 'summary.unknown', { count: unknownStatusCount }),
            ),
          )
        } else if (dirtyCount === 0) {
          summaryParts.push(h('span', { className: 'gm-summary-part', key: 'clean' }, t('summary.clean')))
        } else {
          summaryParts.push(
            h(
              'button',
              {
                type: 'button',
                className: 'gm-summary-part gm-summary-link',
                key: 'dirty',
                role: 'button',
                tabIndex: 0,
                title: t('mode.changesHint'),
                'data-gm-dirty-link': 'true',
                onClick: () => switchMode('changes'),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    switchMode('changes')
                  }
                },
              },
              text(t, 'summary.dirty', { count: dirtyCount }),
            ),
          )
        }

        return h(
          'div',
          { className: 'gm-root', 'data-gm-status': state.status, 'data-gm-mode': 'history' },
          h('style', null, STYLE),
          toolbar,
          fetchConfirmDialog,
          diffErrorBanner,
          fetchToast,
          h(
            'div',
            { className: 'gm-bar' },
            h('div', { className: 'gm-meta gm-summary' }, data === null ? null : summaryParts),
            query.trim() !== '' ? h('span', { className: 'gm-meta' }, text(t, 'summary.filtered', { count: items.length })) : null,
            activeHiddenRepos.length > 0
              ? h('span', { className: 'gm-meta' }, text(t, 'summary.hidden', { count: activeHiddenRepos.length }))
              : null,
            data?.reposTruncated === true
              ? h('span', { className: 'gm-meta gm-meta-warn' }, t('state.reposTruncated'))
              : null,
            (data?.reposSkipped ?? 0) > 0
              ? h(
                  'span',
                  { className: 'gm-meta gm-meta-warn' },
                  text(t, 'state.reposSkipped', { count: data.reposSkipped }),
                )
              : null,
            data?.truncated === true
              ? h('span', { className: 'gm-meta gm-meta-warn' }, t('state.truncated'))
              : null,
            loading && data !== null ? h('span', { className: 'gm-meta' }, t('state.loading')) : null,
            h(
              'select',
              {
                className: 'gm-range',
                value: timeRange,
                'aria-label': t('range.label'),
                title: t('range.label'),
                onChange: (event) => setTimeRange(event.currentTarget.value),
              },
              h('option', { value: 'all', key: 'all' }, t('range.all')),
              h('option', { value: 'today', key: 'today' }, t('range.today')),
              h('option', { value: '3d', key: '3d' }, t('range.3d')),
              h('option', { value: '7d', key: '7d' }, t('range.7d')),
            ),
            h(
              'div',
              { className: 'gm-search' },
              h('input', {
                type: 'search',
                value: query,
                placeholder: t('filter.placeholder'),
                'aria-label': t('filter.placeholder'),
                onChange: (event) => setQuery(event.currentTarget.value),
              }),
            ),
          ),
          chips,
          body,
        )
      }
    }

    /** Client 半：注册字典、差异页签与顶部 Conversation 视图。 */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)

      /**
       * 注册一个客户端能力。单个注册失败只记录错误：rc.5 上任一 client entry
       * 未激活会让整个 Web GUI 启动失败，不能因为一个可选视图/页签失败而拖垮宿主。
       * @param {string} label 注册名，用于错误日志。
       * @param {() => (() => void) | undefined} start 注册函数。
       */
      const register = (label, start) => {
        try {
          ctx.effect(() => {
            try {
              return start()
            } catch (error) {
              console.error(`[git-multirepo] ${label} failed`, error)
              return undefined
            }
          }, label)
        } catch (error) {
          console.error(`[git-multirepo] ${label} failed`, error)
        }
      }

      register('git-multirepo: dictionaries', () => ctx.locale.register(NS, { zh, en }))

      /** 在右侧栏打开一个文件的差异页签。 */
      const openDiff = (repo, hash, file) => {
        ctx.sidebarRight.openTab(DIFF_KIND, { params: { repo, hash, file } })
      }

      /** 在右侧栏打开一个工作区改动文件的差异页签（同一 diff kind，附加 scope）。 */
      const openWorktreeDiff = (repo, scope, file) => {
        ctx.sidebarRight.openTab(DIFF_KIND, { params: { repo, scope, file } })
      }

      register('git-multirepo: diff type', () => ctx.sidebarRightTabs.register(diffDefinition(t)))
      register('git-multirepo: diff body', () =>
        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register(
            { name: 'sidebar.right.pane.tab', key: DIFF_ID, locale: NS },
            createDiffView(t),
          ),
        ),
      )
      register('git-multirepo: diff title', () =>
        ctx.slots.inject('sidebar.right.pane.tab.title', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: DIFF_ID }, DiffTitle),
        ),
      )
      register('git-multirepo: view', () =>
        ctx.slots.inject('conversation.view', () =>
          ctx.slots.register(
            {
              name: 'conversation.view',
              id: VIEW_ID,
              order: 20,
              label: () => t('view.label'),
            },
            createView(t, openDiff, openWorktreeDiff),
          ),
        ),
      )
    }

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight'],
      apply,
    }
  },
})
