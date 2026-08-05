import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "@/shared/theme/theme-provider";
import { ThemeToggle } from "@/shared/theme/theme-toggle";

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("exposes an accessible theme button", () => {
    renderToggle();
    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  });

  it("switches to dark and persists when Dark is chosen", async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    await user.click(screen.getByRole("menuitem", { name: /dark/i }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("terminus-theme")).toBe("dark");
  });

  it("switches to light when Light is chosen", async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    await user.click(screen.getByRole("menuitem", { name: /light/i }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("terminus-theme")).toBe("light");
  });
});
