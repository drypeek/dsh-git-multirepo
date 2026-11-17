# dsh-git-multirepo

See commits and uncommitted changes from several Git repositories in one DSH tab.

English · [简体中文](https://github.com/drypeek/dsh-git-multirepo/blob/main/README-zh.md)

If your workspace holds separate frontend, backend, or tooling repositories, the **Git log** tab brings their history onto one timeline. Each commit and changed file is labelled with its repository, so you can follow what changed without opening every folder.

This is a third-party plugin for DeepSeek Harness (DSH), not an official DeepSeek project.

[![npm version](https://img.shields.io/npm/v/dsh-git-multirepo)](https://www.npmjs.com/package/dsh-git-multirepo)
[![npm downloads](https://img.shields.io/npm/dm/dsh-git-multirepo)](https://www.npmjs.com/package/dsh-git-multirepo)
[![CI](https://github.com/drypeek/dsh-git-multirepo/actions/workflows/ci.yml/badge.svg)](https://github.com/drypeek/dsh-git-multirepo/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/drypeek/dsh-git-multirepo)](https://github.com/drypeek/dsh-git-multirepo/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/drypeek/dsh-git-multirepo)](https://github.com/drypeek/dsh-git-multirepo/stargazers)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![dsh](https://img.shields.io/badge/dsh-0.2.1--rc.5%20--%200.2.x-blue)
![JavaScript](https://img.shields.io/badge/language-JavaScript-yellow)

## Features

- Browse the current branch or all branches. In current-branch mode, incoming remote commits get their own section.
- Open **Working tree changes** to see staged, unstaged, untracked and conflicted files from every repository, grouped by repository. Click a file to view its diff in the right sidebar.
- Expand a commit to read its message and changed files, then click a file to open the diff.
- Filter by repository, date, commit message, author, or short hash.
- Check for uncommitted work and ahead/behind counts, and fetch updates for several repositories at once.
- **Ask the AI about a commit.** Right-click a commit row and choose **Add to chat**; a short reference goes into the chat input. Add your question and send, and the agent can read the commit and its diff using the plugin's read-only tools.

## Installation

You'll need DSH 0.2.1-rc.5 through 0.2.x, Git 2.36 or newer, and a Node.js 20+ runtime.

Install from npm ([dsh-git-multirepo](https://www.npmjs.com/package/dsh-git-multirepo)). In the DSH desktop app, open **Plugins → Add plugin → Install a third-party plugin** and enter `dsh-git-multirepo`, or run:

```sh
dsh plugin --profile <profile> add dsh-git-multirepo
```

The plugin is enabled by default. If you previously turned it off, enable it again on the Plugins page. Restart the desktop app after installing or updating; for the Web GUI, refresh the page. A **Git log** tab then appears next to **Chat** and **Trajectory** in a session.

Other ways to install:

- Use the prebuilt tarball from the latest GitHub Release:
  ```sh
  dsh plugin --profile <profile> add https://github.com/drypeek/dsh-git-multirepo/releases/latest/download/dsh-git-multirepo.tgz
  ```
- Link a local checkout for development:
  ```sh
  git clone https://github.com/drypeek/dsh-git-multirepo.git
  dsh plugin --profile <profile> add "link:/absolute/path/to/dsh-git-multirepo"
  ```

## Usage

Open **Git log** to scan the current session's working directory. When you switch sessions, the tab switches to that session's directory too.

The tab has two views: **Commit history** and **Working tree changes**. The changes view groups files by repository as conflicted, staged, unstaged and untracked. Click a file to open its diff in the right sidebar; search matches file paths and repository names. This view is read-only—there is no staging, committing, or reverting.

In commit history, click a commit to expand its details, then click a filename to open that file's diff. Repository chips control which repositories appear; search and the date filter narrow the list.

The two update buttons do different things:

| Button | What it does |
| --- | --- |
| Refresh | Re-reads local history, working-tree changes, and repository status. It does not contact a remote. |
| Fetch | Runs `git fetch --all --prune` in the discovered repositories, then refreshes the list. When repositories are known, a confirmation dialog explains the repository count and read-only behavior before it starts. |

The confirmation is remembered per workspace for 10 minutes in the current page session. A reload asks again, and nothing is written to disk. A failed fetch also asks again next time. Results appear in a dismissible banner: successful fetches close after 3 seconds, while partial failures, timeouts and errors stay until you dismiss them. You can expand the banner to see per-repository details, including directories that were skipped because they are not repositories. A timeout is reported as a timeout, never as success, and the banner stays visible when you switch between the two views.

The changes view only has **Refresh**; fetch and go-to-HEAD belong to commit history.

Fetch does not run `git pull`, merge branches, or change working-tree files. Incoming commits are shown for inspection, and merging them is up to you.

The chat input is hidden while this tab is open. Switch back to **Chat** to type.

## Asking the AI about a commit

Right-click a commit row and choose **Add to chat**, or press <kbd>Shift</kbd>+<kbd>F10</kbd> and choose it from the menu. The plugin inserts a short reference such as `[commit:web@a1b2c3d]` into the chat input; it does not send a message for you. Add your own question, add more commits if useful, then send. In the sent message each reference becomes a chip, and the agent can look up the repository, commit, and diff with the plugin's read-only tools.

## Common questions

### Why is a repository missing?

Check the current session's working directory. By default, discovery scans four levels down and lists up to 100 repositories. It skips hidden directories and dependency/build directories such as `node_modules`, `bin`, `obj`, `dist`, and `target`. The view tells you when a scan limit is reached.

### Why is older history missing?

The list starts with the latest 40 commits per repository and has total count and size limits. For the full history, use `git log` in your terminal. Large commit lists, file lists, and diffs may be truncated or return an error; the view explains what happened.

### What are the limits of the working tree changes view?

- It is read-only: no staging, committing, reverting, or conflict resolution.
- Renames show up as a deletion plus an addition; rename relationships are not shown.
- Untracked directories are collapsed into one row instead of being expanded.
- Conflicted files are listed but not rendered (no combined diff yet).
- Untracked file previews are limited to 512 KB; binary files and symbolic links show status only.

### Why can't a linked worktree be read?

If its main repository is outside the worktree's workspace, register the main repository as a DSH workspace too. Git metadata and object directories must be inside registered workspaces. Repositories that share objects through `objects/info/alternates` are not supported yet.

### What should I do about missing objects in a partial clone?

Commit and diff reads do not fetch missing objects automatically. Try **Fetch** first. If the objects are still missing, retrieve them in your terminal and reopen the diff.

## Security and privacy

The plugin has no telemetry or analytics. Normal viewing reads local history; Git network transports are used only by **Fetch**. The plugin does not commit, push, or merge code.

The working tree changes view uses read-only Git commands (`status`, `diff`, `config`, `rev-parse`). Untracked file previews read file contents directly, stay inside the repository, do not follow symbolic links, and stop at 512 KB per file.

Fetch uses your existing SSH and Git credential configuration, and it may run programs configured by a repository. Use it only with repositories you trust. System and global Git configuration are treated as trusted user configuration too.

DSH handles route authentication, and repository paths are restricted to registered workspaces. See [SECURITY.md](https://github.com/drypeek/dsh-git-multirepo/blob/main/SECURITY.md) for the controls, limitations, and vulnerability reporting process.

## Development

From the repository directory, run:

```sh
npm run check
npm test
```

Tests use temporary repositories and local test programs and do not contact external remotes. Both checks also run automatically before `npm publish`.

## License

[MIT](https://github.com/drypeek/dsh-git-multirepo/blob/main/LICENSE)
