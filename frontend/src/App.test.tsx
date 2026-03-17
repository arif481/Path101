import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders app heading", () => {
    render(<App />);
    expect(screen.getByText("Path101 MVP")).toBeInTheDocument();
  });
});
