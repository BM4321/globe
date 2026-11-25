import type { Config } from "tailwindcss";

const v = (name: string) => `var(--${name})`;

export default {
  content: ["./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "surface-0": v("surface-0"),
        "surface-1": v("surface-1"),
        "surface-2": v("surface-2"),
        line: v("line"),
        "line-strong": v("line-strong"),
        ink: v("ink"),
        "ink-muted": v("ink-muted"),
        nav: v("nav"),
        brand: v("brand"),
        "brand-strong": v("brand-strong"),
        "brand-soft": v("brand-soft"),
        "brand-text": v("brand-text"),
        signal: v("signal"),
        "signal-soft": v("signal-soft"),
        "signal-text": v("signal-text"),
        success: v("success"),
        "success-soft": v("success-soft"),
        "success-text": v("success-text"),
        danger: v("danger"),
        "danger-soft": v("danger-soft"),
        "danger-text": v("danger-text"),
      },
      fontFamily: {
        sans: ["var(--font-archivo)", "Helvetica Neue", "Arial", "sans-serif"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
      },
    },
  },
  plugins: [],
} satisfies Config;
