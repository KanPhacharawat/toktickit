import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import * as api from "../../src/api.js";

// Deliberately NOT the four seeded names. If the component hard-coded the real
// categories in JSX, these assertions would fail — which is the point.
const FAKE_CATEGORIES = [
  { id: 1, name: "Alpha Category" },
  { id: 2, name: "Beta Category" },
];

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // WORKED EXAMPLE — provided for you.
  it("renders the TokTickIT heading", () => {
    render(<App />);
    expect(screen.getByText(/TokTickIT/i)).toBeInTheDocument();
  });

  it("shows Online and the categories returned by the API on success", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "checkSystem").mockResolvedValue({
      online: true,
      categories: FAKE_CATEGORIES,
    });

    render(<App />);
    await user.click(screen.getByRole("button", { name: /check system/i }));

    expect(await screen.findByText(/Online/i)).toBeInTheDocument();
    expect(await screen.findByText("Alpha Category")).toBeInTheDocument();
    expect(screen.getByText("Beta Category")).toBeInTheDocument();
  });

  it("shows a loading state while the request is in flight", async () => {
    const user = userEvent.setup();
    let resolvePending: (value: api.SystemStatus) => void = () => {};
    vi.spyOn(api, "checkSystem").mockReturnValue(
      new Promise<api.SystemStatus>((resolve) => {
        resolvePending = resolve;
      }),
    );

    render(<App />);
    await user.click(screen.getByRole("button", { name: /check system/i }));

    expect(screen.getByText(/loading categories/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /loading/i })).toBeDisabled();

    resolvePending({ online: true, categories: FAKE_CATEGORIES });
    expect(await screen.findByText("Alpha Category")).toBeInTheDocument();
  });

  it("shows an Offline error message when the API is unavailable", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "checkSystem").mockRejectedValue(
      new Error("Backend is unavailable"),
    );

    render(<App />);
    await user.click(screen.getByRole("button", { name: /check system/i }));

    expect(await screen.findByText(/Offline/i)).toBeInTheDocument();
    expect(screen.getByText(/backend is unavailable/i)).toBeInTheDocument();
  });
});
