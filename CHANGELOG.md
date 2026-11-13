# Changelog

All notable changes to this project are documented here. Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Changed

- Fetch feedback is now explicit: clicking **Fetch** opens a confirmation dialog (title, repository count, read-only explanation, explicit start/cancel, `Esc` to close). After one confirmation the dialog is skipped for 10 minutes, and the result is reported in a prominent banner (success, partial failures, timeouts, errors) that auto-dismisses after 6 seconds and can also be closed manually.


## 0.2.0 — 2026-11-11

### Added

- **Working tree changes view.** Browse staged, unstaged, untracked and conflicted files from every discovered repository in one grouped list. Click a file to render its diff in the right-hand sidebar tab.
- Two new read-only Host routes: `GET /api/git-multirepo/worktree` (per-repository changes listing) and `GET /api/git-multirepo/worktree-diff` (single-file diff for `staged`, `unstaged` or `untracked` scope).
- Mode switch between commit history and working tree changes, remembered per profile through `localStorage`.
- Working tree listings report per-repository totals, branch/upstream state and truncation; filters reuse repository chips and the search box.
- Working tree diffs reuse the existing diff tab: commit diffs keep their parameters, while changes diffs add a `scope` parameter and restore correctly after a page reload.

### Fixed

- Host path canonicalization now expands Windows 8.3 short names (for example `RUNNER~1` in CI temporary directories), so repositories are still discovered when the workspace root uses a short path.

### Limits

- Conflicted files are listed but not rendered (no combined diff yet).
- Untracked directories are collapsed rather than expanded.
- Renames are shown as a deletion plus an addition.
- Untracked file previews are capped at 512 KB; binary files and symbolic links show status only.

### Security

- Working tree reads stay read-only: `git status`, `git diff --numstat`, `git diff`, `git config` and `git rev-parse` only.
- Untracked previews are confined to the repository, do not follow symbolic links, reject directories, and stop at 512 KB.
- Repository-local filter/textconv settings remain neutralised for all working tree reads.

## 0.1.0 – 0.1.3 — 2026-11-04 – 2026-11-08

- Initial public npm releases: multi-repository commit timeline, commit details, per-file diffs, search/time filters, and `git fetch --all --prune` across repositories.
