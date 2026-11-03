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
no `innerHTML`, no dynamic code evaluation and no third-party network request.

The relevant risk is that **git itself executes configuration found in a repository**. A repository
whose `.git/config` is attacker-controlled can ask git to run programs (for example
`core.sshCommand`, `credential.helper`, `remote.*.uploadpack`, `gpg.program` with
`log.showSignature`, or a `diff` driver's `textconv`/`external`). This is normal git behaviour, not
a plugin vulnerability, but it means a repository must be treated as trusted input.

What the plugin does about it:

- Read-only routes (`/state`, `/commit`, `/patch`) run git with `core.fsmonitor=false`,
  `log.showSignature=false`, empty `gpg.program` and `diff.external`, `protocol.ext.allow=never`,
  `--no-textconv`, `--no-ext-diff`, `GIT_OPTIONAL_LOCKS=0`, and a reduced environment that omits
  credential variables.
- The fetch route additionally disables the `ext::` transport and submodule recursion.
- Every request is authenticated and restricted to directories inside a registered workspace, and
  the commit/patch routes require the directory to be a repository root (they do not follow `.git`
  discovery into a parent repository).

What it cannot do:

- It cannot neutralise a repository's `core.sshCommand` or `credential.helper` and still fetch from
  private remotes with your existing credentials. **Fetch therefore runs `git fetch` inside every
  repository it discovers in your workspace.** Only click **Fetch** in workspaces whose repositories
  you trust, or keep untrusted repositories out of DSH workspaces.

## Scope

In scope: plugin routes, path validation, command construction, parsing of git output, client-side
rendering of repository data, and denial of service through workspace topology.

Out of scope: vulnerabilities in DSH itself, in git, or in repositories you place in a workspace;
reports that require an attacker to already control the DSH process, its profile, or the user's git
configuration.
