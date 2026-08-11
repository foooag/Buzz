import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TiptapTestPage } from "../../../../src/renderer/features/workspace/TiptapTestPage";

describe("TiptapTestPage", () => {
  it("renders an isolated Tiptap editor", async () => {
    render(<TiptapTestPage />);

    expect(
      await screen.findByRole("textbox", { name: "Tiptap test input" }),
    ).toBeVisible();
  });
});
