import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../../src/renderer/shared/i18n";

describe("I18nProvider", () => {
  afterEach(() => window.localStorage.removeItem("terminus-locale"));

  it("does not rewrite user text inside contenteditable regions", async () => {
    window.localStorage.setItem("terminus-locale", "zh-CN");
    render(
      <I18nProvider>
        <div
          aria-label="Editor"
          contentEditable
          role="textbox"
          suppressContentEditableWarning
        />
      </I18nProvider>,
    );

    const editor = screen.getByRole("textbox", { name: "Editor" });
    const text = document.createTextNode("w");
    await act(async () => {
      editor.append(text);
      await Promise.resolve();
    });
    await act(async () => {
      text.data = "whoami";
      await Promise.resolve();
    });

    expect(editor).toHaveTextContent("whoami");
  });

  it("continues translating ordinary document text", async () => {
    window.localStorage.setItem("terminus-locale", "zh-CN");
    render(
      <I18nProvider>
        <span>Servers</span>
        <input aria-label="Search history" placeholder="Search history" />
      </I18nProvider>,
    );

    expect(await screen.findByText("服务器")).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "搜索历史记录" }),
    ).toHaveAttribute("placeholder", "搜索历史记录");
  });
});
