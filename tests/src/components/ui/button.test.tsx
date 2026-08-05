import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders children and resolves the cn alias", () => {
    const { getByRole } = render(<Button>Save</Button>);
    expect(getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("supports the icon size variant", () => {
    const { getByRole } = render(<Button size="icon" aria-label="Icon" />);
    expect(getByRole("button", { name: "Icon" })).toBeInTheDocument();
  });
});
