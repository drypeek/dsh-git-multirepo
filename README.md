# dsh-git-multirepo

View commits from several Git repositories together in DSH.

English · [简体中文](https://github.com/drypeek/dsh-git-multirepo/blob/main/README-zh.md)

If a workspace contains separate frontend, backend, or tooling repositories, the **Repositories** tab shows their commits in one timeline. Each commit is labelled with its repository.

This is a third-party plugin for DeepSeek Harness (DSH), with no affiliation to DeepSeek.

[![npm version](https://img.shields.io/npm/v/dsh-git-multirepo)](https://www.npmjs.com/package/dsh-git-multirepo)
[![npm downloads](https://img.shields.io/npm/dm/dsh-git-multirepo)](https://www.npmjs.com/package/dsh-git-multirepo)
[![CI](https://github.com/drypeek/dsh-git-multirepo/actions/workflows/ci.yml/badge.svg)](https://github.com/drypeek/dsh-git-multirepo/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/drypeek/dsh-git-multirepo)](https://github.com/drypeek/dsh-git-multirepo/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/drypeek/dsh-git-multirepo)](https://github.com/drypeek/dsh-git-multirepo/stargazers)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![dsh](https://img.shields.io/badge/dsh-0.2.1--rc.5%20--%200.2.x-blue)
![JavaScript](https://img.shields.io/badge/language-JavaScript-yellow)

## Features

- Browse the current branch or all branches. In current-branch mode, incoming remote commits have their own section.
- Expand commit messages and changed files; open a file diff in the right sidebar.
- Filter by repository, date, commit message, author, or short hash.
- Check uncommitted changes and ahead/behind counts, and fetch updates for multiple repositories.

## Installation

Requires DSH 0.2.1-rc.5 through 0.2.x, Git 2.36+, and a Node.js 20+ runtime.

Install from npm ([dsh-git-multirepo](https://www.npmjs.com/package/dsh-git-multirepo)). In the DSH desktop app, open **Plugins → Add plugin → Install a third-party plugin** and enter `dsh-git-multirepo`, or run:

```sh
dsh plugin --profile <profile> add dsh-git-multirepo
```

Installation enables the bundle by default; re-enable it on the Plugins page if you previously switched it off. Restart the desktop app after installing or updating; for the Web GUI, refresh the page. The **Repositories** tab then appears beside **Chat** and **Trajectory** in a session.

Other install targets:

- Prebuilt tarball from the latest GitHub Release:
  ```sh
  dsh plugin --profile <profile> add https://github.com/drypeek/dsh-git-multirepo/releases/latest/download/dsh-git-multirepo.tgz
  ```
- Local checkout, for development:
  ```sh
  git clone https://github.com/drypeek/dsh-git-multirepo.git
  dsh plugin --profile <profile> add "link:/absolute/path/to/dsh-git-multirepo"
  ```

## Usage

Open **Repositories** to scan the current session's working directory. Switching sessions changes the directory shown.

Click a commit to expand its details, then click a filename to open its diff. Repository labels control which repositories appear; use search and the date filter to narrow the list.

| Button | Action |
| --- | --- |
| Refresh | Reread local history and repository status without fetching remote updates. |
| Fetch | Run `git fetch --all --prune` in the discovered repositories, then refresh. When repositories are known, the view asks for confirmation first. |

Fetch does not run `git pull`, merge branches, or update working-tree files. Incoming commits are shown for inspection; merging them is a separate step.

The chat input is hidden while this tab is open. Switch back to **Chat** to type.

## Common questions

### Why is a repository missing?

Check the current session's working directory. By default, discovery scans four levels down and lists up to 100 repositories. It skips hidden directories and dependency/build directories such as `node_modules`, `bin`, `obj`, `dist`, and `target`. The view reports when a scan limit is reached.

### Why is older history missing?

The list starts with the latest 40 commits per repository and has total count and size limits. Use `git log` in your terminal to browse the full history. Large commit lists, file lists, and diffs may be truncated or produce an error, with a message in the view.

### Why can't a linked worktree be read?

If its main repository is outside the worktree's workspace, register the main repository as a DSH workspace too. Git metadata and object directories must be inside registered workspaces. Repositories sharing objects through `objects/info/alternates` are not currently supported.

### What should I do about missing objects in a partial clone?

Commit and diff reads do not fetch missing objects automatically. Try **Fetch** first. If the required objects are still missing, retrieve them in your terminal and reopen the diff.

## Security and privacy

The plugin has no telemetry or analytics. Normal viewing reads local history; Git network transports are enabled only by **Fetch**. The plugin does not commit, push, or merge code.

Fetch uses your existing SSH and Git credential configuration and may run programs configured by a repository. Use it only with repositories you trust. System and global Git configuration are also treated as trusted user configuration.

DSH handles route authentication, and repository paths are restricted to registered workspaces. See [SECURITY.md](https://github.com/drypeek/dsh-git-multirepo/blob/main/SECURITY.md) for the controls, limitations, and vulnerability reporting process.

## Development

From the repository directory, run:

```sh
npm run check
npm test
```

Tests use temporary repositories and local test programs, without contacting external remotes. Both checks also run automatically before `npm publish`.

## License

[MIT](https://github.com/drypeek/dsh-git-multirepo/blob/main/LICENSE)
