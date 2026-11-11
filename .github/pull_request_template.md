## What changed

<!-- A short summary of the change and its user-visible effect. -->

## Why

<!-- Link the issue or explain the motivation. -->

## How to verify

- [ ] `npm run check`
- [ ] `npm test` (CI also runs this on Ubuntu and Windows with Node 20 and 24)
- [ ] `npm pack --dry-run` includes the expected files
- [ ] Manually tested in DSH (paste steps or a screenshot for UI changes)
- [ ] Updated `README.md` / `README-zh.md` if behavior or UI changed
- [ ] Updated `SECURITY.md` if the route surface or trust model changed

## Compatibility and risk

- [ ] `engines.dsh` unchanged (DSH compatibility PRs must state the new supported range)
- [ ] No version bump or `CHANGELOG.md` edit (release PRs only)
- [ ] No new Git network access outside the existing **Fetch** path
- [ ] Windows-safe: paths and shell quoting handled, CI green on Windows

Closes #
