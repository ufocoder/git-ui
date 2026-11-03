const defaultTheme = require("tailwindcss/defaultTheme");
// Values live in src/theme.css; this file only maps them to utility names.
const fontSizes = Object.fromEntries(
  ["3xs", "2xs", ...Object.keys(defaultTheme.fontSize)].map(size => [size,
    [`var(--text-${size})`, { lineHeight: `var(--text-${size}-line)` }]])
);
const spacing = Object.fromEntries(Object.entries(defaultTheme.spacing).map(([key, value]) => [key,
  typeof value === "string" && value.endsWith("rem") ? `calc(var(--space-unit) * ${parseFloat(value) * 4})` : value
]));

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["variant", [".dark &", '[data-kb-theme="dark"] &']],
  content: ["./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    spacing,
    fontSize: fontSizes,
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px"
      }
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"]
      },
      fontSize: {
        diff: ["var(--diff-font-size)", { lineHeight: "var(--diff-line-height)" }]
      },
      fontWeight: Object.fromEntries(["normal", "medium", "semibold", "bold"].map(weight => [weight, `var(--weight-${weight})`])),
      height: {
        control: "var(--control-height)",
        "control-sm": "var(--control-height-sm)",
        "control-lg": "var(--control-height-lg)",
        "control-compact": "var(--control-height-compact)",
        "control-toolbar": "var(--control-height-toolbar)",
        "diff-row": "var(--diff-line-height)",
        "diff-header": "var(--diff-header-height)"
      },
      spacing: {
        "control-x": "var(--control-padding)",
        "control-sm-x": "var(--control-padding-sm)",
        "control-lg-x": "var(--control-padding-lg)"
      },
      lineHeight: { diff: "var(--diff-line-height)" },
      borderWidth: { DEFAULT: "var(--control-border-width)" },
      opacity: { disabled: "var(--disabled-opacity)" },
      ringWidth: { 2: "var(--focus-width)" },
      ringOffsetWidth: { 2: "var(--focus-offset)" },
      transitionDuration: { DEFAULT: "var(--interaction-duration)" },
      boxShadow: { sm: "var(--shadow-sm)", md: "var(--shadow-md)", lg: "var(--shadow-lg)" },
      colors: {
        overlay: "hsl(var(--dialog-overlay))",
        "sheet-overlay": "hsl(var(--sheet-overlay))",
        "branch-counter": "hsl(var(--branch-counter))",
        "branch-counter-foreground": "hsl(var(--branch-counter-foreground))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          selected: "hsl(var(--sidebar-selected))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))"
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))"
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))"
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))"
        },
        error: {
          DEFAULT: "hsl(var(--error))",
          foreground: "hsl(var(--error-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        }
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "var(--control-radius)",
        sm: "calc(var(--radius) - 4px)"
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--kb-accordion-content-height)" }
        },
        "accordion-up": {
          from: { height: "var(--kb-accordion-content-height)" },
          to: { height: 0 }
        },
        "content-show": {
          from: { opacity: 0, transform: "scale(0.96)" },
          to: { opacity: 1, transform: "scale(1)" }
        },
        "content-hide": {
          from: { opacity: 1, transform: "scale(1)" },
          to: { opacity: 0, transform: "scale(0.96)" }
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" }
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "content-show": "content-show 0.2s ease-out",
        "content-hide": "content-hide 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
}
