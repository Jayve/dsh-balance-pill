# Contributing

Thanks for taking the time to improve Balance Pill. This is a small,
dependency-free plugin; focused patches are easy to review.

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

- Node.js `^22.19.0` or `>=24.0.0`.
- DeepSeek Harness `0.2.1-rc.2` to `0.2.x` for manual testing.
- No `npm install` is required: the package has no runtime or development
  dependencies.

```sh
git clone https://github.com/Jayve/dsh-balance-pill.git
cd dsh-balance-pill
npm test
npm run pack:check
```

## What to test

- `npm test` runs both suites with `node --test`.
- Host changes: add or update a case in `test/host.test.mjs`.
- Ledger, storage, formatting, or translation changes: add or update a case in
  `test/client.test.mjs`.
- Packaging changes: `npm run pack:check` must keep `cordis.patch.yml`,
  `client.js`, `index.js`, `locale/`, `icon.svg`, the READMEs, and
  `docs/preview.svg` in the tarball.

Manual check against a real Harness install:

```sh
dsh plugin --profile web add ./dsh-balance-pill
dsh web --profile web
```

Confirm the pill appears in the composer dock, the balance matches the account
menu, and `web_fetch`-style local traffic is unaffected. Restart the process
after Host edits; reload the page after client edits.

## Style

- Two spaces, single quotes, no semicolons, trailing commas where the existing
  code uses them.
- ES modules only; the Host module must stay importable by plain Node.
- JSDoc on exported functions and any non-obvious contract.
- No new runtime dependency without an issue that explains why the dependency
  deletes more code than it adds. The plugin intentionally ships plain
  JavaScript with no build step.
- Keep the UI copy in the locale dictionaries or the local `EN`/`ZH` maps; do
  not hardcode user-visible strings in components.
- The Host route is a security boundary: keep the loopback check, the
  loopback-authority check, the `GET`-only check, and the no-store headers.

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/), for example:

```text
fix(client): keep the ledger when a refresh fails
docs: explain the multi-session caveat
feat(host): read the Web host release for client identity
```

A pull request should:

- Explain the user-visible change and the failure it fixes.
- Include tests for behavior changes.
- Update `README.md` and `README.zh-CN.md` when user-facing behavior changes.
- Update `docs/architecture.md` when the route, ledger, or security boundary
  changes.
- Add a `CHANGELOG.md` entry under `Unreleased`.
- Pass `npm test` and `npm run pack:check`.

## Reporting bugs

Open a [bug report](https://github.com/Jayve/dsh-balance-pill/issues/new/choose)
with:

- Harness version (`DeepSeek Harness` → About, or the desktop version file).
- Operating system and whether the build is Desktop or CLI Web.
- How the plugin was installed (npm, GitHub, local checkout) and the profile
  name.
- The pill's tooltip text or the route response, with any account details
  removed.
- The relevant Host log lines, if any.

Do not paste account tokens, cookies, or full `localStorage` dumps.

## Security reports

Do not open a public issue for a vulnerability. Follow
[SECURITY.md](SECURITY.md).

## Publishing and community listing

The repository is shaped for the DSH community indexes:

- Keep the repository public and add the `dsh-plugin` topic, plus
  `deepseek-harness` and `dsh` for discovery.
- Set the GitHub description to the one-sentence value proposition and keep the
  repository URL in `package.json` current.
- Keep a copy-paste `dsh plugin --profile web add …` command in both READMEs;
  directory scanners look for it.
- Submit the repository at <https://dsh-plugin.org/submit> and to the
  community awesome lists. Listing is free and driven by the public repository,
  the topic, and the README.
- For npm, run `npm publish --access public` locally or push a `vX.Y.Z` tag and
  let `.github/workflows/release.yml` publish with the `NPM_TOKEN` secret.
- The published package is maintained by the `jayve-dev` npm account;
  `NPM_TOKEN` must be a token from that account with publish rights. GitHub
  repository URLs stay under the GitHub account `Jayve`; do not replace them
  with the npm login.
- Create a GitHub release from the tag with the matching `CHANGELOG.md` entry.

## License

By contributing, you agree that your contribution is licensed under the
[MIT License](LICENSE).
