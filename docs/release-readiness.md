# Release readiness checks

## Remote operations

Git fetch, push, pull, clone and ls-remote have a 120-second deadline. On expiry,
Git and its SSH / credential-helper descendants are terminated. A timeout does
not prove that a remote rejected a push: inspect local and remote state before
retrying. Existing SSH agents and credential helpers remain in use.

Automated Rust tests check an HTTP authentication rejection, an unavailable
loopback SSH endpoint, child-process timeout and preservation of HEAD, index and
working files. They do not use production credentials or third-party servers.

For a read-only check against your actual authenticated repositories:

```sh
node scripts/check-remotes.mjs git@github.com:OWNER/PRIVATE_REPO.git https://github.com/OWNER/PRIVATE_REPO.git
```

Use private test repositories to establish that authentication works; a public
repository does not prove successful authentication. Do not embed tokens in URLs.
Before release also verify revoked credentials, disconnected network and rejected
push with a disposable remote. This manual matrix is not replaced by loopback tests.

## Windows backend

CI runs the complete Rust suite on macOS and Windows. Release builds run it on
Apple Silicon and Windows too; Intel builds cross-compile on the macOS runner.
Git automatic CRLF conversion is disabled in CI. Unix-only filename and symlink
cases stay on Unix; common filename, staging and recovery tests run on Windows.

## Native UI smoke

Windows CI builds an application containing the real frontend and Rust backend,
then drives its WebView through a matching Edge WebDriver.
There is no mocked Git IPC. The suite uses disposable repositories and an isolated
application profile under a separate test application identifier; it must never run against user repositories.

Covered: opening a recent project, staging, creating a commit, refreshing after
an external edit, discarding with a Stash backup, applying that backup, and switching
projects. Risk scenarios also cover confirmed hard reset, selecting and squashing
a linear commit range, restoring the original history, rebasing onto another
branch, resolving a real text conflict and continuing the merge. It checks the resulting Git files/history and captures screenshots and
WebDriver logs in the `native-ui-results` CI artifact, including failures.

Run on Windows after installing matching msedgedriver:

```sh
npm run tauri -- build --debug --features native-e2e --no-bundle --config tests/native/tauri.conf.json -- --locked
npm run test:native
```

This suite tests the built application, not installation or an updater migration.
A successful CI run is required before calling Windows native smoke verified.
The risk scenarios validate Git state and file contents after each UI action.
For installed release builds, repeat the suite manually on macOS as well: this
Windows WebDriver setup does not establish macOS UI behavior or installer correctness.

The `native-e2e` feature is debug-only and explicitly forwards the driver's
WebView2 browser arguments to the test window. Elevated Windows hosts can ignore
the environment-only override (https://github.com/tauri-apps/wry/issues/1782).
The feature is never enabled for normal builds and refuses release compilation.
