# Contributing

Thanks for taking the time to improve **dsh-git-multirepo**. This project follows [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow): `main` is always releasable, and every change lands through a short-lived branch and a pull request.

## Before you start

- Node.js 20 or newer (CI runs Node 20 and 24).
- Git 2.36 or newer. The host code relies on worktree-aware Git features.
- Optional: DSH 0.2.1-rc.5 through 0.2.x, if you want to try the plugin in a real profile.

```sh
git clone https://github.com/drypeek/dsh-git-multirepo.git
cd dsh-git-multirepo
npm run check
npm test
```

## Branches

Create your branch from an up-to-date `main` and keep it short-lived:

- `feat/<topic>` for user-facing features
- `fix/<topic>` for bug fixes
- `docs/<topic>` for documentation-only changes
- `chore/<topic>` for tooling and maintenance

Rebase onto `main` before opening or updating a pull request; `main` keeps a linear history.

## Local development

The plugin has two halves:

- `index.js` — the host: routes, repository discovery, Git calls, limits and security checks.
- `client.js` — the Web client: the **Git log** tab, the working-tree view and the diff pane.
- `tests/host.test.js` and `tests/client.test.js` — the test suites. They use temporary Git repositories and never contact external remotes.

Run the checks before every push:

```sh
npm run check   # node --check on the entry points
npm test        # host and client tests
```

To try your working copy inside DSH, install it into a DSH profile as a link dependency, for example:

```sh
dsh plugin --profile <profile> add "link:<absolute path to this repository>"
```

The built-in desktop profile is owned by the desktop app, so use the runtime bundled with the app instead:

```sh
"<DSH runtime>/dependencies/node/bin/node.exe" \
  "<DSH runtime>/dependencies/pnpm/bin/pnpm.cjs" \
  --dir <profile directory> add "link:<absolute path to this repository>"
```

Restart the desktop app after changing host code. Run the full test suite before submitting changes that touch the host; the sandboxed Node test runner needs permission to spawn child processes.

## Pull requests

- One concern per pull request; split unrelated changes.
- Fill in the pull-request template, including how the change was verified.
- Keep `engines.dsh` unchanged unless the pull request is an explicit DSH compatibility update.
- Do not bump the version or edit `CHANGELOG.md` in a feature PR — releases are handled in a dedicated release PR.
- CI must be green on Ubuntu and Windows before merging. Review your own PR critically; a second pair of eyes is optional for this single-maintainer project.

Use **Squash and merge** so `main` keeps one commit per change.

## Releases

A release is a normal pull request plus one tag:

1. Open a release PR that bumps `version` in `package.json` and moves `CHANGELOG.md` from Unreleased to the release date. Title it `chore: release X.Y.Z`.
2. Merge it after CI passes.
3. Tag the merge commit and push the tag:

   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

The `Release` workflow verifies that the tag matches `package.json`, runs the checks and tests, publishes to npm, and creates a GitHub Release. Tags containing a pre-release suffix (for example `v0.3.0-rc.1`) publish under the `next` dist-tag; stable tags publish under `latest`.

Publishing needs one of:

- a repository secret named `NPM_TOKEN` with an npm token that may publish `dsh-git-multirepo`, or
- npm Trusted Publishing (OIDC) configured for this repository, in which case the token line can be removed from the workflow.

Manual equivalents, if CI is unavailable:

```sh
npm publish --tag next          # pre-release
npm publish                     # stable, moves latest
npm dist-tag ls dsh-git-multirepo
npm dist-tag add dsh-git-multirepo@X.Y.Z latest
```

Never publish from a local machine without a green CI run on the tag.

## Protecting `main` (maintainers)

After the repository adopts GitHub Flow, enable a ruleset or branch protection rule for `main` with:

- Require a pull request before merging; require one approval (self-approval is enough while the project is single-maintainer).
- Require the `CI` status checks to pass.
- Require linear history.
- Automatically delete head branches.

## Security

Please report vulnerabilities through the process in [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

By contributing you agree that your changes are released under the [MIT](LICENSE) license.
