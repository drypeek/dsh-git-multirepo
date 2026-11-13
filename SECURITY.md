# Security policy

`dsh-git-multirepo` runs Git under the DSH Host user's OS account. Repository data is rendered as text in the client. Git configuration needs separate care because it can select programs to execute.

## Report a vulnerability

Please use this repository's **Security → Report a vulnerability** page rather than a public issue. If private reporting is unavailable, open an issue asking for a private contact channel without including vulnerability details.

Include the plugin version, DSH version, OS, affected route or view, and reproduction steps. You can expect an initial response within about a week.

The supported release line is **0.2.x**.

## Trust model

| Input or operation | Treatment |
| --- | --- |
| Commit messages, author names, refs, file contents | Rendered as text by React; not evaluated as code. |
| Repository-local and worktree Git configuration | Untrusted. Execution-related filter/diff settings are neutralised for reads. |
| System and global Git configuration | Trusted user configuration. Filters such as git-lfs stay active. |
| Fetch | A trusted-repository operation. Existing SSH commands and credential helpers may run. |
| DSH route authentication | Provided by the Host's exact-route registry. |

An ordinary remote commit does not install `.git/config`. Some execution risks require a prepared local repository with attacker-controlled Git metadata. The plugin still applies its read protections to every discovered repository.

## Read-only operations

The `/state`, `/commit`, `/patch`, `/worktree` and `/worktree-diff` routes use the following controls:

- **Executable selection.** Git is resolved once from absolute `PATH` entries and invoked by absolute path. Version detection runs from the temporary directory, not a repository. This avoids Windows selecting a repository's own `git.exe`.
- **Version check.** Git 2.36+ is required. Older versions can interpret `core.fsmonitor=false` as a hook pathname.
- **Repository configuration.** Before status runs, configuration key names are read in NUL-delimited form with scope information. Local/worktree filter and diff settings, including local includes, are overridden through separate `GIT_CONFIG_KEY_n` and `GIT_CONFIG_VALUE_n` values. A newline in a value or an equals sign in a key cannot become another option. Enumeration failure or an oversized inventory stops the status read.
- **Execution controls.** Pagers, hooks, fsmonitor, signature display, external diff and text conversion are disabled. Status does not recurse into submodules; discovered submodules receive their own scan and configuration checks.
- **Working-tree reads.** The `/worktree` route runs only `git status` and `git diff --numstat`. The `/worktree-diff` route runs `git diff` for staged and unstaged changes. Untracked previews read the file directly instead of invoking Git: reads are confined to the repository, symbolic links are not followed, directories are rejected, and reads stop at 512 KB. Conflicted files are listed but not rendered; untracked directories are collapsed.
- **Offline object reads.** `GIT_NO_LAZY_FETCH=1` and an empty `GIT_ALLOW_PROTOCOL` prevent automatic promisor fetches, even if a repository allows a protocol. Missing objects produce an error. Fetching them requires an explicit operation.
- **Environment.** Read subprocesses receive a reduced environment without credential variables. They use `GIT_OPTIONAL_LOCKS=0` and literal pathspecs.

Trusted system/global filters can still execute with the Host user's permissions. Disabling Git transports is not a network sandbox for those trusted programs.

## Workspace boundaries

Every route checks that the worktree is inside a registered workspace. Git calls also check the canonical Git directory, common directory and object-directory roots, then pass explicit `--git-dir` and `--work-tree` arguments.

Linked worktrees are allowed when their main repository is also inside a registered workspace. Non-empty object alternates are rejected. Invalid `.git` entries cannot fall back to a parent repository.

These checks are not an OS filesystem sandbox. Trusted configuration includes, nested symlinks, filesystem/network mounts and concurrent local metadata changes remain subject to host permissions. Register workspaces and administrative storage deliberately.

## Fetch

Fetch runs `git fetch --all --prune` in the discovered repositories, with submodule recursion and `ext::` transport disabled. The view asks for confirmation when repositories are known.

Fetch keeps the user's SSH and credential setup, including repository settings such as `core.sshCommand`, `credential.helper` and `remote.*.uploadpack`. **Only fetch repositories you trust.** Programs selected by these settings run under the Host user's OS account.

The subprocess environment is restricted to system and Git credential/transport variables. Unrelated Host secrets and environment-based Git configuration injection variables are not inherited.

The plugin does not commit, push, merge, or update working-tree files. Fetch can update objects, remote-tracking refs and `FETCH_HEAD`.

## Resource limits

Directory discovery streams entries and has depth, directory, entry and repository limits. Cancellation and deadlines cover traversal, root validation and Git requests; worker and request concurrency are bounded.

Git output and individual responses have size limits. Aggregate history, working-tree and caches have both count and byte limits, with copied strings to avoid retaining large output buffers through small slices. Working-tree listings cap entries per repository and total response bytes; untracked previews cap file size, line count and line length. File lists are truncated at whole entries; a path is never shortened into a different path. Dirty state includes untracked files, and failed status reads are shown as unknown.

## Scope and validation limits

In scope: plugin routes, the commit history and working-tree changes views, workspace/path checks, Git command construction, Git output parsing, client rendering, and resource use caused by workspace topology.

Vulnerabilities in DSH, Git, or another project itself are outside this plugin's scope. Reports requiring control of the DSH process, its profile, or trusted user Git configuration are also outside scope.

DSH authentication, browser-origin/CSRF enforcement, request-body limits and caller isolation are Host contracts outside this repository. The local route tests do not certify those contracts or the installed desktop runtime.
