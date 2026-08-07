import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";

function BrokenView(): never {
  throw new Error("sensitive internal detail");
}

describe("AppProviders", () => {
  afterEach(() => vi.restoreAllMocks());

  it("replaces a render crash with a recoverable sanitized screen", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <AppProviders>
        <BrokenView />
      </AppProviders>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Buzz couldn't open");
    expect(screen.getByRole("button", { name: "Reload application" })).toBeVisible();
    expect(screen.queryByText("sensitive internal detail")).not.toBeInTheDocument();
  });
});
