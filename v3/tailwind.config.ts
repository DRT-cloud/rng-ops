import type { Config } from "tailwindcss";

export default {
  content: ["./app/index.html", "./app/src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        rng: {
          bg: {
            base: "var(--rng-bg-base)",
            surface: "var(--rng-bg-surface)",
            elevated: "var(--rng-bg-elevated)",
          },
          border: "var(--rng-border)",
          text: {
            primary: "var(--rng-text-primary)",
            body: "var(--rng-text-body)",
            muted: "var(--rng-text-muted)",
          },
          action: {
            DEFAULT: "var(--rng-action)",
            hover: "var(--rng-action-hover)",
          },
          info: {
            DEFAULT: "var(--rng-info)",
            hover: "var(--rng-info-hover)",
          },
          warning: "var(--rng-warning)",
          status: {
            ok: "var(--rng-status-ok)",
            pending: "var(--rng-status-pending)",
            edited: "var(--rng-status-edited)",
            error: "var(--rng-status-error)",
          },
        },
      },
      fontFamily: {
        display: "var(--rng-font-display)",
        body: "var(--rng-font-body)",
        mono: "var(--rng-font-mono)",
      },
      letterSpacing: {
        display: "0.05em",
      },
      borderRadius: {
        action: "4px",
        card: "8px",
      },
      boxShadow: {
        card: "0 2px 12px rgba(0,0,0,0.5)",
      },
    },
  },
  plugins: [],
} satisfies Config;
