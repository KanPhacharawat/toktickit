import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import Forbidden from "../../src/Forbidden.js";
import NotFound from "../../src/NotFound.js";
import * as api from "../../src/api.js";
import * as authApi from "../../src/authApi.js";
import { REQUESTER, STAFF, renderApp } from "../lab-03/authTestUtils.js";

// Lab 4 Navigation and App Shell — tests.md C-05 (FR-17, AC-30), plus the
// hamburger drawer and Forbidden/Not Found route guards from ui-spec.md §2.

const ADMIN = { ...STAFF, id: 3, name: "Ada Admin", role: "Administrator" as const };

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("Dashboard nav item per role, and post-login landing (AC-30)", () => {
  it("Requester: sees Dashboard · My Tickets · Create Ticket, lands on Dashboard active", async () => {
    renderApp(REQUESTER);

    await screen.findByRole("heading", { name: /welcome, pat!/i });
    const nav = screen.getByRole("navigation", { name: /main/i });
    expect(within(nav).getByRole("button", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("button", { name: /^my tickets$/i })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /^create ticket$/i })).toBeInTheDocument();
  });

  it("IT Staff: sees Dashboard · Ticket Queue, lands on Dashboard active", async () => {
    vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(STAFF);
    renderApp(STAFF);

    await screen.findByRole("heading", { name: /welcome back, sam!/i });
    const nav = screen.getByRole("navigation", { name: /main/i });
    expect(within(nav).getByRole("button", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("button", { name: /^ticket queue$/i })).toBeInTheDocument();
  });

  it("Administrator: sees Dashboard · Ticket Queue · Users, lands on Dashboard active", async () => {
    renderApp(ADMIN);

    await screen.findByRole("heading", { name: /welcome back, ada!/i });
    const nav = screen.getByRole("navigation", { name: /main/i });
    expect(within(nav).getByRole("button", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("button", { name: /^ticket queue$/i })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /user management/i })).toBeInTheDocument();
  });

  it("moves aria-current to the clicked destination and off Dashboard", async () => {
    renderApp(REQUESTER);
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: /welcome, pat!/i });
    const nav = screen.getByRole("navigation", { name: /main/i });
    await user.click(within(nav).getByRole("button", { name: /^my tickets$/i }));

    await screen.findByRole("heading", { name: /my tickets/i });
    expect(within(nav).getByRole("button", { name: /^my tickets$/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("button", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});

describe("No broken links in the navigation", () => {
  it("every Requester nav destination renders its screen with no console errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderApp(REQUESTER);
    vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue([]);
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: /welcome, pat!/i });
    const nav = screen.getByRole("navigation", { name: /main/i });

    await user.click(within(nav).getByRole("button", { name: /^create ticket$/i }));
    await screen.findByRole("form", { name: /create ticket/i });

    await user.click(within(nav).getByRole("button", { name: /^my tickets$/i }));
    await screen.findByRole("heading", { name: /my tickets/i });

    await user.click(within(nav).getByRole("button", { name: "Dashboard" }));
    await screen.findByRole("heading", { name: /welcome, pat!/i });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("every Administrator nav destination renders its screen with no console errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderApp(ADMIN);
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: /welcome back, ada!/i });
    const nav = screen.getByRole("navigation", { name: /main/i });

    await user.click(within(nav).getByRole("button", { name: /^ticket queue$/i }));
    await screen.findByRole("heading", { name: /ticket queue/i });

    await user.click(within(nav).getByRole("button", { name: /user management/i }));
    await screen.findByRole("heading", { name: /user management/i });

    await user.click(within(nav).getByRole("button", { name: "Dashboard" }));
    await screen.findByRole("heading", { name: /welcome back, ada!/i });

    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("Mobile hamburger drawer (ui-spec.md §2 line 60)", () => {
  it("is closed by default and opens with aria-expanded set", async () => {
    renderApp(REQUESTER);
    await screen.findByRole("heading", { name: /welcome, pat!/i });

    const toggle = screen.getByRole("button", { name: /^menu$/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog", { name: /navigation/i })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const drawer = screen.getByRole("dialog", { name: /navigation/i });
    expect(within(drawer).getByRole("button", { name: /^my tickets$/i })).toBeInTheDocument();
  });

  it("moves focus into the drawer, traps Tab inside it, and closes on Escape back to the toggle", async () => {
    renderApp(REQUESTER);
    await screen.findByRole("heading", { name: /welcome, pat!/i });
    const user = userEvent.setup();

    const toggle = screen.getByRole("button", { name: /^menu$/i });
    await user.click(toggle);

    const drawer = screen.getByRole("dialog", { name: /navigation/i });
    expect(drawer.contains(document.activeElement)).toBe(true);

    // Shift+Tab from the first focusable item wraps to the last (focus trap).
    const focusable = within(drawer).getAllByRole("button");
    expect(document.activeElement).toBe(focusable[0]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /navigation/i })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(toggle);
  });

  it("closes the drawer after choosing a destination from it", async () => {
    renderApp(REQUESTER);
    await screen.findByRole("heading", { name: /welcome, pat!/i });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^menu$/i }));
    const drawer = screen.getByRole("dialog", { name: /navigation/i });
    await user.click(within(drawer).getByRole("button", { name: /^my tickets$/i }));

    await screen.findByRole("heading", { name: /my tickets/i });
    expect(screen.queryByRole("dialog", { name: /navigation/i })).not.toBeInTheDocument();
  });
});

describe("Route guards: Forbidden and Not Found pages", () => {
  it("Forbidden shows a 403 message and calls onGoToDashboard", async () => {
    const onGoToDashboard = vi.fn();
    render(<Forbidden onGoToDashboard={onGoToDashboard} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/don't have permission/i);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /go to dashboard/i }));
    expect(onGoToDashboard).toHaveBeenCalledTimes(1);
  });

  it("NotFound shows a 404 message and calls onGoToDashboard", async () => {
    const onGoToDashboard = vi.fn();
    render(<NotFound onGoToDashboard={onGoToDashboard} />);

    expect(screen.getByRole("heading", { name: /404/i })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /go to dashboard/i }));
    expect(onGoToDashboard).toHaveBeenCalledTimes(1);
  });
});
