import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./theme-provider";

/** Stub matchMedia with a controllable `matches` and change dispatch. */
function stubMatchMedia(prefersDark: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.add(l),
    removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.delete(l),
    dispatchEvent: () => false,
  };
  vi.stubGlobal("matchMedia", () => mql);
  return {
    setPrefersDark(next: boolean) {
      mql.matches = next;
      for (const l of listeners) l({ matches: next } as MediaQueryListEvent);
    },
  };
}

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <>
      <div data-testid="theme">{theme}</div>
      <div data-testid="resolved">{resolvedTheme}</div>
      <button onClick={() => setTheme("light")}>to-light</button>
      <button onClick={() => setTheme("dark")}>to-dark</button>
      <button onClick={() => setTheme("system")}>to-system</button>
    </>
  );
}

function renderWithProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    vi.unstubAllGlobals();
  });

  it("defaults to light when the OS prefers light", () => {
    stubMatchMedia(false);
    renderWithProbe();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
  });

  it("applies the dark class when Dark is chosen", () => {
    stubMatchMedia(false);
    renderWithProbe();
    act(() => screen.getByText("to-dark").click());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("persists the choice to localStorage", () => {
    stubMatchMedia(false);
    renderWithProbe();
    act(() => screen.getByText("to-dark").click());
    expect(window.localStorage.getItem("terminus-theme")).toBe("dark");
  });

  it("rehydrates from localStorage on mount", () => {
    window.localStorage.setItem("terminus-theme", "dark");
    stubMatchMedia(false);
    renderWithProbe();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("follows the OS preference in system mode", () => {
    stubMatchMedia(true);
    renderWithProbe();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
  });
});
