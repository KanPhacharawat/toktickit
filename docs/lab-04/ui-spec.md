# Lab 4 UI Specification — TokTickIT (Zen Green)

> Location in repo: `docs/lab-04/ui-spec.md`
> Related: [`specification.md`](./specification.md) · [`api-spec.md`](./api-spec.md)

---

## 1. Design Language (Zen Green — preserved from Labs 2–3)

| Token                | Value (reuse Lab 2/3 tokens if names differ) | Usage                                                 |
| -------------------- | -------------------------------------------- | ----------------------------------------------------- |
| `--zg-primary`       | `#1F6B3A`                                    | Top bar, primary buttons, active nav underline, links |
| `--zg-primary-hover` | `#185630`                                    | Hover/pressed primary                                 |
| `--zg-surface`       | `#FFFFFF`                                    | Cards, tables                                         |
| `--zg-bg`            | `#F4F8F5`                                    | Page background                                       |
| `--zg-border`        | `#DDE7E0`                                    | Card and table borders                                |
| `--zg-text`          | `#1C2B22`                                    | Body text (contrast ≥ 4.5:1)                          |
| `--zg-muted`         | `#5B6B61`                                    | Secondary text                                        |
| `--zg-danger`        | `#B42318`                                    | Errors, destructive buttons                           |
| `--zg-warning`       | `#B54708`                                    | Follow-up, waiting                                    |
| `--zg-focus`         | `2px solid #0B5CAD` + 2px offset             | Keyboard focus ring                                   |

- Font: existing app font; base 16px; headings 24/20/18px.
- Radius 8px on cards/inputs; 12px on dashboard metric cards; shadow `0 1px 2px rgba(0,0,0,.06)`.
- Spacing scale 4 / 8 / 12 / 16 / 24 / 32.

### 1.1 Status badges (text + color, never color only)

| Status                | Label                 | Style                            |
| --------------------- | --------------------- | -------------------------------- |
| New                   | New                   | blue-50 bg, blue-800 text        |
| Open                  | Open                  | sky-50 / sky-800                 |
| InProgress           | In Progress           | green-50 / green-800             |
| WaitingForRequester | Waiting for Requester | amber-50 / amber-800             |
| Resolved              | Resolved              | emerald-100 / emerald-900        |
| Closed                | Closed                | gray-100 / gray-700              |
| Reopened              | Reopened              | purple-50 / purple-800           |
| Cancelled             | Cancelled             | gray-100 / gray-600, strike icon |

Priority badges: `Low`, `Medium`, `High` (▲ icon), `Urgent` (▲▲ icon) — matches Lab 3's `ItPriority` enum (`LOW, MEDIUM, HIGH, URGENT`). Action status badges: `Planned` (outline), `Completed` (✓ filled green), `Cancelled` (gray, ✕).

Private vs shared content: Internal Notes keep the Lab 3 lock icon + "Internal — not visible to Requester" label; Actions Taken and Public Comments show "Visible to Requester" helper text for staff.

## 2. Application Shell and Navigation

```
┌──────────────────────────────────────────────────────────────┐
│ ⏱ TokTickIT   [Dashboard] [Ticket Queue] [+ Create Ticket]  (👤 Profile ▾) │
└──────────────────────────────────────────────────────────────┘
```

| Role          | Nav items (order)                                            | Landing after login                |
| ------------- | ------------------------------------------------------------ | ---------------------------------- |
| Requester     | Dashboard · My Tickets · Create Ticket · Profile ▾           | `/dashboard` (Requester Dashboard) |
| IT Staff      | Dashboard · Ticket Queue · Create Ticket · Profile ▾         | `/dashboard` (IT Staff Dashboard)  |
| Administrator | Dashboard · Ticket Queue · Users · Create Ticket · Profile ▾ | `/dashboard` (Admin Dashboard)     |

- Active item: white 3px underline + `aria-current="page"`.
- Profile menu: name, role label, Logout. Menu is keyboard operable (Enter/Space opens, Esc closes, arrow keys move).
- Mobile (<768px): nav collapses into a hamburger button (`aria-expanded`, `aria-controls`) opening a full-width drawer; focus is trapped inside while open and returns to the button on close.
- Unknown route → Not Found page with "Go to Dashboard". Forbidden route → 403 page with "Go to Dashboard".

## 3. Screen: IT Staff Dashboard (`/dashboard`, role ITStaff/Administrator)

### 3.1 Layout (desktop ≥1024px)

```
Welcome back, {firstName}!                               [⟳ Refresh]
Here's what's happening with your queue today.   Updated 10:42

┌ New ┐ ┌ Open ┐ ┌ In Progress ┐ ┌ Waiting for Requester ┐ ┌ My Assigned ┐
│ 14  │ │ 23   │ │ 18          │ │ 7                     │ │ 16          │
│View │ │View  │ │View         │ │View                   │ │View         │
└─────┘ └──────┘ └─────────────┘ └───────────────────────┘ └─────────────┘

┌ Urgent Tickets (High/Urgent) ──── View all ┐ ┌ Quick Actions ─────────────┐
│ TT-20260905-0001  Server down   [Urgent] …   │ │ [+ Create] [🔍 Search] [My Queue] │
├ Recent Tickets ──────────────── View all ┤ ├ At a glance ────────────────┤
│ TT-… Laptop battery   [In Progress] May 12  │ │ Unassigned        5 →        │
│ …                                            │ │ My open follow-ups 2 →       │
└──────────────────────────────────────────────┘ │ By priority: U 2 · H 6 · M 9 · L 4 │
                                                   └──────────────────────────────┘
```

### 3.2 Components

| Component              | Content                                                                 | Action / drill-down                                                       |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Metric card ×5         | label, big number, "View all"                                           | whole card is a single `<a>` to the filtered queue (see spec BR-33…BR-38) |
| Urgent Tickets list    | ≤5 rows: ticket no., title, priority badge, status badge, relative time | row link → Ticket Detail                                                  |
| Recent Tickets list    | ≤5 rows by last update                                                  | row link → Ticket Detail; header "View all" → `/queue?sort=updatedAt`     |
| Quick Actions          | Create Ticket, Search Tickets (focuses queue search), My Queue          | links                                                                     |
| At a glance            | Unassigned, My open follow-ups, By priority chips                       | each is a link to filtered queue                                          |
| Admin only: Users card | Active Requesters / IT Staff / Admins, Inactive                         | → `/admin/users?role=…`                                                   |

### 3.3 States

| State               | Behavior                                                                               |
| ------------------- | -------------------------------------------------------------------------------------- |
| Loading             | Card skeletons (same size as cards) + list skeleton rows; `aria-busy="true"` on region |
| Empty (all zero)    | Cards show `0`; lists show "No tickets here yet." with icon; cards still clickable     |
| Error (5xx/network) | Inline banner "We couldn't load the dashboard. [Retry]"; previous numbers hidden       |
| Forbidden (403)     | Redirect to Forbidden page                                                             |
| Refresh             | Button shows spinner, disabled while loading; "Updated HH:mm" updates                  |

### 3.4 Responsive

- Tablet (768–1023): cards 3 per row, then 2; lists stack above Quick Actions.
- Mobile (<768): cards 2 per row (last one full width), lists full width, Quick Actions become a 3-button row. No horizontal scroll; long titles truncate with ellipsis + `title` attribute.

## 4. Screen: Requester Dashboard (`/dashboard`, role Requester)

```
Welcome, {firstName}!
Here's the latest on your requests.

┌ My Open Tickets ┐ ┌ Waiting for You ┐ ┌ In Progress ┐ ┌ Resolved ┐ ┌ Closed ┐
│ 3   View all    │ │ 1   View all    │ │ 2  View all │ │ 5        │ │ 12     │
└─────────────────┘ └─────────────────┘ └─────────────┘ └──────────┘ └────────┘

┌ Needs your attention ─────────────────┐ ┌ Quick Actions ─────────┐
│ TT-… Need new monitor [Waiting…]     │ │ + Create Ticket        │
├ My Recent Tickets ────────── View all ┤ │   Submit a new request │
│ TT-… Laptop battery [In Progress]    │ │ 🗂 View My Tickets      │
│ …                                     │ │   Track existing requests │
└───────────────────────────────────────┘ └────────────────────────┘
```

- Cards drill down to `/my-tickets?status=…` (spec BR-26…BR-30).
- "Needs your attention" = Waiting for Requester or Resolved tickets; helper text: "Reply to IT or confirm the fix."
- Empty state (no tickets at all): cards show 0; lists replaced by illustration + "You haven't submitted any tickets yet." + primary button "Create Ticket".
- Does not duplicate My Tickets: max 5 rows each, no filters/pagination.
- Same loading/error/responsive rules as §3.3–3.4.

## 5. Screen: Ticket Detail — Actions Taken section

Placed below the Ticket summary and above Public Comments / Internal Notes tabs (reuse Lab 3 tab component: `Public Comments | Internal Notes | Actions Taken | History`). On the Requester view, tabs are `Public Comments | Actions Taken | History`.

### 5.1 List mode (desktop table)

| Date/Time         | Description      | Result              | Performed by            | Follow-up                       | Attachments note        | Status      |                 |
| ----------------- | ---------------- | ------------------- | ----------------------- | ------------------------------- | ----------------------- | ----------- | --------------- |
| 12 May 2026 09:14 | Replaced battery | Works on battery 4h | Somchai (not owner tag) | ⚠ Yes — "Check again in 1 week" | "See photo battery.jpg" | ✓ Completed | [View] [Edit] ⋯ |

- Sort: `actionAt` ascending (oldest first) — stable, matches API.
- Header: "Actions Taken (n)" + primary button **[+ Add Action]** (staff only, hidden when Ticket Closed/Cancelled; replaced by text "Ticket is closed — actions are read-only").
- Row overflow menu (⋯): Complete (if Planned), Cancel (if not Cancelled).
- Cancelled rows: muted text, "Cancelled" badge, reason on hover/expand; no Edit.
- Mobile/tablet (<1024): each action is a card: date + status badge on top line, description, result, "Performed by", follow-up callout (amber), attachment note, action buttons at bottom (min 44×44px).
- Empty: "No actions recorded yet." + (staff) "Add the first action".

### 5.2 Create mode (inline panel / modal on mobile)

| Field               | Control                         | Default      | Validation (inline, under field)                                         |
| ------------------- | ------------------------------- | ------------ | ------------------------------------------------------------------------ |
| Action date/time\*  | `datetime-local`                | now          | required; not > now+5 min; not before ticket created                     |
| Description\*       | textarea, counter 0/2000        | –            | required, ≤2000                                                          |
| Status              | radio: Planned / Completed      | Completed    | –                                                                        |
| Result              | textarea, 0/2000                | –            | required if Completed                                                    |
| Performed by\*      | select of active IT Staff/Admin | current user | must be active staff                                                     |
| Follow-up required? | checkbox                        | off          | –                                                                        |
| Follow-up note      | textarea (shown when checked)   | –            | required when checked, ≤1000                                             |
| Attachment notes    | text input, 0/500               | –            | ≤500; helper "Which file/image to look at (upload files in Attachments)" |

- Buttons: **Save Action** (primary), Cancel (secondary). Save disabled + spinner while submitting; one `clientRequestId` generated when the form opens, reused on retry.
- On success: toast "Action added", panel closes, list refreshes, new row highlighted for 2s and receives focus.
- On 400: errors inline, first invalid field focused, data kept.
- On 5xx/network: banner in form "Couldn't save. Your text is kept. [Try again]".

### 5.3 View / Edit mode

- **View:** read-only drawer/modal showing all fields plus Created by / at, Last updated by / at, Completed at, Cancelled at + reason.
- **Edit:** same form as create, prefilled; status control hidden (use Complete/Cancel actions). Sends `version`.
- **409 STALE_UPDATE:** dialog "This action was changed by {name} at {time}." options **[Reload latest]** (discard) / **[Copy my changes]** (keeps form text in a read-only box to copy) — never silently overwrite.
- **Complete dialog:** Result textarea (required) + Confirm.
- **Cancel dialog:** Reason textarea (required) + "Cancel action" (danger). Uses accessible modal (focus trap, Esc closes, `role="dialog"`, `aria-labelledby`).

### 5.4 Requester view

- Same list, read-only, no Add/Edit/⋯ controls. "Performed by" shows display name. Heading helper: "Work done by IT on your request."

## 6. Ticket Workflow and Resolution Feedback

### 6.1 Status panel (Ticket Detail header, right side)

Staff/Admin view:

```
Status: [In Progress]   Owner: Michael   Priority: [High]
[Change status ▾]  (only permitted options from GET /transitions)
ⓘ Requester indicated the problem appears resolved · 12 May 10:02   (staff only, when set)
```

Requester view omits the `Priority` field (IT Priority is never shown to Requesters — Lab 3 BR-26) and shows only `Status: […] Owner: Michael`.

- The dropdown lists only transitions returned by the API for this user; if empty, the control is not rendered and text "No status changes available" appears for staff.
- Selecting a target opens a confirm dialog:
  - **→ Resolved:** Resolution summary (required) + checklist from the gate: ✓ Has owner · ✓ ≥1 completed action · ✓ No planned actions · ⚠ Follow-ups acknowledged (checkbox appears if needed). Confirm disabled until client checks pass; server remains authority.
  - **→ Cancelled:** Reason (required).
  - **→ Waiting for Requester / In Progress / Open / Closed / Reopened:** optional note.
- Success: toast "Status changed to X", status badge + owner + timestamps refresh, History tab gets a new row, transition list re-fetched.
- 422 `RESOLUTION_GATE_FAILED`: dialog stays open, list of failing conditions shown with links "Go to Actions Taken".
- 409: "Ticket was updated by someone else. [Reload]".

### 6.2 Requester controls

- **"Problem appears resolved"** button (secondary) when status ∈ In Progress / Waiting / Reopened → confirm → toast "Thanks — IT will review and resolve the ticket." Button then shows "Marked as resolved on {date}" (disabled).
- **Reopen** button when status is Resolved → dialog with reason (required).
- **Cancel ticket** only when status New.

### 6.3 History tab

Timeline, oldest→newest: `{time} · {actor} changed status {from} → {to}` + reason. No edit or delete controls.

## 7. Global Feedback Patterns (hardening)

| Situation            | UI                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Loading              | Skeletons for lists/cards; button spinners for submits                                   |
| Validation (400)     | Inline field error (red text + icon, `aria-describedby`), summary at top of long forms   |
| Success              | Toast (bottom-right desktop, top mobile), `role="status"`, auto-dismiss 4s               |
| Empty                | Icon + one sentence + optional primary action                                            |
| Forbidden (403)      | Inline message "You don't have permission to do this." or full Forbidden page for routes |
| Not found (404)      | "Ticket not found or you don't have access." + back link                                 |
| Conflict (409)       | Dialog with Reload; form data preserved                                                  |
| Server/network (5xx) | Banner "Something went wrong. Please try again." + Retry; no stack traces                |
| Duplicate submit     | Submit disabled while pending; idempotency key on create                                 |

## 8. Responsive Rules

| Breakpoint | Width      | Rules                                                                                 |
| ---------- | ---------- | ------------------------------------------------------------------------------------- |
| Mobile     | < 768px    | single column, hamburger nav, tables → cards, dialogs full-screen, 44px touch targets |
| Tablet     | 768–1023px | 2–3 column card grid, tables with priority columns only + expandable row              |
| Desktop    | ≥ 1024px   | full layout, max content width 1280px centered                                        |

Test widths: 375, 768, 1280. No horizontal page scroll, no clipped text, no overlapping controls.

## 9. Accessibility Checklist (to complete with evidence)

- [ ] All pages have one `<h1>` and logical heading order.
- [ ] Landmarks: `header`, `nav`, `main`, `footer`.
- [ ] Every input has a visible `<label>`; required fields marked with `*` and `aria-required`.
- [ ] Errors linked via `aria-describedby`; `aria-invalid="true"` on invalid fields.
- [ ] Visible focus ring on all interactive elements; logical tab order; no keyboard traps except modals.
- [ ] Modals: focus trap, Esc closes, focus returns to trigger.
- [ ] Status/priority conveyed by text + icon, not color alone.
- [ ] Contrast ≥ 4.5:1 text, ≥ 3:1 UI components.
- [ ] Metric cards: accessible name e.g. "New tickets: 14, view all".
- [ ] Toasts use `role="status"`; error banners `role="alert"`.
- [ ] Tested with keyboard only and axe (0 serious/critical violations).

## 10. Visual Consistency & Cleanup Checklist

- [ ] All buttons use shared Button component (primary/secondary/danger/ghost).
- [ ] All tables/cards/badges/tabs reuse Lab 2–3 components.
- [ ] Editable vs read-only fields visibly different (read-only: no border, gray label).
- [ ] Validation messages always directly under the field.
- [ ] No leftover debug text, lorem ipsum, duplicate buttons, dead links, or console errors.
- [ ] Dates formatted `DD MMM YYYY HH:mm` in local time everywhere.

## 11. Screenshots Required

`artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken}/` — each at desktop (1280), tablet (768), mobile (375), including loading/empty/error variants for dashboards and create/edit/409 for Actions Taken.
