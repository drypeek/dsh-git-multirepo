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
      'view.label': '多仓库日志',
      title: '多仓库日志',
      'action.refresh': '刷新',
      'action.fetch': '拉取',
      'action.fetching': '拉取中…',
      'action.fetchHint': '对所有仓库执行 git fetch --all --prune，拉取后自动刷新',
      'fetch.ok': '已拉取 {count} 个仓库',
      'fetch.partial': '已拉取，{count} 个仓库失败',
      'fetch.error': '拉取请求失败：{message}',
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
    }

    /** 英文文案。 */
    const en = {
      'view.label': 'Repositories',
      title: 'Repositories',
      'action.refresh': 'Refresh',
      'action.fetch': 'Fetch',
      'action.fetching': 'Fetching…',
      'action.fetchHint': 'Run git fetch --all --prune for every repository, then refresh',
      'fetch.ok': 'Fetched {count} repositories',
      'fetch.partial': 'Fetched, {count} failed',
      'fetch.error': 'Fetch request failed: {message}',
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
.gm-chip-error{color:var(--dsw-alias-state-error-primary)}
.gm-chip-track{display:inline-flex;gap:4px;font-size:10px;font-variant-numeric:tabular-nums}
.gm-up{color:var(--dsw-alias-state-warn-primary)}
.gm-down{color:var(--dsw-alias-label-secondary)}
.gm-fetch-ok{color:var(--dsw-alias-state-success-primary)}
.gm-fetch-fail{color:var(--dsw-alias-state-error-primary)}
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
`

    /**
     * 把 ISO 时间转成紧凑显示。
     * @param {string} iso ISO 8601 时间。
     */
    function formatTime(iso) {
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '')
      if (match === null) return iso || ''
      const sameYear = String(new Date().getFullYear()) === match[1]
      return sameYear ? `${match[2]}-${match[3]} ${match[4]}:${match[5]}` : `${match[1]}-${match[2]}-${match[3]}`
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
    /** 提交详情缓存：重复展开同一条提交不再请求。 */
    const detailCache = new Map()
    /** 状态缓存条目上限。 */
    const STATE_CACHE_LIMIT = 4
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
     * 构造差异页签组件。
     * @param {(key: string) => string} t 翻译函数。
     */
    function createDiffView(t) {
      /** 单个文件在一次提交中的 unified diff。 */
      return function DiffView({ useTabInfo }) {
        const { tab } = useTabInfo()
        const params = tab.navigation?.params ?? {}
        const repo = typeof params.repo === 'string' ? params.repo : ''
        const hash = typeof params.hash === 'string' ? params.hash : ''
        const file = typeof params.file === 'string' ? params.file : ''
        const [state, setState] = useState({ status: 'loading' })

        useEffect(() => {
          if (repo === '' || hash === '' || file === '') {
            setState({ status: 'error', message: 'missing navigation params' })
            return undefined
          }
          const controller = new AbortController()
          setState({ status: 'loading' })
          const query = new URLSearchParams({ repo, hash, file })
          fetch(`${PATCH_URL}?${query.toString()}`, { signal: controller.signal })
            .then((response) => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`)
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
        }, [repo, hash, file])

        const head = h(
          'div',
          { className: 'gd-head' },
          h('span', { className: 'gd-name', title: file }, file),
          state.status === 'ready' ? h('span', { className: 'gd-add' }, `+${state.data.additions}`) : null,
          state.status === 'ready' ? h('span', { className: 'gd-del' }, `−${state.data.deletions}`) : null,
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
        const rows = []
        let previousOldEnd = 0
        for (const hunk of data.hunks) {
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
          for (const line of hunk.lines) {
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
          }
          previousOldEnd = info.oldLine + info.oldCount
        }

        let body
        if (data.binary) body = h('div', { className: 'gd-status' }, t('diff.binary'))
        else if (rows.length === 0) body = h('div', { className: 'gd-status' }, t('diff.empty'))
        else body = h('div', { className: 'gd-body' }, rows)

        return h(
          'div',
          { className: 'gd-root' },
          h('style', null, DIFF_STYLE),
          head,
          data.truncated ? h('div', { className: 'gd-status' }, t('diff.truncated')) : null,
          body,
        )
      }
    }

    /** 差异页签的标题：文件名。 */
    function DiffTitle({ useTabInfo }) {
      const { tab } = useTabInfo()
      const params = tab.navigation?.params ?? {}
      const file = typeof params.file === 'string' ? params.file : ''
      const name = file.split(/[/\\]/).pop() ?? ''
      return h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, name)
    }

    /**
     * 构造视图组件；t 以闭包传入。
     * @param {(key: string) => string} t 翻译函数。
     */
    function createView(t, openDiff) {
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
        const [state, setState] = useState({ status: 'idle', data: null, failure: null })
        const listRef = useRef(null)

        useEffect(() => {
          if (typeof cwd !== 'string' || cwd === '') {
            setState({ status: 'no-workspace', data: null, failure: null })
            return undefined
          }
          const controller = new AbortController()
          const slotKey = `${cwd}|${allBranches ? 'all' : 'head'}`
          const cached = stateCache.get(slotKey)
          setState((previous) => ({
            status: 'loading',
            data: previous.data ?? cached ?? null,
            failure: null,
          }))
          const params = new URLSearchParams({
            root: cwd,
            limit: String(DEFAULT_LIMIT),
            all: allBranches ? '1' : '0',
          })
          fetch(`${STATE_URL}?${params.toString()}`, { signal: controller.signal })
            .then((response) => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`)
              return response.json()
            })
            .then((value) => {
              if (controller.signal.aborted) return
              remember(stateCache, slotKey, value, STATE_CACHE_LIMIT)
              setState({ status: 'ready', data: value, failure: null })
            })
            .catch((error) => {
              if (controller.signal.aborted) return
              setState({
                status: 'error',
                data: null,
                failure: error instanceof Error ? error.message : String(error),
              })
            })
          return () => controller.abort()
        }, [cwd, allBranches, reloadToken])

        const cacheKey = `${cwd ?? ''}|${allBranches ? 'all' : 'head'}`
        const data = state.data ?? stateCache.get(cacheKey) ?? null
        const repos = data?.repos ?? []

        const repoInfo = useMemo(() => {
          const map = new Map()
          for (const repo of repos) map.set(repo.name, repo)
          return map
        }, [data])

        const colors = useMemo(() => {
          const map = new Map()
          for (let index = 0; index < repos.length; index += 1) {
            map.set(repos[index].name, PALETTE[index % PALETTE.length])
          }
          return map
        }, [data])

        const repoPaths = useMemo(() => {
          const map = new Map()
          for (const repo of repos) map.set(repo.name, repo.path)
          return map
        }, [data])

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
          const hidden = new Set(hiddenRepos)
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
        }, [data, query, hiddenRepos, cutoff])

        const commits = useMemo(() => [...visible.remote, ...visible.local], [visible])

        const hasCommits = useMemo(() => commits.length > 0, [commits])

        /** 找到跨仓库代表锚点：本地段起点，退回第一条。 */
        const findAnchor = useCallback((container) => {
          return container.querySelector('.gm-section-local') ?? container.querySelector('.gm-row')
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
          (key, commit) => {
            if (details[key] !== undefined || detailCache.has(key)) return
            const repoPath = repoPaths.get(commit.repo)
            if (repoPath === undefined) return
            setDetails((current) => {
              if (current[key] !== undefined) return current
              return { ...current, [key]: { status: 'loading' } }
            })
            const params = new URLSearchParams({ repo: repoPath, hash: commit.hash })
            fetch(`${COMMIT_URL}?${params.toString()}`)
              .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                return response.json()
              })
              .then((payload) => {
                remember(detailCache, key, payload, DETAIL_CACHE_LIMIT)
                setDetails((current) => ({ ...current, [key]: { status: 'ready', data: payload } }))
              })
              .catch((error) => {
                setDetails((current) => ({
                  ...current,
                  [key]: { status: 'error', message: error instanceof Error ? error.message : String(error) },
                }))
              })
          },
          [repoPaths, details],
        )

        const toggleCommit = useCallback(
          (commit) => {
            const key = `${commit.repo}:${commit.hash}`
            setExpandedKey((current) => (current === key ? null : key))
            loadDetail(key, commit)
          },
          [loadDetail],
        )

        const runFetch = useCallback(() => {
          if (typeof cwd !== 'string' || cwd === '') return
          setFetching(true)
          setFetchReport(null)
          const params = new URLSearchParams({ root: cwd })
          fetch(`${FETCH_URL}?${params.toString()}`, { method: 'POST' })
            .then((response) => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`)
              return response.json()
            })
            .then((report) => {
              setFetchReport({
                status: (report.failed ?? 0) > 0 ? 'partial' : 'ok',
                count: report.results?.length ?? 0,
                failed: report.failed ?? 0,
              })
              setDetails({})
              setReloadToken((value) => value + 1)
            })
            .catch((error) => {
              setFetchReport({
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
              })
            })
            .finally(() => setFetching(false))
        }, [cwd])

        const toolbar = h(
          'div',
          { className: 'gm-toolbar' },
          h('div', { className: 'gm-heading' }, h('span', { className: 'gm-heading-text' }, t('title'))),
          h('div', { className: 'gm-spacer' }),
          h(
            'div',
            { className: 'gm-seg', role: 'group', title: allBranches ? t('branch.allHint') : t('branch.currentHint') },
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
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'gm-tool',
              title: t('action.fetchHint'),
              disabled: loading || fetching,
              onClick: runFetch,
            },
            h(FetchGlyph),
            fetching ? t('action.fetching') : t('action.fetch'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'gm-tool',
              title: hasCommits ? t('action.gotoHead') : t('action.gotoHeadMissing'),
              disabled: !hasCommits,
              onClick: scrollToHead,
            },
            h(TargetGlyph),
            t('action.gotoHead'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'gm-tool',
              title: t('action.gotoTop'),
              onClick: scrollToTop,
            },
            h(TopGlyph),
            t('action.gotoTop'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'gm-tool',
              title: t('action.refresh'),
              disabled: loading,
              onClick: refresh,
            },
            h(RefreshGlyph),
            t('action.refresh'),
          ),
        )

        if (state.status === 'no-workspace') {
          return h(
            'div',
            { className: 'gm-root' },
            h('style', null, STYLE),
            toolbar,
            h('div', { className: 'gm-status', 'data-gm-state': 'no-workspace' }, t('state.noWorkspace')),
          )
        }

        /** 渲染一条提交的详情面板。 */
        const renderDetail = (commit) => {
          const key = `${commit.repo}:${commit.hash}`
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
              text(t, 'detail.error', { message: entry.message }),
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
              ? h('div', { className: 'gm-detail-empty' }, t('detail.noFiles'))
              : h(
                  'ul',
                  { className: 'gm-detail-files' },
                  info.files.map((file) =>
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
                            openDiff(repoPaths.get(commit.repo) ?? '', commit.hash, file.path)
                          },
                        },
                        file.path,
                      ),
                      h('span', { className: 'gm-file-num' }, file.insertions === null ? 'bin' : `+${file.insertions}`),
                      h('span', { className: 'gm-file-del' }, file.deletions === null ? '' : `−${file.deletions}`),
                    ),
                  ),
                ),
          )
        }

        const items = []
        const pushRow = (commit) => {
          const key = `${commit.repo}:${commit.hash}`
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
                  'data-gm-head': commit.refs.startsWith('HEAD ->') ? 'true' : undefined,
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
                    commit.refs.startsWith('HEAD ->')
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
                  const shown = !hiddenRepos.includes(repo.name)
                  const tone = repo.error !== null ? ' gm-chip-error' : repo.dirty ? ' gm-chip-dirty' : ''
                  return h(
                    'button',
                    {
                      type: 'button',
                      className: `gm-chip${tone}`,
                      key: repo.path,
                      'aria-pressed': shown,
                      title:
                        repo.error !== null
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
                hiddenRepos.length === 0
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
        } else if (state.status === 'loading' && data === null) {
          body = h('div', { className: 'gm-status', 'data-gm-state': 'loading' }, t('state.loading'))
        } else if (repos.length === 0) {
          body = h('div', { className: 'gm-status', 'data-gm-state': 'empty' }, t('state.empty'))
        } else if (items.length === 0) {
          body = h('div', { className: 'gm-status', 'data-gm-state': 'no-match' }, t('state.noMatch'))
        } else {
          body = h('div', { className: 'gm-list', 'data-gm-count': items.length, ref: listRef }, items)
        }

        const summary = [
          text(t, 'summary.repos', { count: repos.length }),
          text(t, 'summary.commits', { count: data?.total ?? 0 }),
          dirtyCount === 0 ? t('summary.clean') : text(t, 'summary.dirty', { count: dirtyCount }),
        ].join(' · ')

        return h(
          'div',
          { className: 'gm-root', 'data-gm-status': state.status },
          h('style', null, STYLE),
          toolbar,
          h(
            'div',
            { className: 'gm-bar' },
            h('div', { className: 'gm-meta' }, data === null ? null : h('span', null, summary)),
            query.trim() !== '' ? h('span', { className: 'gm-meta' }, text(t, 'summary.filtered', { count: items.length })) : null,
            hiddenRepos.length > 0 ? h('span', { className: 'gm-meta' }, text(t, 'summary.hidden', { count: hiddenRepos.length })) : null,
            loading && data !== null ? h('span', { className: 'gm-meta' }, t('state.loading')) : null,
            fetchReport === null
              ? null
              : h(
                  'span',
                  {
                    className:
                      fetchReport.status === 'ok'
                        ? 'gm-meta gm-fetch-ok'
                        : 'gm-meta gm-fetch-fail',
                  },
                  fetchReport.status === 'error'
                    ? text(t, 'fetch.error', { message: fetchReport.message ?? '' })
                    : fetchReport.status === 'partial'
                      ? text(t, 'fetch.partial', { count: fetchReport.failed })
                      : text(t, 'fetch.ok', { count: fetchReport.count }),
                ),
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
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'git-multirepo: dictionaries')

      /** 在右侧栏打开一个文件的差异页签。 */
      const openDiff = (repo, hash, file) => {
        ctx.sidebarRight.openTab(DIFF_KIND, { params: { repo, hash, file } })
      }

      ctx.effect(() => ctx.sidebarRightTabs.register(diffDefinition(t)), 'git-multirepo: diff type')
      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register(
              { name: 'sidebar.right.pane.tab', key: DIFF_ID, locale: NS },
              createDiffView(t),
            ),
          ),
        'git-multirepo: diff body',
      )
      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.right.pane.tab.title', () =>
            ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: DIFF_ID }, DiffTitle),
          ),
        'git-multirepo: diff title',
      )

      ctx.effect(
        () =>
          ctx.slots.inject('conversation.view', () =>
            ctx.slots.register(
              {
                name: 'conversation.view',
                id: VIEW_ID,
                order: 20,
                label: () => t('view.label'),
              },
              createView(t, openDiff),
            ),
          ),
        'git-multirepo: view',
      )
    }

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight'],
      apply,
    }
  },
})
