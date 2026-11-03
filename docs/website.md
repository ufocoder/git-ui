# Landing page

[Back to README](../README.md)

The static landing page lives in `website/`. Installers remain in GitHub Releases;
they are not committed to the site or uploaded to Pages.

## Local preview

From the repository root:

```sh
npm run site:build
npm run site:dev
```

Open [localhost:1422](http://localhost:1422). The preview serves the generated
`website/dist/` directory; rebuild after editing source files. No desktop or Rust
build is required. To preview without GitHub access:

```sh
npm run site:build -- --offline
npm run site:dev
```

An offline build displays the upcoming-release state. The normal build queries
the latest stable release and generates `release.json`. A missing release or
installer produces a “Coming soon” label rather than a broken download link.
API errors other than a missing release fail the build to preserve the existing
published site. `GITHUB_TOKEN` is optional locally and supplied by the workflow.

## Enable GitHub Pages

1. Commit and push the website and `.github/workflows/pages.yml` to `main`.
2. In the repository, open **Settings → Pages** and choose **GitHub Actions**
   as the publishing source.
3. Run **Actions → Pages → Run workflow**, or push a website change to `main`.
4. Check the deployment URL shown by the workflow. For this repository it is
   `https://ufocoder.github.io/git-ui/`.

The workflow rebuilds on website changes, manual runs, published releases, and
successful completion of the Release workflow. The completion trigger also
handles releases created with `GITHUB_TOKEN`, which do not trigger another
workflow through the normal release event. Deployments use the `github-pages`
environment; its protection rules must allow deployment from `main`.

## Download links

The build uses `GITHUB_REPOSITORY` in Actions. Locally it defaults to the repository
configured in `settings.json` under `updates.repository`.

Installer matching is defined in `website/scripts/release.mjs`:

- macOS Apple Silicon: `aarch64` or `arm64` DMG.
- macOS Intel: `x64` or `x86_64` DMG.
- Windows: `x64` or `x86_64` EXE.
- Linux: `amd64`, `x86_64`, or `x64` AppImage.

Signatures and updater archives are excluded. Missing platform installers stay
unavailable even if other platforms have a download. The main button suggests
Windows or Linux when detected; macOS users explicitly choose Apple Silicon or
Intel because browser architecture detection is unreliable. The full platform
list is always available.

The hero includes a responsive HTML/CSS interface illustration, labeled as such.
No analytics or external font service is required.

Run download-mapping tests with:

```sh
node --test tests/website-release.test.mjs
```
