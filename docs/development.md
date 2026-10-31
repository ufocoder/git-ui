# Руководство разработчика

[Вернуться к README](../README.md)

Все команды выполняются из корня проекта.

## Требования

- **Node.js 24** и npm (эта версия используется в CI).
- **Git** в `PATH` — приложение вызывает установленный Git.
- Для настольного приложения: **Rust stable** и Cargo через [rustup](https://rustup.rs/), а также системные зависимости ниже.
- Для работы с удалёнными репозиториями настройте SSH-ключи или Git credential helper.
  Приложение не запрашивает пароль в интерактивной консоли Git.

Проверить установленное окружение:

```sh
node --version
npm --version
git --version
rustc --version
cargo --version
```

Rust и системные библиотеки Tauri не нужны для просмотра интерфейса в браузере.

## Получение проекта

```sh
git clone https://github.com/ufocoder/git-ui.git
cd git-ui
npm ci
```

Если проект уже скачан, откройте его корневую папку и выполните `npm ci`.
Используйте lock-файлы из репозитория для воспроизводимой установки.

## Запуск как web

```sh
npm run dev
```

Откройте [localhost:1420](http://localhost:1420).
Изменения интерфейса автоматически обновляются в браузере.

**Web-режим предназначен для разработки интерфейса.** Выбор локальных папок,
Git-команды, окна приложения и обновления работают через Rust/Tauri и недоступны
в обычном браузере. Отдельного HTTP-сервера для Git-операций в проекте нет.
На главном экране без Tauri список недавних проектов не загружается.

Собрать и посмотреть web-версию:

```sh
npm run build
npm run serve
```

Готовые файлы находятся в `dist/`; адрес предпросмотра выводится в терминале.
Порт разработки `1420` фиксирован: перед запуском Tauri остановите отдельный
`npm run dev`, чтобы не занимать этот порт двумя процессами.

## Запуск на macOS

Установите Node.js 24, Git, Rust stable и Xcode Command Line Tools:

```sh
xcode-select --install
```

После установки зависимостей проекта запустите из его корня:

```sh
npm run tauri -- dev
```

Команда сама запускает Vite и собирает Rust backend, затем открывает приложение.
Первый запуск занимает больше времени из-за загрузки и компиляции Cargo-зависимостей.
Поддерживаются сборки для Apple Silicon и Intel; по умолчанию используется
архитектура текущей машины.

## Запуск на Windows

1. Установите Node.js 24 и Git for Windows; Git должен быть доступен в `PATH`.
2. Установите Visual Studio Build Tools с компонентами **Desktop development with C++**
   и Windows SDK.
3. Установите Microsoft Edge WebView2 Runtime, если его ещё нет в системе.
4. Установите Rust через rustup с toolchain **MSVC** для своей архитектуры.
5. Откройте новый PowerShell в корне проекта:

```powershell
npm ci
npm run tauri -- dev
```

Для нативной Windows-сборки запускайте команды в Windows, а не в WSL.

## Запуск на Linux

Установите Node.js 24, Git и Rust stable. Для Debian/Ubuntu установите
зависимости WebKitGTK и сборки:

```sh
sudo apt update
sudo apt install build-essential curl wget file libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf xdg-utils
```

Затем в корне проекта:

```sh
npm ci
npm run tauri -- dev
```

Для запуска нужен графический сеанс. Пакеты для Fedora, Arch и других
дистрибутивов, а также актуальные требования Windows/macOS перечислены в
[официальной инструкции Tauri](https://v2.tauri.app/start/prerequisites/).

## Сборка настольного приложения

Собирать установщик следует на целевой ОС; матрица GitHub Actions собирает
macOS, Windows и Linux отдельно.

Проверить release-сборку без установщика и подписания обновлений:

```sh
npm run tauri -- build --no-bundle -- --locked
```

Собрать установщики:

```sh
npm run tauri -- build
```

Результат находится в `src-tauri/target/release/bundle/`:

| ОС | Артефакты |
| --- | --- |
| macOS | `.app`, `.dmg` |
| Windows | `.exe` (NSIS), `.msi` |
| Linux | `.deb`, `.rpm`, `.AppImage` в зависимости от доступных инструментов сборки |

При явном `--target` артефакты находятся в
`src-tauri/target/<target>/release/bundle/`.
В конфигурации включены подписанные артефакты автообновления: для полного
пакетирования нужен `TAURI_SIGNING_PRIVATE_KEY` с ключом, соответствующим
`plugins.updater.pubkey`. Для обычной разработки ключ не требуется.
Не добавляйте закрытый ключ в Git. Подписание обновлений и системные сертификаты
Apple/Windows — отдельные настройки; текущий workflow не выполняет нотариализацию Apple.

## Проверки перед изменениями и PR

Все команды выполняются из корня проекта:

```sh
npm run lint
npx tsc --noEmit
node --experimental-strip-types --test tests/*.test.mjs
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Для автоматического исправления замечаний Oxlint: `npm run lint:fix`.
Rust-проверки требуют системных зависимостей соответствующей ОС.
CI запускает проверки frontend на Linux, Rust-тесты и нативную сборку на macOS.

## Изменение интерфейса

UI-компоненты не должны напрямую вызывать Git: используйте `src/lib/git.ts`,
а работу с процессами и файловой системой размещайте в Rust backend.
Для новых текстов добавляйте короткие ключи в `locales/ru.json` и используйте
`src/lib/i18n.ts`; Rust читает тот же словарь через `locale.rs`.

Добавить компонент Solid UI:

```sh
npx solidui-cli@latest add <component>
```

Конфигурация генератора находится в `ui.config.json`.

## Частые проблемы

- **Порт 1420 занят:** остановите предыдущий Vite/Tauri-процесс.
- **В браузере не работает выбор проекта:** запустите `npm run tauri -- dev`.
- **Git не найден:** проверьте `git --version` в том же окружении, где запускаете приложение.
- **Push/Fetch отклонены:** проверьте URL remote, права доступа и SSH/credential helper.
- **Сборка Linux не находит WebKitGTK:** нужны dev-пакеты версии 4.1.
- **Windows не находит linker:** проверьте C++ Build Tools и MSVC toolchain Rust.
- **Сборка просит ключ обновлений:** используйте `--no-bundle` для проверки либо настройте ключ для выпуска.

## GitHub Releases

`.github/workflows/release.yml` is independent from CI. It runs when a `v*` tag is
pushed, or manually from **Actions → Release → Run workflow**. Manual runs use the
version in the selected branch and create its tag automatically if needed.

Before a release, keep versions aligned in `package.json`, `package-lock.json`,
`src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `src-tauri/tauri.conf.json`.
For example, push `v0.1.0` to release application version `0.1.0`. Existing tags
must reference the commit being built; published versions cannot be overwritten.

The workflow validates/lints first, creates a draft, builds installers for macOS
Apple Silicon and Intel (`.dmg`/app), Windows (`.exe`/`.msi`) and Linux
(`.AppImage`/`.deb`), then publishes only after every build succeeds. Failed builds
leave the release as a draft; rerunning can reuse it. Versions with a suffix such
as `0.2.0-beta.1` are published as prereleases.

It uses the repository's automatic `GITHUB_TOKEN`; no personal token is needed.
The publishing jobs require `contents: write`. macOS uses ad-hoc signing; Apple
Developer signing/notarization and Windows certificate signing are not configured.
No release is published merely by adding this workflow file.

Test version checks locally with `node --test tests/release-meta.test.mjs`.


### In-app updates

Choose **Check for updates** in the application menu on macOS (Help menu on
Windows/Linux). The update window checks the latest published stable GitHub
release, shows update availability, downloads the signed artifact for this platform,
installs it, and restarts the app after the user confirms. Development builds
can check releases but cannot replace their running executable. A release
without updater artifacts offers a link to download its installer manually.

The default repository is configured in `settings.json` under
`updates.repository`. The update window only shows update status and actions. An existing override
in the Tauri app-data directory, `update-settings.json`, can also set the
repository; changing it does not change the trusted public key in
`src-tauri/tauri.conf.json`.

Before the next GitHub release:

1. Add the contents of the local `.updater/update.key` file to the repository's
   Actions secret **TAURI_SIGNING_PRIVATE_KEY**. This file is ignored by Git;
   keep a secure backup. The generated key has an empty password, so
   **TAURI_SIGNING_PRIVATE_KEY_PASSWORD** may stay unset.
2. Keep the matching public key in `plugins.updater.pubkey` in
   `src-tauri/tauri.conf.json`. Existing installations trust this key.
3. Bump the application version and run the Release workflow. It signs update
   archives and uploads `latest.json` and signatures alongside installers.
   Publication fails if signing is not configured or updater metadata is
   missing a supported platform.

Do not regenerate the signing key for each release. For a local signed bundle,
set `TAURI_SIGNING_PRIVATE_KEY` to the absolute path of `.updater/update.key`
when running the Tauri build. No release or GitHub secret is published by the
local implementation steps.
