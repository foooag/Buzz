import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapsLockIndicator } from "@/components/ui/caps-lock-indicator";

function Setup() {
  return (
    <label>
      Password
      <input type="password" aria-label="Password" />
      <CapsLockIndicator />
    </label>
  );
}

const wrapper = () =>
  screen.getByLabelText("Caps Lock is on").closest("span") as HTMLElement;

const dispatchKeyup = (capsLock: boolean) => {
  // jsdom reads Caps Lock through KeyboardEventInit's modifierCapsLock option.
  // act() flushes the state update triggered by the window event listener.
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keyup", { key: "a", modifierCapsLock: capsLock }),
    );
  });
};

describe("CapsLockIndicator", () => {
  it("is hidden until a keyup reports Caps Lock active", () => {
    render(<Setup />);
    expect(wrapper()).toHaveClass("hidden");
  });

  it("appears when a keyup reports Caps Lock active", () => {
    render(<Setup />);
    dispatchKeyup(true);
    expect(wrapper()).not.toHaveClass("hidden");
    expect(screen.getByLabelText("Caps Lock is on")).toBeInTheDocument();
  });

  it("hides again when a keyup reports Caps Lock off", () => {
    render(<Setup />);
    dispatchKeyup(true);
    expect(wrapper()).not.toHaveClass("hidden");
    dispatchKeyup(false);
    expect(wrapper()).toHaveClass("hidden");
  });
});

