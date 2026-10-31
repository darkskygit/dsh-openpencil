# DSH OpenPencil

The DeepSeek Harness plugin for OpenPencil: preview, inspect, and edit real `.op`
design documents inside a conversation.

Fork of [ZSeven-W/dsh-openpencil](https://github.com/ZSeven-W/dsh-openpencil).
The plugin drives a real, editable design canvas instead of returning a generated
image.

## What it does

- **Exact multi-frame previews** — the headless exporter renders the first
  top-level frame as a replay-safe PNG, plus a thumbnail rail with
  click-to-select and previous/next navigation.
- **Interactive canvas** — lazily mounts the read-only OpenPencil Web SDK with
  pan, zoom and fit, so any page, nested node or inactive page can be inspected
  without leaving the conversation.
- **Managed editor** — opens a live OpenPencil editor workbench bound to the
  document on disk.
- **Agent-native design tools** — the model creates and restructures nodes on the
  live canvas through structured tools.

## What this fork changes

- **Vendored tree instead of submodules.** `vendor/openpencil` and its three
  nested repositories (`agent`, `jian`, `casement`) are flattened into this
  repository with `git subtree`. Cloning needs no `--recursive`, and
  `vendor/openpencil.revision` records the pinned upstream commit.
- **No proprietary auth library.** The committed `op-auth` prebuilt matrix is
  removed, so the runtime links the inert auth stub. Sign-in and cross-device
  collaboration stay unavailable; local design, preview, export and MCP tooling
  are unaffected.
- **GitHub Packages instead of npmjs.** Releases publish to
  `https://npm.pkg.github.com` with the workflow's own token, under the
  `@darkskygit` scope.
- **Trimmed CI.** One check workflow and one release workflow remain. The release
  builds and packs the six platform packages, then publishes them native-first;
  the collaboration bootstrap secrets and the proprietary ABI gate are gone.
- **English README only.** The translated README files are removed.

## Install into DSH

Requires DSH. GitHub Packages needs an authenticated read, so map the scope once
with a classic token that carries `read:packages`:

```sh
npm config set @darkskygit:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken "$GITHUB_TOKEN"
dsh plugin --profile web add @darkskygit/dsh-openpencil@latest
dsh web
```

## License

MIT. `vendor/openpencil` and its vendored dependencies keep their own licenses;
see `THIRD_PARTY_NOTICES.md`.
