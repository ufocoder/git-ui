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

Dark overrides belong under `.dark, [data-kb-theme="dark"]`. Theme selection keeps
the existing behavior; this refactor does not add a new theme settings control.
The stylesheet loads in the document head, so the initial background uses the
same theme values as the mounted application.

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
