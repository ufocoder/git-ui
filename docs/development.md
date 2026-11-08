# Development

[Back to README](../README.md)

Run all commands from the repository root.

## Requirements

- Node.js 24 and npm, matching CI.
- Git available in `PATH`.
- For the desktop app: Rust stable and Cargo installed through
  [rustup](https://rustup.rs/), plus the platform dependencies below.
- For remote operations: configured SSH authentication or a Git credential helper.
  The app does not prompt for passwords in an interactive Git console.

```sh
node --version
npm --version
git --version
rustc --version
cargo --version
```

Rust and native system libraries are not required to preview the UI in a browser.

## Install dependencies

```sh
git clone https://github.com/ufocoder/git-ui.git
cd git-ui
npm ci
```

Use the committed lockfiles for reproducible installs.

## Web development

```sh
npm run dev
```

Open [localhost:1420](http://localhost:1420). Vite reloads the UI as you edit it.

Browser mode is for UI development. Folder selection, Git operations, and app
updates require the Rust/Tauri backend and are unavailable in a normal browser.
There is no separate HTTP server for Git operations. Recent projects are not
loaded outside Tauri.

To build and preview the web assets:

```sh
npm run build
npm run serve
```

The output is written to `dist/`; the preview command prints its address.
The development port is fixed at `1420`. Stop a standalone Vite process before
starting Tauri, which starts Vite automatically.

## macOS

Install Node.js 24, Git, Rust stable, and Xcode Command Line Tools:

```sh
xcode-select --install
```

Then start the desktop app:

```sh
npm run tauri -- dev
```

This starts Vite and the Rust backend from an isolated source snapshot, then opens the app. The first launch
can take longer while Cargo downloads and compiles dependencies. Local builds
use the host architecture by default; release builds support Apple Silicon and
Intel Macs.

## Safe development runtime

`npm run tauri -- dev` starts the app from a temporary source snapshot. This lets
you open this project's real working folder and switch its branches without
replacing the files used by Vite or the Rust process. Dependencies and the Cargo
build cache are shared; source files, configuration, and bundled locale data are
copied. Temporary files are removed when the command exits.

Restart the command to load source changes. For UI/backend editing with normal
hot reload, explicitly use:

```sh
npm run tauri -- dev --live
```

Live mode protects its own source checkout from branch switching, commit Checkout,
and stash save/apply. Use snapshot mode, a built app, or a different checkout for
those operations. Other Tauri commands, including release builds, use the original
working folder as before. Stop the previous dev process before restarting so port
1420 is available.

## Windows

1. Install Node.js 24 and Git for Windows, with Git available in `PATH`.
2. Install Visual Studio Build Tools with **Desktop development with C++** and
   the Windows SDK.
3. Install Microsoft Edge WebView2 Runtime if it is not already available.
4. Install Rust through rustup using the MSVC toolchain for your architecture.
5. Open a new PowerShell session in the project root:

```powershell
npm ci
npm run tauri -- dev
```

Build the Windows x64 installer from PowerShell on Windows:

```powershell
npm run tauri -- build --target x86_64-pc-windows-msvc --bundles nsis -- --locked
```

The installer is written to `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`.
For a local executable without an installer or an updater signature, use
`npm run tauri -- build --no-bundle -- --locked`.

## Linux

Install Node.js 24, Git, and Rust stable. On Debian/Ubuntu, install the native
build dependencies:

```sh
sudo apt update
sudo apt install build-essential curl wget file libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf xdg-utils
```

Then run:

```sh
npm ci
npm run tauri -- dev
```

A graphical session is required. See the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for other
Linux distributions and platform requirements.

## Desktop builds

Build on the target operating system. To verify a release binary without bundling
installers or signing update artifacts:

```sh
npm run tauri -- build --no-bundle -- --locked
```

To create installers:

```sh
npm run tauri -- build
```

Artifacts are written to `src-tauri/target/release/bundle/`, or
`src-tauri/target/<target>/release/bundle/` when using an explicit `--target`.

| Platform | Bundle formats |
| --- | --- |
| macOS | `.app`, `.dmg` |
| Windows | `.exe` (NSIS), `.msi` |
| Linux | `.deb`, `.rpm`, `.AppImage`, depending on available build tools |

Updater artifacts are enabled in the Tauri configuration. Full packaging requires
`TAURI_SIGNING_PRIVATE_KEY` matching `plugins.updater.pubkey`; normal development
and `--no-bundle` builds do not require it. See [Releases](releases.md) for signing
and publishing instructions.

## Checks

```sh
npm run lint
npx tsc --noEmit
node --experimental-strip-types --test tests/*.test.mjs
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Use `npm run lint:fix` to apply automatic Oxlint fixes. Rust checks require the
native dependencies for your operating system. CI runs frontend checks on Linux
and native builds on macOS and Windows. The release workflow packages macOS
installers for Apple Silicon and Intel, plus an NSIS installer for Windows x64.

## Styling

Customize the application in `src/theme.css`. See [Application theme](theming.md)
for color, typography, control, diff, and graph tokens.

## Implementation guidelines

UI components should call `src/lib/git.ts` rather than invoke Git directly.
Keep process execution and filesystem operations in the Rust backend.

Add short translation keys to both `locales/ru.json` and `locales/en.json`.
Use `src/lib/i18n.ts` in the frontend; the Rust backend uses the same dictionaries
through `locale.rs`. Keep keys and placeholders consistent across both languages.

To add a Solid UI component:

```sh
npx solidui-cli@latest add <component>
```

The generator configuration is in `ui.config.json`. Reuse the shared components
in `src/components/ui` for consistent controls and dialogs.

## Troubleshooting

- **Port 1420 is occupied:** stop the previous Vite or Tauri process.
- **Folder selection does not work in the browser:** use `npm run tauri -- dev`.
- **Git is missing:** check `git --version` in the environment launching the app.
- **Push or fetch fails:** check the remote URL, permissions, SSH setup, and
  credential helper. Inspect the Terminal panel for operation output.
- **Linux cannot find WebKitGTK:** install the development packages for version 4.1.
- **Windows cannot find a linker:** check C++ Build Tools and the Rust MSVC toolchain.
- **Packaging requires an updater key:** configure signing or use `--no-bundle`
  to verify the binary without installers.
