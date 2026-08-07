import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./src/renderer/index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // DESIGN.md direct brand/surface utilities
        void: "#08090a",
        carbon: "#0f1011",
        obsidian: "#161718",
        graphite: "#23252a",
        smoke: "#383b3f",
        ash: "#62666d",
        fog: "#8a8f98",
        mist: "#d0d6e0",
        bone: "#e5e5e6",
        paper: "#ffffff",
        "acid-lime": "#e4f222",
        "pulse-green": "#27a644",
        "coral-red": "#eb5757",
        "signal-teal": "#02b8cc",
        "iris-violet": "#6366f1",
        lavender: "#8b5cf6",
      },
      fontFamily: {
        sans: [
          '"Inter Variable"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          '"IBM Plex Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        // DESIGN.md type scale
        caption: ["13px", { lineHeight: "1.2" }],
        "body-sm": ["15px", { lineHeight: "1.6", letterSpacing: "-0.011em" }],
        "body-lg": ["20px", { lineHeight: "1.33", letterSpacing: "-0.012em" }],
        subheading: ["24px", { lineHeight: "1.33", letterSpacing: "-0.012em" }],
        "heading-sm": ["32px", { lineHeight: "1.13", letterSpacing: "-0.022em" }],
        heading: ["48px", { lineHeight: "1", letterSpacing: "-0.022em" }],
        "heading-lg": ["64px", { lineHeight: "1", letterSpacing: "-0.022em" }],
        display: ["72px", { lineHeight: "1", letterSpacing: "-0.022em" }],
      },
      letterSpacing: {
        tightest: "-0.022em",
        tight: "-0.011em",
      },
      fontWeight: {
        light: "300",
        regular: "400",
        w510: "510",
        w590: "590",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        pill: "9999px",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
