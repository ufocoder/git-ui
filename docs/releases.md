# Releases and updates

[Back to README](../README.md) · [Development](development.md)

## GitHub Releases

The Release workflow in `.github/workflows/release.yml` is independent from CI.
It runs when a `v*` tag is pushed, or manually from
**Actions → Release → Run workflow**. A manual run uses the application version
on the selected branch and creates its tag if needed.

Before publishing:

1. Configure the updater signing secret as described below.
2. Keep the application version aligned in `package.json`, `package-lock.json`,
   `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.
3. Commit and push the release changes.
4. Run the workflow manually, or create and push the matching version tag:

```sh
git tag v0.1.0
git push origin v0.1.0
```

Replace `0.1.0` with the new application version. An existing tag must point to
exactly the commit being built. Published releases cannot be overwritten; use a
new version instead.

The workflow validates versions, runs checks, creates a draft, and builds:

| Platform | Architecture | Installers |
| --- | --- | --- |
| macOS | Apple Silicon and Intel | `.dmg`, app bundle |
| Windows | x64 | NSIS `.exe`, `.msi` |
| Linux | x64 | `.AppImage`, `.deb` |

After all builds succeed, it validates updater metadata and publishes the release.
A failed build leaves the release as a draft; rerunning can reuse it. Versions
with suffixes such as `0.2.0-beta.1` are published as prereleases.

The workflow uses the automatic `GITHUB_TOKEN` with `contents: write` for publishing;
a personal access token is not required. macOS builds use ad-hoc signing. Apple
Developer signing, notarization, and Windows certificate signing are not configured.
Updater signing is separate from operating-system code signing.

To check release validation locally:

```sh
node --test tests/release-meta.test.mjs tests/updater-manifest.test.mjs
```

## Updater signing

1. Store the contents of the existing `.updater/update.key` file in the repository's
   Actions secret **TAURI_SIGNING_PRIVATE_KEY**. The file is ignored by Git; keep
   a secure backup. If the key has an empty password,
   **TAURI_SIGNING_PRIVATE_KEY_PASSWORD** may remain unset. Otherwise, set it to
   the key password.
2. Keep the corresponding public key in `plugins.updater.pubkey` in
   `src-tauri/tauri.conf.json`. Installed applications trust this public key.
3. Publish a new version using the Release workflow. It uploads signed update
   artifacts, signatures, and `latest.json` alongside installers.

Do not generate a new signing key for each release. Publishing fails if the
signing secret is missing or the updater manifest lacks a required platform.
Never commit the private key or include it in logs.

For a local signed bundle, set `TAURI_SIGNING_PRIVATE_KEY` to the absolute path
of the key file before running `npm run tauri -- build`. Set
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if needed. Local builds do not publish a
release or configure GitHub secrets.

## In-app updates

Choose **Check for updates** in the application menu on macOS, or the Help menu
on Windows/Linux. Menu labels follow the selected language. The dialog checks
the latest published stable GitHub release and offers to update or close.
After confirmation, the app downloads the signed artifact, installs it, and
restarts. Development builds can check releases but cannot replace their running
executable. Releases without updater artifacts offer a manual installer download.

The default repository is set in `settings.json` under `updates.repository`.
An override can be stored in `update-settings.json` in the Tauri app-data directory.
The dialog does not display the repository source. Changing the repository does
not change the trusted public key in `src-tauri/tauri.conf.json`.
