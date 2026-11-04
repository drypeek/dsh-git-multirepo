# dsh-git-multirepo

**See the history of every git repository in your DSH workspace as one list — inside the conversation header.**

English | [简体中文](README.zh.md)

> Unofficial third-party plugin for DeepSeek Harness; not affiliated with or endorsed by DeepSeek.

---

If your workspace contains several repositories side by side, checking them one at a time is slow and easy to forget. This plugin finds all of them automatically and shows their commits together, so you can answer "what changed lately, and which repositories are behind?" in a single glance.

## What you get

- **One timeline for the whole workspace.** Commits from every repository, newest first, each row labelled with its repository.
- **A clear split between incoming and local.** Commits that exist only on the remote are grouped in their own collapsible section, so remote work that hasn't been merged locally never gets lost among the rest.
- **Details on demand.** Click a commit to see its message, author, timestamps, hashes and changed files. Click a file to open its diff in the right sidebar.
- **Fetch everything at once.** One button updates all repositories and tells you which ones failed. Each repository also shows how far ahead or behind it is.
- **Filtering that stays out of the way.** Hide repositories you don't care about, restrict by date, or search commit messages, authors and hashes.
- **Stays put while you scroll.** The toolbar is pinned, with one-click jumps to the top and to your current position.

## Install

Requires DSH 0.2.1-rc.5 through 0.2.x (the diff view uses the right-sidebar tab services), Node.js 20+, and Git 2.36+ (safe configuration overrides and fsmonitor disabling). SHA-1 and SHA-256 repositories are supported.

Install this directory as a plugin bundle:

1. In DSH, open **Settings → Plugins** and install a bundle from a local folder, choosing this checkout. (An agent session can use the `plugin_manager` tool instead: `install_bundle` with the absolute path of this directory.)
2. Enable the bundle. From the CLI, `dsh plugin --profile <profile> add link:/path/to/dsh-git-multirepo` installs the package; enable the bundle afterwards.

Then refresh the Web GUI — a **Repositories** tab appears next to *Chat* and *Trajectory*.

> **Desktop app:** plugin bundles are not hot-reloaded the way they are in the browser. Restart DSH after installing or updating.

## Using it

1. Open the **Repositories** tab.
2. The plugin scans the current session's working directory and finds every repository inside it (dependency and build directories such as `node_modules`, `bin`, `obj`, `dist`, `target`, and dot-directories are skipped).
3. Click **Fetch** to bring down the latest from your remotes, or **Refresh** to rescan what's already local.
4. Click any commit to expand it; click a changed file to open its diff on the right.

## Good to know

- **You need to fetch to see new work.** `git log` only reads what is already on disk. Commits pushed by others appear after a fetch — the plugin never pulls or merges into your branch by itself.
- **Fetch asks first.** It runs `git fetch` in every repository it found, so the view asks for confirmation before starting.
- **Seeing is all it does.** Apart from Fetch, the plugin only reads. It never commits, pushes, merges or changes your working tree.
- **The list is a sample.** Each repository contributes its most recent commits (40 by default), so very old history is not shown.
- **Large results are bounded.** Long subjects and large histories/diffs are limited. A repository that exceeds Git output limits reports an error. Dirty state includes untracked files; submodules are inspected as separate repositories.
- **Linked worktrees need registered storage.** Register the main repository as a DSH workspace too if it is outside the worktree's workspace. Git metadata/object directories must be inside registered workspaces; repositories using object alternates are skipped.
- **Missing objects stay offline.** Reading a partial clone never fetches missing objects automatically. Use Fetch first; if your remote does not supply the requested objects, retrieve them in your terminal before reopening the diff.
- **It looks at the current session's directory.** Switch sessions (or workspaces) to look at a different set of repositories.

## Privacy and safety

- **The plugin itself never reads or stores your credentials.** Git runs as a child process with your existing credential helper, SSH configuration and remotes — exactly as it would in your terminal. Read-only requests use a minimal environment that does not hand credential variables to git; Fetch passes only the variables git needs for credentials, not unrelated host-process secrets.
- **Read-only Git is hardened.** Filter keys are read from all effective configuration scopes without reading their values into arguments. Enumeration failure stops the repository status read. Pagers, hooks, external diff/text conversion and Git transports are disabled for reads.
- **Only Fetch enables Git network transports.** That is `git fetch` against the remotes you configured; other client requests go to DSH's own same-origin API. Filesystem access still follows your OS permissions. No telemetry or analytics.
- **Requests are authenticated by DSH** and restricted to directories inside registered workspaces.
- **Apart from Fetch, nothing in your working tree changes** — the plugin never commits, pushes or merges. Fetch updates remote-tracking refs, `FETCH_HEAD` and objects only; `git status` runs with optional lock writes disabled, so it normally leaves `.git/index` untouched.
- **Git can run programs configured by a repository.** That is standard git behaviour (`core.sshCommand`, `credential.helper`, `remote.*.uploadpack`, `gpg.program`, `diff` drivers). Fetch runs in every repository it finds, so keep untrusted repositories out of your DSH workspaces. See [SECURITY.md](SECURITY.md) for the threat model and the hardening applied here.

## Development

Run `npm run check` and `npm test` with Node.js 20+ and Git 2.36+. Tests use disposable
repositories and local marker programs; no external remote is contacted.

## License

MIT
