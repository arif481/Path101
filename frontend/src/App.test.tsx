import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Mock Firebase before importing App
vi.mock("./firebase/config", () => ({
  app: {},
  auth: { onAuthStateChanged: vi.fn(() => () => {}), currentUser: null },
  db: {},
}));

vi.mock("./firebase/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: null,
    profile: null,
    loading: false,
    isAdmin: false,
    signInAnonymous: vi.fn(),
    signUp: vi.fn(),
    signIn: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOutUser: vi.fn(),
    resetPassword: vi.fn(),
    confirmPasswordReset: vi.fn(),
  }),
}));

import { render, screen } from "@testing-library/react";
import { App } from "./App";

afterEach(() => {
  cleanup();
});

describe("App", () => {
  it("renders auth screen with Path101 branding", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Path101" })).toBeInTheDocument();
  });

  it("shows Google sign-in button", () => {
    render(<App />);
    expect(screen.getByText("Continue with Google")).toBeInTheDocument();
  });

  it("shows anonymous sign-in option", () => {
    render(<App />);
    expect(screen.getByText(/Continue anonymously/)).toBeInTheDocument();
  });
});
