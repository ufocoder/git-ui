import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Keep component overrides working with semantic utilities backed by theme.css.
const mergeClasses = extendTailwindMerge({
  extend: {
    classGroups: {
      h: [{ h: ["control", "control-sm", "control-lg", "control-compact", "control-toolbar", "diff-row", "diff-header"] }],
      px: [{ px: ["control-x", "control-sm-x", "control-lg-x"] }],
      "font-size": [{ text: ["3xs", "2xs", "diff"] }],
      leading: [{ leading: ["diff"] }],
    }
  }
})

export function cn(...inputs: ClassValue[]) {
  return mergeClasses(clsx(inputs))
}
