import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { PrimaryNavigation } from "../../../../src/renderer/features/workspace/PrimaryNavigation";

describe("PrimaryNavigation Agent destination", () => {
  it("renders and activates Agent", async () => {
    render(
      <MemoryRouter initialEntries={["/servers"]}>
        <PrimaryNavigation />
        <Routes>
          <Route path="/servers" element={<div>Servers route</div>} />
          <Route path="/agent" element={<div>Agent route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole("link", { name: "Agent" }));

    expect(screen.getByText("Agent route")).toBeVisible();
    expect(screen.getByRole("link", { name: "Agent" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
