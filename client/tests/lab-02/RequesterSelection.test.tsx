import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Lab2App from "../../src/Lab2App.js";
import * as api from "../../src/api.js";

// Deliberately not the seeded names: if the component hard-coded requesters
// in JSX instead of rendering the API result, these assertions would fail.
const REQUESTERS: api.DevelopmentRequester[] = [
  {
    id: 11,
    name: "Alpha Requester",
    email: "alpha@example.com",
    department: "Finance",
  },
  {
    id: 22,
    name: "Beta Requester",
    email: "beta@example.com",
    department: "Library",
  },
];

function mockRequesters(data = REQUESTERS) {
  return vi.spyOn(api, "fetchActiveRequesters").mockResolvedValue(data);
}

/** Selects a requester through the dropdown and presses Continue. */
async function chooseRequester(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  await user.selectOptions(
    await screen.findByLabelText(/development requester/i),
    screen.getByRole("option", { name }),
  );
  await user.click(screen.getByRole("button", { name: /continue/i }));
}

describe("Requester Selection", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // UI-01 / AC-01
  it("loads active requesters from the API into a dropdown", async () => {
    mockRequesters();
    render(<Lab2App />);

    const select = await screen.findByLabelText(/development requester/i);
    expect(select.tagName).toBe("SELECT");

    expect(
      await screen.findByRole("option", { name: /Alpha Requester/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Beta Requester/ }),
    ).toBeInTheDocument();
  });

  // UI-02 / AC-03 — the component renders exactly what the API returns, and
  // the API is the layer that filters inactive requesters out.
  it("shows only the requesters the API returns", async () => {
    mockRequesters([REQUESTERS[0]]);
    render(<Lab2App />);

    expect(
      await screen.findByRole("option", { name: /Alpha Requester/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Beta Requester/ }),
    ).not.toBeInTheDocument();
  });

  // AC — loading state
  it("shows a loading state while requesters are being fetched", async () => {
    let resolvePending: (value: api.DevelopmentRequester[]) => void = () => {};
    vi.spyOn(api, "fetchActiveRequesters").mockReturnValue(
      new Promise((resolve) => {
        resolvePending = resolve;
      }),
    );

    render(<Lab2App />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /loading development requesters/i,
    );

    resolvePending(REQUESTERS);
    expect(
      await screen.findByLabelText(/development requester/i),
    ).toBeInTheDocument();
  });

  // AC — empty state
  it("shows an empty state and no dropdown when no active requesters exist", async () => {
    mockRequesters([]);
    render(<Lab2App />);

    expect(
      await screen.findByText(/no active development requesters/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/development requester/i),
    ).not.toBeInTheDocument();
    // Continuation is impossible.
    expect(
      screen.queryByRole("button", { name: /continue/i }),
    ).not.toBeInTheDocument();
  });

  // AC — safe error state
  it("shows a safe error state with a retry action when the API fails", async () => {
    vi.spyOn(api, "fetchActiveRequesters").mockRejectedValue(
      new Error("Could not reach the server. Please try again."),
    );

    render(<Lab2App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/unable to load development requesters/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    // BR-39 — no server internals leak into the UI.
    expect(alert.textContent).not.toMatch(
      /prisma|postgres|stack|sql|at .*\.ts:/i,
    );
  });

  it("reloads the requesters when Retry is pressed", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(api, "fetchActiveRequesters")
      .mockRejectedValueOnce(new Error("Could not reach the server."))
      .mockResolvedValueOnce(REQUESTERS);

    render(<Lab2App />);

    await user.click(await screen.findByRole("button", { name: /retry/i }));

    expect(
      await screen.findByRole("option", { name: /Alpha Requester/ }),
    ).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  // AC — the selector is clearly identified as a testing mechanism (BR-04).
  it("identifies the selector as a testing mechanism, not authentication", async () => {
    mockRequesters();
    render(<Lab2App />);

    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent(/testing/i);
    expect(note).toHaveTextContent(/not a real login/i);
  });

  // AC-02 / BR-06 — the gate
  it("does not show requester-specific screens before a requester is selected", async () => {
    mockRequesters();
    render(<Lab2App />);

    await screen.findByLabelText(/development requester/i);
    expect(screen.queryByText(/requester context/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("current-requester")).not.toBeInTheDocument();
  });

  it("keeps Continue disabled until a requester is chosen", async () => {
    const user = userEvent.setup();
    mockRequesters();
    render(<Lab2App />);

    const continueButton = await screen.findByRole("button", {
      name: /continue/i,
    });
    expect(continueButton).toBeDisabled();

    await user.selectOptions(
      screen.getByLabelText(/development requester/i),
      screen.getByRole("option", { name: /Alpha Requester/ }),
    );
    expect(continueButton).toBeEnabled();
  });

  // AC — selected requester is displayed in the application shell
  it("displays the selected requester in the shell after selection", async () => {
    const user = userEvent.setup();
    mockRequesters();
    render(<Lab2App />);

    await chooseRequester(user, /Alpha Requester/);

    expect(await screen.findByTestId("current-requester")).toHaveTextContent(
      "Alpha Requester",
    );
    expect(screen.getByTestId("context-id")).toHaveTextContent("11");
  });

  // UI-03 / AC-04 — change requester, and the context reloads
  it("lets the user change requester and reloads the requester context", async () => {
    const user = userEvent.setup();
    mockRequesters();
    render(<Lab2App />);

    await chooseRequester(user, /Alpha Requester/);
    expect(await screen.findByTestId("context-id")).toHaveTextContent("11");

    await user.click(screen.getByRole("button", { name: /change requester/i }));

    // Back to the selector; the previous requester's context is gone.
    expect(
      await screen.findByLabelText(/development requester/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("context-id")).not.toBeInTheDocument();

    await chooseRequester(user, /Beta Requester/);

    expect(await screen.findByTestId("current-requester")).toHaveTextContent(
      "Beta Requester",
    );
    expect(screen.getByTestId("context-id")).toHaveTextContent("22");
  });

  it("remembers the selected requester across a reload", async () => {
    const user = userEvent.setup();
    mockRequesters();

    const first = render(<Lab2App />);
    await chooseRequester(user, /Beta Requester/);
    expect(await screen.findByTestId("context-id")).toHaveTextContent("22");
    first.unmount();

    render(<Lab2App />);
    expect(await screen.findByTestId("context-id")).toHaveTextContent("22");
  });

  it("falls back to the selector when the stored requester is no longer active", async () => {
    window.localStorage.setItem("toktickit.lab2.selectedRequesterId", "999");
    mockRequesters();

    render(<Lab2App />);

    // 999 is not in the active list, so the selector is shown instead.
    await waitFor(() =>
      expect(
        screen.getByLabelText(/development requester/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("current-requester")).not.toBeInTheDocument();
  });
});
