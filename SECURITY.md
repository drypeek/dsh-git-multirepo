# Security policy

`dsh-git-multirepo` is an unofficial third-party plugin for DeepSeek Harness (DSH). It registers
authenticated HTTP routes in the DSH Host process and runs `git` as child processes against the
repositories it finds in the current workspace.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private vulnerability reporting for this repository
(**Security → Report a vulnerability**). If that is unavailable, open a minimal issue that only asks
the maintainer for a private channel, without details.

Include the plugin version, DSH version, operating system, the affected route or UI surface, and
reproduction steps. You can expect an initial response within about a week.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x   | Yes       |

## Threat model

The plugin reads repository data and never evaluates it: commit messages, author names, branch
names and file contents are rendered as plain text by the Web client (React escapes them). There is
no `innerHTML`, no dynamic code evaluation and no telemetry.

The relevant risk is that **git itself executes configuration found in a repository**. A repository
whose `.git/config` is attacker-controlled can ask git to run programs (for example
`core.sshCommand`, `credential.helper`, `remote.*.uploadpack`, `gpg.program` with
`log.showSignature`, or a `diff` driver's `textconv`/`external`). Read-only inspection must suppress
these execution paths; explicit Fetch remains a trusted-repository operation.

What the plugin does about it:

- Read-only routes (`/state`, `/commit`, `/patch`) run git with `core.fsmonitor=false`,
  `log.showSignature=false`, empty `gpg.program` and `diff.external`, `protocol.ext.allow=never`,
  `GIT_OPTIONAL_LOCKS=0`, `GIT_LITERAL_PATHSPECS=1`, disabled hooks/pagers and a reduced
  environment that omits credential variables. Git 2.36+ is required and checked at runtime:
  older versions may treat the boolean `core.fsmonitor=false` as an executable hook name.
- The `git` executable is resolved once from absolute `PATH` entries and always run by
  absolute path. Windows would otherwise search the child working directory first, letting a
  repository that contains a `git.exe` run code during a read-only scan. The version probe
  runs from the temporary directory, never from a repository.
- Before `git status`, the plugin enumerates NUL-delimited configuration key names from the
  repository-local and worktree scopes, including local includes. Filter commands are cleared
  and `filter.*.required` is set false through separate `GIT_CONFIG_KEY_n` / `VALUE_n` pairs.
  System and global configuration are treated as trusted user configuration and stay active
  (for example git-lfs), which keeps dirty state accurate. Values containing newlines or keys
  containing `=` cannot become extra command options. Enumeration errors and oversized
  inventories stop status rather than proceeding unprotected.
- Status disables recursive submodule inspection. Discovered submodules are checked separately
  with their own configuration policy; untracked files are included in dirty state.
- Every read-only `show`/`log` disables text conversion and external diff. Read subprocesses set
  `GIT_NO_LAZY_FETCH=1` and an empty `GIT_ALLOW_PROTOCOL`; all Git transports are denied even
  when a repository sets a protocol to `always`. Missing partial-clone objects cause an error
  instead of implicit network access. Users must explicitly fetch or retrieve missing objects.
- Authentication is delegated to DSH's exact-route registry. The plugin checks canonical
  worktree, Git directory, common directory and object-directory roots against registered
  workspaces, rejects object alternates, and pins Git's worktree and metadata directory on
  each call. A linked worktree outside its main repository is supported when the main repository
  is also registered. Invalid `.git` entries never fall back to an ancestor repository.
- Discovery streams entries and bounds visited directories/entries, depth and repositories.
  Cancellation and deadlines cover discovery and root validation. Root validation and state
  reads use bounded workers; a shared request cap prevents unlimited concurrent scans.
  Per-process output is bounded, displayed log fields are truncated, and retained state commits
  have an aggregate byte budget as well as a count limit. State cache entries are copied away
  from Git stdout backing strings and share a total cache byte cap. Commit details have a response byte
  limit and a byte-bounded cache; identity text is bounded and file lists are truncated at whole
  entries, never by rewriting a path.
- The fetch route disables the `ext::` transport and submodule recursion, and runs git with a
  restricted environment: only the variables git needs for credentials and system operation
  are passed through, so unrelated host-process secrets (for example DSH API keys) are not
  inherited. Configuration-injection variables (`GIT_CONFIG_COUNT`, `GIT_CONFIG_PARAMETERS`,
  `GIT_CONFIG_KEY_n` / `GIT_CONFIG_VALUE_n`) are not inherited either.

What it cannot do:

- This is not an OS sandbox for Git. Filesystem permissions, concurrent local metadata changes,
  trusted user/system configuration includes and filesystem/network mounts remain properties
  of the host. Registered workspaces and administrative storage must be chosen deliberately.
- DSH 0.2.1 authentication, browser-origin/CSRF enforcement, request-body limits and caller
  isolation are host contracts outside this repository. Local route tests do not certify those
  contracts or the installed desktop runtime.
- It cannot neutralise a repository's `core.sshCommand` or `credential.helper` and still fetch
  from private remotes with your existing credentials. **Fetch therefore runs `git fetch`
  inside every repository it discovers in your workspace, and git may run programs configured
  by those repositories** (for example `core.sshCommand`, `credential.helper`,
  `remote.*.uploadpack`). Only click **Fetch** in workspaces whose repositories you trust, or
  keep untrusted repositories out of DSH workspaces.

## Scope

In scope: plugin routes, path validation, command construction, parsing of git output, client-side
rendering of repository data, and denial of service through workspace topology.

Out of scope: vulnerabilities in DSH itself, in git, or in repositories you place in a workspace;
reports that require an attacker to already control the DSH process, its profile, or the user's git
configuration.
