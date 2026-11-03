# Application theme

[Back to README](../README.md) · [Development](development.md)

Edit **`src/theme.css`** to customize the desktop application's appearance.
It contains the design values for the light and dark themes. Components keep
layout and behavior; Tailwind maps the theme variables to existing utilities.
The landing page has its own stylesheet, `website/style.css`.

## Colors

Color variables contain HSL channels, without an `hsl()` wrapper. This preserves
Tailwind opacity modifiers such as `bg-muted/40`.

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 3% 20%;
  --primary: 150 25% 30%;
  --primary-foreground: 0 0% 100%;
  --sidebar-selected: 150 12% 85%;
  --branch-counter: 150 18% 45%;
}
```

Palette groups cover surfaces, text, borders, focus rings, selected branches,
branch counters, and semantic success/error/warning/info colors. Diff backgrounds
use those semantic colors. Dialog and sheet overlays use HSL channels with an
alpha value, for example `--dialog-overlay: 0 0% 0% / 0.2`.

Dark overrides belong under `.dark, [data-kb-theme="dark"]`. Choose a preset in **Settings → Appearance → Color theme**. The choice applies immediately
and persists in WebView local storage across restarts.
A synchronous `public/theme-init.js` script applies the stored theme before the
stylesheet loads, so a dark preset does not flash a light background on startup.
The source snapshot used for development also includes this public asset.

## Typography and density

- `--font-sans` and `--font-mono`: interface and code font families.
- `--font-body-size`, `--font-body-line`: inherited body typography.
- `--text-xs`, `--text-sm`, etc., with matching `-line` variables: utility sizes.
- `--weight-normal`, `--weight-medium`, `--weight-semibold`, `--weight-bold`:
  text weights.
- `--space-unit`: the standard spacing unit for padding, gaps, and standard sizes.
- `--diff-font-size`, `--diff-line-height`, `--diff-header-height`: diff density.

For example, make code slightly larger while keeping interface text unchanged:

```css
:root {
  --diff-font-size: 12px;
  --diff-line-height: 18px;
}
```

Changing `--space-unit` changes all standard Tailwind spacing, including icon
sizes and widths expressed with spacing utilities. Use control-specific variables
when only controls should change. Resizable pane proportions remain user
preferences, not theme settings.

Commit table row height and graph lane geometry remain fixed in the table and
virtualization code. Do not override their heights with CSS: scrolling and graph
coordinates must stay synchronized. Colors, fonts, node radius, and stroke width
are themeable without changing that geometry.

## Controls and effects

Control tokens define default, small, large, compact, and toolbar heights,
horizontal padding, border width, and corner radius. Shared buttons, inputs,
selects, and toolbar actions use these values. Explicit compact size overrides
remain supported in individual components.

`--radius` controls card/panel rounding; `--control-radius` controls medium-radius
controls. Shadow, focus ring, disabled opacity, interaction duration, and scrollbar
tokens are also in the theme file. Window and menu appearance animations remain
disabled; interaction duration applies to existing hover/focus transitions.

The graph uses `--graph-hue-start`, `--graph-hue-step`, saturation, lightness,
stroke width, node radius, and node border width. Set the hue step to `0` for a
single-color graph.

## Adding components

Use semantic utilities such as `bg-background`, `text-muted-foreground`,
`border-border`, and `font-sans`. Use `text-diff` for code and theme-backed control
sizes where appropriate. Avoid literal colors or arbitrary font sizes in JSX.
Add new design values to `src/theme.css`, with utility mappings in
`tailwind.config.cjs` if needed. Register custom size utilities in `src/lib/utils.ts`
when they must override existing component sizes through `cn()`.

Run the relevant checks:

```sh
npm run lint
npx tsc --noEmit
node --experimental-strip-types --test tests/theme-utilities.test.mjs
npm run build
```

## Included presets and palette sources

All preset values remain in `src/theme.css`, under `:root[data-theme="…"]`.
The bootstrap registry is in `public/theme-init.js`; `src/lib/theme-preferences.ts`
connects it to reactive UI settings. The original light and dark presets remain
available. Custom themes adapt these palettes to Git UI's semantic roles:

- **Night Owl Light**, by Sarah Drasner:
  [original palette](https://github.com/sdras/night-owl-vscode-theme/blob/main/themes/Night%20Owl-Light-color-theme.json).
- **Rosé Pine Moon**, by Rosé Pine:
  [original palette](https://github.com/rose-pine/vscode/blob/main/themes/rose-pine-moon-color-theme.json).
  The no-italics adaptation keeps interface text upright.
- **Noctis Hibernus**, by Liviu Schera:
  [original palette](https://github.com/liviuschera/noctis/blob/master/themes/hibernus.json).
- **macOS Modern Light — Ventura Xcode**, by David B. Waters:
  [original palette](https://github.com/davidbwaters/macos-modern-vscode-theme/blob/master/themes/color/big-sur-light/xcode-big-sur.json).

These are palette adaptations, not complete VS Code theme imports. Button,
muted-text, diff, and error colors are adjusted where needed for readable contrast.
Fonts, pane geometry, and interaction behavior stay consistent between presets.
Theme initialization, persistence, fallback behavior, and text contrast are covered
by `tests/theme-preferences.test.mjs`.
