import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LexicalTestPage } from "../../../../src/renderer/features/workspace/LexicalTestPage";

describe("LexicalTestPage", () => {
  it("renders an isolated Lexical composer input", async () => {
    render(<LexicalTestPage />);

    expect(
      await screen.findByRole("textbox", { name: "Lexical test input" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Lexical test input event log")).toBeVisible();
  });
});
