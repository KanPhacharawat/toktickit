# TokTickIT Lab 3 UI Specification

## 1. Design System

Lab 3 does **not** change the design system. Colors, typography, cards, inputs, buttons, badges, banners, focus rings, and read-only styling are exactly those in `docs/lab-02/ui-spec.md` §1 and `client/src/theme.css`.

New elements are compositions of existing components:

| Element | Built from |
| --- | --- |
| Role badge | `zen-badge zen-status` with "Requester", "IT Staff", or "Administrator" |
| Ticket status badge | `zen-badge zen-status` with the display label (§1.1) |
| Requested Priority badge | `zen-badge zen-priority-*` (Lab 2) |
| IT Priority badge | `zen-badge zen-priority-*` labeled "IT: High", so it is never confused with Requested Priority |
| Owner badge | `zen-badge zen-status` "Owner: <name>" or "You"; `zen-badge zen-priority-low` "Unassigned" |
| Resolution indicator | `zen-badge zen-status` "Problem appears resolved" |
| Account status badge | `zen-badge zen-status` "Active"; `zen-badge zen-priority-low` "Inactive" |
| Public Comments section | `zen-card` headed by a `zen-testing-banner`-style strip: "Public — visible to the requester" |
| Internal Notes section | `zen-card` headed by a `zen-warning-banner` strip: "Internal — never visible to the requester" |
| Editable operation field | `zen-select` / `zen-input` + `zen-btn-primary` |
| Read-only value | `zen-readonly-value` |
| Success, failure, and conflict messages | `zen-success-banner`, `zen-error-banner`, `zen-warning-banner` |

Lab 2 component rules continue:

- Labels sit above controls. Required fields show a red asterisk plus visually hidden "(required)".
- Validation text sits directly below its field.
- Buttons show visible text. Busy buttons are disabled and relabeled. Disabled controls look distinct.
- Focus is always visible.
- State is never conveyed by color alone.

### 1.1 Status Display Labels

| API value | Label |
| --- | --- |
| `New` | New |
| `Open` | Open |
| `InProgress` | In Progress |
| `WaitingForRequester` | Waiting for Requester |
| `Resolved` | Resolved |
| `Closed` | Closed |
| `Reopened` | Reopened |
| `Cancelled` | Cancelled |

### 1.2 Safe Rendering

Comment, note, summary, description, name, and email values are rendered as React text nodes only. Line breaks in comments, notes, and descriptions are preserved with `white-space: pre-wrap`. No `dangerouslySetInnerHTML`, Markdown, or auto-linking is used.

## 2. Routes and Role Behavior

### 2.1 Routes

| Route | Screen | Roles | Modes |
| --- | --- | --- | --- |
| `/login` | Login | Unauthenticated | Create (session) |
| `/change-password` | Change Password | Any authenticated | Edit: **Mandatory** when `mustChangePassword`, otherwise **Voluntary** |
| `/my-tickets` | My Tickets | Requester | View |
| `/tickets/new` | Create Ticket | Requester | Create |
| `/tickets/:ticketId` | Ticket Detail | Requester (own) → Requester view; IT Staff and Administrator → Staff view | View, Edit (operations), Create (comments, notes) |
| `/queue` | Ticket Queue | IT Staff, Administrator | View |
| `/admin/users` | User Management | Administrator | View, Create, Edit |
| `/` | Redirect to role home | Any authenticated | — |
| other | Not Found | Any authenticated | — |

### 2.2 Navigation and Home

| Role | Navigation (in order) | Home |
| --- | --- | --- |
| Requester | My Tickets · Create Ticket | `/my-tickets` |
| IT Staff | Ticket Queue | `/queue` |
| Administrator | User Management · Ticket Queue | `/admin/users` |

Unpermitted destinations are never rendered, not even as disabled items.

### 2.3 Route Guards

| Situation | Behavior |
| --- | --- |
| App start | Session Check state until `GET /api/auth/me` answers. The obsolete key `toktickit.lab2.selectedRequesterId` is removed from `localStorage`. |
| No session on a protected route | Redirect to `/login?returnTo=<path>`. |
| `mustChangePassword` is true | Every route except `/change-password` redirects there. |
| Signed in, visiting `/login` | Redirect to the role home. |
| Route not permitted for role | Forbidden panel (§12.1) in place; the URL is kept. |
| Any API `401` | Clear user state and cached data, then go to `/login?returnTo=<path>&reason=expired`. |
| Any API `403 PASSWORD_CHANGE_REQUIRED` | Go to `/change-password`. |
| After logout: Back button or typed URL | The guard finds no session and shows Login. No prior screen data renders. |

`returnTo` is honored only for an internal path the signed-in role may open.

## 3. Application Shell

### 3.1 Structure

A `zen-shell-header` containing:

1. "TokTickIT" identity.
2. Role navigation (§2.2), with `aria-current="page"` on the active item.
3. Profile menu button, right-aligned: the user's name + role badge + caret.
   - Menu header (read-only): name, email, role badge.
   - "Change Password" → `/change-password` (voluntary).
   - "Log Out".

The shell replaces the Lab 2 "Testing as" chip and Change Requester button entirely.

- **Login** and **Session Check** show no shell.
- **Mandatory Change Password** shows a minimal header with the identity and Log Out only.

### 3.2 Controls and Feedback

| Control | Behavior |
| --- | --- |
| Navigation item | Routes to the destination. |
| Profile menu | Bootstrap dropdown: button with `aria-expanded`; menu items are keyboard-navigable; Escape closes. |
| Log Out | Busy label "Signing out…". On success, or even on API failure, the client clears state and routes to `/login` showing "You have signed out." |

**Session Check state:** a centered `zen-card` with spinner and "Checking your session…".

### 3.3 Responsive

| Viewport | Behavior |
| --- | --- |
| Desktop ≥992px | One row: identity, navigation, profile menu. |
| Tablet 768–991px | Row 1: identity + profile menu. Row 2: navigation. |
| Mobile <768px | Identity + "Menu" toggle (`aria-expanded`). The collapsible panel stacks navigation items, then the name, email, role badge, Change Password, and Log Out as full-width rows ≥44px tall. |

## 4. Login

### 4.1 Structure

A centered `zen-card` (max width 420px) containing:

- Title "TokTickIT" and subtitle "Sign in to your account".
- Info banner, driven by the URL:
  - `reason=expired`: "Your session has ended. Please sign in again."
  - After logout: "You have signed out."
- Error or warning banner area.
- Form: Email, Password (with show/hide), and Sign In.

There is no "Forgot password", registration, or Requester selector.

### 4.2 Controls

| Control | Details |
| --- | --- |
| Email | `type="email"`, `autocomplete="username"`, required |
| Password | `type="password"`, `autocomplete="current-password"`, required; no length rule at login |
| Show password | Button with `aria-pressed`, labeled "Show password" or "Hide password" |
| Sign In | Primary; "Signing in…" while busy |

### 4.3 Feedback

| Condition | Presentation |
| --- | --- |
| Initial | Empty form; focus on Email. |
| Client validation | Field messages: "Email is required.", "Enter a valid email address.", "Password is required." No API call is made. |
| Submitting | Sign In disabled and busy; repeat submits ignored. |
| Invalid credentials (`401`) | Error banner "Invalid email or password. Please try again." Password cleared, Email kept, focus moves to Password. |
| Inactive (`403 ACCOUNT_INACTIVE`) | Error banner "This account cannot sign in. Contact your administrator." |
| Throttled (`429`) | Warning banner "Too many sign-in attempts. Try again in 15 minutes." |
| Network or server failure | Error banner "Could not reach the server. Please try again." Values kept. |
| Success | `/change-password` if a change is required; otherwise `returnTo` or the role home. |

Banners use `role="alert"`.

### 4.4 Responsive

| Viewport | Behavior |
| --- | --- |
| Desktop and tablet | Card centered on the page background. |
| Mobile | Card width is the viewport minus 16px gutters, aligned to the top; Sign In is full-width. |

## 5. Change Password

### 5.1 Modes

| Mode | When | Differences |
| --- | --- | --- |
| **Mandatory** | `mustChangePassword` is true (first login, or after an Administrator sets a new initial password) | Minimal header with Log Out only. Warning banner "You must change your password before continuing." No Cancel button. Success → role home. |
| **Voluntary** | Opened from the profile menu | Full shell. Title "Change Password". "Cancel" button returns to the previous screen. Success → previous screen with the banner "Your password has been changed." |

### 5.2 Structure

A centered `zen-card` (max width 480px) containing:

- Title and mode banner.
- Form fields: Current Password, New Password, Confirm New Password.
- "Password must" checklist, updated live as New Password changes. Each item shows a check or cross icon plus visually hidden "met" or "not met" text:
  - Be 8–72 characters
  - Include upper and lower case letters
  - Include a number and a special character
  - Not be your email address
  - Be different from your current password (verified on save)
- Buttons: Save Password (primary, "Saving…" while busy), and Cancel in Voluntary mode.

### 5.3 Controls

| Control | Details |
| --- | --- |
| Current Password | password input; `autocomplete="current-password"`; required. In Mandatory mode the label reads "Current (temporary) password". |
| New Password | password input; `autocomplete="new-password"`; required |
| Confirm New Password | password input; required; must match |
| Show/hide | Toggle button on each field |

### 5.4 Feedback

| Condition | Presentation |
| --- | --- |
| Client validation | Messages below each field. Save does not call the API while any checklist item is unmet or confirmation mismatches. |
| Submitting | Save disabled and busy. |
| Wrong current password (`400 fieldErrors.currentPassword`) | "Current password is incorrect." below Current Password; other values kept. |
| Same as current (`400 fieldErrors.newPassword`) | Message below New Password. |
| Failure | Error banner; values kept for retry. |
| Success | Mode-specific routing (§5.1). Success text uses `role="status"`. |

### 5.5 Responsive

Same as Login (§4.4). In Voluntary mode, the card sits within the shell content area.

## 6. My Tickets (Requester)

The Lab 2 screen (`docs/lab-02/ui-spec.md` §6) is kept, with these changes:

- The list is scoped by session. The table caption reads "Your tickets".
- New **Assigned To** column showing the owner's name or "Unassigned". It is hidden on tablet and shown as a line on mobile cards.
- The "Problem appears resolved" badge appears beside the Status badge when set.
- The Current Status filter uses the eight statuses in §1.1.
- No Requester chip or Change Requester action.

Mode: **View**. Ticket Number opens `/tickets/:ticketId`. All Lab 2 controls, defaults, states, and responsive behavior are unchanged.

## 7. Create Ticket (Requester)

The Lab 2 screen (`docs/lab-02/ui-spec.md` §4–5) is kept, with these changes:

- The read-only **Requester** field shows the signed-in user's name.
- Success actions are "View Ticket" (→ `/tickets/:ticketId`), "Create another ticket", and "Done" (→ `/my-tickets`).

Modes: **Create**, then **Success view**. Fields, validation, busy state, value retention on failure, Attachments, and responsive rules are unchanged.

## 8. Ticket Detail — Requester View

### 8.1 Structure

1. **Header:** "Ticket <Ticket Number>", Status badge, resolution indicator (if set), and "Back to My Tickets".
2. **Resolution panel:**
   - **Action available** (status New, Open, In Progress, Waiting for Requester, or Reopened, and not yet reported): "Is the problem fixed on your side?" + outline button "Problem Appears Resolved".
   - **Already reported:** "You reported that the problem appears resolved on <date>. IT Staff will confirm and update the ticket."
   - **Otherwise** (Resolved, Closed, Cancelled): the panel is hidden.
3. **Ticket information card (read-only):**
   - Lab 2 fields: Ticket Number, Ticket Date, Requester, Category, Related System, Requested Priority, Current Status, Last Updated, Ticket Summary, Description.
   - **Assigned To**: owner name or "Unassigned".
4. **Attachments:** the Lab 2 component, unchanged (upload, download, soft removal with reason).
5. **Public Comments** (§10.1).

IT Priority, Internal Notes, and operation controls are never mounted in this view.

### 8.2 Modes

| Mode | Behavior |
| --- | --- |
| View | All Ticket fields read-only. |
| Create (comment) | Only the Public Comment composer is editable. |
| Confirm (resolution) | Dialog (§8.3). |

### 8.3 Problem Appears Resolved Dialog

- Modal with `role="dialog"`, `aria-modal="true"`, focus trap, and focus returned to the trigger on close.
- Title: "Report problem appears resolved".
- Text: "This lets IT Staff know the problem seems fixed. It does not resolve or close the ticket — IT Staff will do that."
- Optional "Add a note" textarea with an "N / 2000" counter.
- Buttons: "Cancel" and "Send Report" ("Sending…" while busy).

| Result | Presentation |
| --- | --- |
| Success | Dialog closes. Banner: "Thanks — IT Staff have been notified." The resolution panel and Public Comments refresh; the status badge is unchanged. |
| `409` | Warning banner in the dialog with the server message + "Reload ticket". |
| Validation or failure | Message in the dialog; the note is kept. |

### 8.4 Page Feedback

| Condition | Presentation |
| --- | --- |
| Loading | Spinner card "Loading ticket…". |
| Not found (`404`: missing or another Requester's Ticket) | "This ticket is not available." / "It does not exist or does not belong to your account." + "Back to My Tickets". |
| Failure | Error banner + Retry + Back. |
| Section failure | Attachments or Public Comments show their own error banner + Retry; the rest of the page stays usable. |

### 8.5 Responsive

| Viewport | Behavior |
| --- | --- |
| Desktop ≥992px | Max width 860px, centered. Information in two columns; Attachments and Public Comments full-width below. |
| Tablet 768–991px | Same layout at full container width. |
| Mobile <768px | Single column. Header actions wrap to full-width buttons. Dialog full-screen (`modal-fullscreen-sm-down`). |

## 9. Ticket Queue (IT Staff, Administrator)

### 9.1 Structure

1. **Header:** "Ticket Queue".
2. **Quick views:** button group (`role="group"`, `aria-label="Quick views"`), each with `aria-pressed` and a count:
   - Active (n)
   - Unassigned (n)
   - Assigned to Me (n)
   - All
3. **Search and filters card** (the Lab 2 collapsible pattern):
   - Search input + Search button.
   - Filters toggle showing the active-filter count.
   - Collapsible panel: Status, Ownership, IT Priority, Requested Priority, Category, Sort by, Order, Per page, Clear filters.
4. **Result summary:** "Showing X–Y of Z tickets" (`role="status"`).
5. **Results:** table on desktop and tablet, cards on mobile.
6. **Pagination:** the Lab 2 component (Previous · "Page N of M" · Next).

### 9.2 Documented Queue Decisions

| Decision | Value |
| --- | --- |
| Searchable fields | Ticket Number, Summary, Requester name, Requester email. Applied on Search or Enter, not per keystroke. |
| Filterable fields | Status (group Active or Closed/Cancelled, or one status) · Ownership (Any / Assigned to Me / Unassigned) · IT Priority · Requested Priority · Category |
| Sortable fields | Created Date, Last Updated, Ticket Number, IT Priority, Requested Priority |
| Default view | Quick view **Active** |
| Default order | Created Date ascending (oldest first), tie-breaker Ticket Number ascending |
| Priority sort | Descending = Urgent → Low |
| Page sizes | 10, 20, 50; default **20** |
| Page reset | Any search, filter, sort, size, or quick-view change returns to page 1 |
| Counts | Refreshed with every load; unaffected by search or filters |
| Invalid query | Filters reset to defaults with the warning "Some filters were not valid and have been reset." |

### 9.3 Controls

| Control | Options and behavior |
| --- | --- |
| Quick views | Active → `statusGroup=active`. Unassigned → `statusGroup=active&ownership=unassigned`. Assigned to Me → `statusGroup=active&ownership=mine`. All → clears status and ownership. A manual Status or Ownership change un-presses a quick view that no longer matches. |
| Search | `type="search"`, placeholder "Ticket number, summary, or requester" |
| Status | All statuses · Active (not Closed/Cancelled) · Closed or Cancelled · the eight individual statuses |
| Ownership | Any · Assigned to Me · Unassigned |
| IT Priority | Any · Low · Medium · High · Urgent |
| Requested Priority | Any · Low · Medium · High · Urgent |
| Category | All categories · active Categories |
| Sort by | Created Date · Last Updated · Ticket Number · IT Priority · Requested Priority |
| Order | Ascending · Descending |
| Per page | 10 · 20 · 50 |
| Clear filters | Restores §9.2 defaults; disabled when already at the defaults |
| Ticket Number | Link-button → `/tickets/:ticketId` (the open-detail action) |

### 9.4 Result Columns

The handout's example fields (Ticket Number, Created Date, Summary, Category, Requested Priority, IT Priority, Current Status, Ticket Owner, Last Updated), plus Requester, are all shown. To avoid a mega-grid, they are merged into **seven columns**. Primary identifiers stay on top, and secondary context sits beneath as small muted text.

| # | Column | Content | Tablet 768–991px | Mobile card |
| --- | --- | --- | --- | --- |
| 1 | Ticket | Ticket Number link; below: Created Date | Same | Title row |
| 2 | Summary | Summary (max 2 lines, full text in `title`); below: Requester name · Category | Same | Body + meta line |
| 3 | Req. Priority | Requested Priority badge | Merged into column 4, stacked | Badge row |
| 4 | IT Priority | IT Priority badge | Stacked with Req. Priority | Badge row |
| 5 | Status | Status badge; resolution indicator badge beneath when set | Same | Title row (status) + badge row (indicator) |
| 6 | Owner | Owner badge ("You", name, or "Unassigned") | Same | Badge row |
| 7 | Last Updated | Relative time; full timestamp in `title` | Hidden | Footer line |

Column justification:

- **Priorities** are side by side so triage differences are visible at a glance.
- **Owner and Status** drive claiming and follow-up.
- **Requester and Category** are context, not decision drivers, so they are secondary text.
- **Description** is excluded; it belongs in detail.

### 9.5 Feedback

| Condition | Presentation |
| --- | --- |
| Loading | Skeleton: header + 5 placeholder rows (desktop/tablet) or 3 placeholder cards (mobile). `aria-busy="true"`, visually hidden "Loading tickets…", counts show "–". |
| Empty | **All** view, no search or filters, zero Tickets: "There are no tickets in the system yet." |
| No results | Any other zero-result view: "No tickets match this view." + Clear filters. The Unassigned view reads "No unassigned active tickets." |
| Forbidden (`403`) | Forbidden panel (§12.1). |
| Invalid query (`400`) | Warning banner, then reload with defaults. |
| Failure | Error banner "Could not load the queue." + Retry; controls stay usable. |

### 9.6 Responsive

| Viewport | Behavior |
| --- | --- |
| Desktop ≥992px | Seven-column table in a `zen-card`. Filter panel in four columns. Quick views in one row. |
| Tablet 768–991px | Table with priorities stacked in one column and Last Updated hidden; no horizontal page scroll. Filter panel in two columns. |
| Mobile <768px | Cards: title row (Ticket Number link ≥44px + Status badge), Summary, meta line (Created · Requester · Category), badge row (Req. Priority, IT Priority, Owner, indicator), footer (Last Updated). Quick views scroll horizontally in their own container. Filters stacked. Pagination buttons full-width. |

## 10. Thread Components

### 10.1 Public Comments

**Structure**

- `zen-card` with heading "Public Comments (n)" and a strip reading "Public — visible to the requester".
- Ordered list (`<ol>`), oldest first. Each entry shows:
  - Author name, with "(you)" for the current user
  - Role badge
  - `<time>` timestamp
  - Plain-text body (§1.2)
- The automatic "Problem appears resolved." entry also carries the resolution indicator badge.
- Composer:
  - Label "Add a public comment" (required).
  - Textarea with an "N / 2000" counter.
  - Primary button "Post Public Comment" ("Posting…" while busy).

**Modes:** View (thread) and Create (composer). No entry has edit or delete controls.

**Feedback**

| Condition | Presentation |
| --- | --- |
| Loading | Spinner "Loading comments…" |
| Empty | "No public comments yet." |
| Validation | "Comment is required." or "Comment must be 2000 characters or fewer." below the textarea; no API call |
| Posting | Button busy; textarea read-only |
| Success | Entry appended; textarea cleared and refocused; visually hidden "Comment posted." |
| Closed or Cancelled Ticket | Composer replaced by "This ticket is closed. New public comments are not accepted." |
| `409` | Warning with the server message + "Reload ticket"; text kept |
| Failure | Error banner below the composer; text kept |

### 10.2 Internal Notes (Staff View Only)

**Structure**

- `zen-card` with a 5px amber left border (existing `--zen-warning` token), heading "Internal Notes (n)", and a `zen-warning-banner` strip reading "Internal — never visible to the requester".
- Entries use the same layout as comments, each with an "Internal" badge.
- Composer:
  - Label "Add an internal note".
  - Counter.
  - Button "Post Internal Note" (a deliberately different label).

**Modes and feedback:** as §10.1, with these differences:

- Messages say "Note".
- The composer is available on every status, including Closed and Cancelled.
- Posting does not change "Last Updated" on the page.

**Separation rules**

- The two composers are never adjacent without their section heading and visibility strip between them.
- Each composer keeps its own draft.
- The component is not mounted for Requesters at all; hiding it with CSS is not acceptable.

## 11. Ticket Detail — Staff View (IT Staff, Administrator)

### 11.1 Structure

1. **Header:**
   - Breadcrumb "Ticket Queue › Ticket Detail".
   - Title "Ticket <Ticket Number>".
   - Badges: Status, Requested Priority, IT Priority, Owner, and the resolution indicator (when set).
   - "Back to Queue", which restores the previous view, filters, and page.
2. **Ticket Operations card** (editable; §11.3).
3. **Ticket information card** (read-only): Ticket Number, Ticket Date, Requester (name + email), Category, Related System, Requested Priority, Current Status, Last Updated, Summary, Description.
   - When the resolution signal is set, a pale success strip reads: "Requester reported the problem appears resolved on <date>."
4. **Attachments** (read-only list): active items have Download; removed items show the removed badge, time, and reason. No Upload or Remove controls.
5. **Public Comments** (§10.1).
6. **Internal Notes** (§10.2).

### 11.2 Modes

| Mode | Where | Behavior |
| --- | --- | --- |
| View | Information, Attachments, threads | `zen-readonly-value` fields |
| Edit | Operations card | Each operation saves independently; there is no page-wide Save |
| Create | Thread composers | §10 |
| Read-only operations | IT Staff viewing another owner's Ticket, or any Closed or Cancelled Ticket | Values shown read-only with an explanation |

Controls are driven by the server's `permissions` and `allowedStatusTransitions`. The server still enforces every rule.

### 11.3 Operations Card

**Ticket Owner**

| Situation | Controls |
| --- | --- |
| Unassigned | Read-only "Unassigned". Primary button "Claim Ticket" ("Claiming…"). Separately: "Assign to" select (active IT Staff and Administrators, each shown as "Name (Role)") + "Assign" button, disabled until a value is chosen. |
| Owned; caller is owner or Administrator | Read-only owner. "Reassign to" select (excluding the current owner) + "Reassign" button. |
| Owned; caller is other IT Staff | Read-only owner + "Only the ticket owner or an administrator can reassign this ticket." |

**IT Priority**

| Situation | Controls |
| --- | --- |
| Caller may change | "IT Priority" select (Low, Medium, High, Urgent) + "Save IT Priority", disabled until the value differs. Helper: "Requested by requester: <Requested Priority>. IT Priority started as a copy." |
| Caller may not | Read-only badge + "Claim this ticket to change IT Priority." (unassigned) or "Only the ticket owner or an administrator can change IT Priority." |

**Status**

| Situation | Controls |
| --- | --- |
| Caller may change; transitions available | Read-only current status + "Change status to" select listing **only** `allowedStatusTransitions` + "Update Status" |
| Owner-required targets unavailable (unassigned) | Those options omitted; helper "Assign an owner before moving this ticket forward." |
| Closed or Cancelled | "This ticket is <Closed/Cancelled>. No further changes are possible." |
| Caller may not | Read-only status + explanation |

**Confirmation dialogs** (required before the request is sent):

| Target | Dialog text | Confirm button |
| --- | --- | --- |
| Resolved | "Mark ticket <number> as Resolved? The requester will see this status." | "Mark Resolved" |
| Closed | "Close ticket <number>? Closed tickets cannot be changed again." | "Close Ticket" |
| Reopened | "Reopen ticket <number>? The resolution will be treated as not holding." | "Reopen Ticket" |
| Cancelled | "Cancel ticket <number>? Cancelled tickets cannot be changed again." | "Cancel Ticket" |

Every dialog also has a "Keep Current Status" button. Other transitions save directly.

### 11.4 Operation Feedback

Feedback appears inline beneath the relevant operation.

| Condition | Presentation |
| --- | --- |
| Saving | That operation's button busy; other operations remain usable |
| Success | `role="status"` text such as "IT Priority updated to High." Header badges, `permissions`, transitions, and `expectedUpdatedAt` refresh from the response. |
| Validation (`400`) | Error below the control, e.g. "Select an active IT Staff member or administrator." |
| Forbidden (`403`) | "You no longer have permission to do this." + silent reload |
| Claimed first (`409 TICKET_ALREADY_CLAIMED`) | Warning "Another staff member claimed this ticket first." + silent reload |
| Stale (`409 STALE_TICKET`) | Warning banner at the top of the Operations card: "This ticket changed since you opened it." + "Reload ticket" |
| Rule conflict (`409 INVALID_STATUS_TRANSITION`, `OWNER_REQUIRED`, `TICKET_CLOSED`) | Warning with the server message + silent reload |
| Failure | Error text with a safe message; the selection is kept for retry |

### 11.5 Page Feedback

| Condition | Presentation |
| --- | --- |
| Loading | Spinner card "Loading ticket…" |
| Not found (`404`) | "This ticket does not exist." + Back to Queue |
| Forbidden (`403`) | Forbidden panel |
| Failure | Error banner + Retry + Back to Queue |
| Section failure | Attachments, Public Comments, and Internal Notes each have their own Retry |

### 11.6 Responsive

| Viewport | Behavior |
| --- | --- |
| Desktop ≥992px | Max width 1140px, two columns. Left (8/12): Information, Attachments, Public Comments. Right (4/12, sticky): Operations, then Internal Notes. Public and internal composers therefore sit in different columns. |
| Tablet 768–991px | Single column: Operations, Information, Attachments, Public Comments, Internal Notes. Each select + button pair sits on one row. |
| Mobile <768px | Single column. Operations first, with selects and buttons full-width. Below it, a `role="tablist"` with Details · Public Comments · Internal Notes, so both composers are never on screen together. Badges wrap. Dialogs are full-screen. |

## 12. Shared Panels

### 12.1 Forbidden

A `zen-card` with a `zen-error-banner`:

- "You do not have access to this page."
- "Your role (<Role>) cannot use this screen."
- Primary button "Go to <home screen name>".

The shell stays visible.

### 12.2 Not Found

A `zen-card` with "Page not found." and the same home button.

### 12.3 Feedback Placement

There is no global toast. Every message appears inline next to the control or section it concerns.

## 13. User Management (Administrator)

### 13.1 Structure

1. **Header:** "User Management" + primary "Create User".
2. **Search bar** (single row):
   - Search input "Name or email" + Search button.
   - Role select (All roles · Requester · IT Staff · Administrator), applied on change.
   - Clear.
3. **Result summary:** "N users" (`role="status"`).
4. **User list:** table (desktop and tablet) or cards (mobile).
5. **User panel:** a right-side panel on desktop, holding the Create or Edit form.

There is no pagination, column sorting, bulk selection, delete, or import/export.

### 13.2 List Columns

| Column | Content |
| --- | --- |
| Name | Text, "(you)" for the signed-in Administrator |
| Email | Text; wraps |
| Role | Role badge |
| Status | Active or Inactive badge; "Must change password" small text beneath when applicable |
| Actions | "Edit" outline button with visually hidden "<name>" |

Order: name ascending, then id. The row being edited is highlighted with `aria-current="true"`.

### 13.3 Modes

| Mode | Trigger | Panel |
| --- | --- | --- |
| View | Default | Panel closed; list uses the full width |
| Create | "Create User" | "Create New User" form |
| Edit | "Edit" on a row | "Edit User" form (Account details + Set New Initial Password) |

### 13.4 Create Form

| Field | Control | Required | Client rules |
| --- | --- | --- | --- |
| Full Name | Text | Yes | 2–100 characters trimmed |
| Email Address | `type="email"` | Yes | Valid format, ≤254 characters |
| Role | Select: Requester, IT Staff, Administrator; placeholder "Select a role…" | Yes | Exactly one |
| Active | Switch (checkbox, `role="switch"`), default on | — | — |
| Initial Password | Password + show/hide + §5.2 checklist (without the "different from current" item) | Yes | Password rules |
| Confirm Initial Password | Password | Yes | Matches |

Helper: "The user must change this password at first sign-in. Share it with them directly; no email is sent."

Buttons: "Save User" (primary, "Saving…" while busy) and "Cancel".

### 13.5 Edit Form

**Section A — Account details**

| Field | Notes |
| --- | --- |
| Full Name, Email Address | Same rules as Create |
| Role | Changing away from IT Staff or Administrator shows: "Their active tickets will become unassigned." |
| Active | Switching off shows: "Deactivating signs the user out immediately and unassigns their active tickets. The account is kept, not deleted." When editing yourself, the switch is disabled with "You cannot deactivate your own account." |

Buttons: "Save Changes" (disabled until something changes) and "Cancel".

**Section B — Set New Initial Password** (separate form, below a divider)

- Text: "Sets a temporary password. The user is signed out and must change it at next sign-in."
- New Initial Password + Confirm, with the rules checklist.
- Outline button "Set New Initial Password", which opens an inline confirmation: "Sign <name> out and require a password change?" (Confirm / Cancel).
- When editing yourself, extra warning text: "You will be signed out now."

### 13.6 Feedback

| Condition | Presentation |
| --- | --- |
| List loading | Spinner card "Loading users…" |
| No results | "No users match your search." + Clear |
| List failure | Error banner + Retry |
| Form validation | Messages below each field; focus moves to the first invalid field; no API call |
| Duplicate email (`409 EMAIL_ALREADY_IN_USE`) | "This email is already used by another account." below Email; values kept |
| Invalid role (`400`) | "Select a role." below Role |
| Self-deactivation (`409 SELF_DEACTIVATION_BLOCKED`) | Panel error banner "You cannot deactivate your own account." |
| Last active Administrator (`409 LAST_ACTIVE_ADMINISTRATOR`) | Panel error banner "At least one active administrator is required. Make another user an active administrator first." |
| Not found (`404`) | Panel banner "This user no longer exists." + list reload |
| Save success | Panel closes. Success banner above the list, e.g. "Saved changes to <name>." with " 2 active tickets were unassigned." when reported. The list reloads, keeping search and filter. |
| Initial password success | Section B clears; "New initial password set. <name> has been signed out." (Self → routed to Login.) |
| Own role changed away from Administrator | Success, then session reload. The user lands on their new home; User Management becomes Forbidden. |
| Forbidden (`403`) | Forbidden panel |
| Failure | Panel error banner with safe message; values kept |
| Unsaved changes | Closing asks "Discard unsaved changes?" (Discard / Keep Editing) |

### 13.7 Responsive

| Viewport | Behavior |
| --- | --- |
| Desktop ≥992px | Panel closed: full-width table. Panel open: list 7/12 + sticky panel 5/12, with Email wrapping under Name in the list. |
| Tablet 768–991px | Table with Email under Name. The panel is an offcanvas sliding from the right at 75% width over the list. |
| Mobile <768px | Cards: Name, Email, badges (Role, Status), full-width Edit. Search, Role, and Clear are stacked. The panel is full-screen with sticky footer buttons. |

## 14. Responsive Rules

| Viewport | Required behavior |
| --- | --- |
| Desktop ≥992px | Multi-column layouts per screen, centered with a sensible max width |
| Tablet 768–991px | Two columns where practical; tables compacted, not page-scrolled |
| Mobile <768px | Stacked; tables become cards; dialogs and panels full-screen; touch targets ≥44px |
| All | No horizontal page scroll, clipping, overlap, or hidden actions; long names, emails, and summaries wrap; badges wrap |

Test viewports (as in Lab 2): 1280px, 820px, 390px.

## 15. Accessibility

Lab 2 rules (`docs/lab-02/ui-spec.md` §10) apply, plus:

- Each page sets a unique document title, e.g. "Ticket Queue — TokTickIT". Focus moves to the page `<h1>` after navigation.
- Dialogs, the offcanvas, and the full-screen panel trap focus, close on Escape (except while busy), and return focus to their trigger.
- Toggles expose `aria-pressed`; menus, collapsible panels, and the filter toggle expose `aria-expanded`; the Active control uses `role="switch"`.
- `role="status"` for success messages and result counts; `role="alert"` for errors.
- Public Comments and Internal Notes are `<section>` elements labeled by their headings. The visibility strip text is part of each section's accessible description.
- Password checklist items announce "met" or "not met" as text.
- Status, priorities, ownership, account status, and role are always readable text; color only reinforces them.

## 16. Visual Evidence

Screenshots are captured at desktop, tablet, and mobile under `artifacts/lab-03/screenshots/`:

| Folder | Required states |
| --- | --- |
| `authentication/` | Login default, validation, invalid credentials, inactive account, throttled; mandatory Change Password with rule validation; voluntary Change Password; shell with profile menu per role; signed out; Forbidden (Requester opening `/queue`) |
| `requester-tickets/` | My Tickets (no selector); Requester Ticket Detail with Public Comments; Problem Appears Resolved dialog and reported state |
| `staff-queue/` | Active view with counts, filters expanded, sorted by IT Priority, no-results, empty, failure, loading |
| `staff-ticket-detail/` | Unassigned (Claim/Assign); owned operations; status confirmation dialog; Public Comment posted; Internal Note posted; non-owner read-only; stale conflict |
| `user-management/` | List, search + role filter, create panel, duplicate email, edit panel, new initial password set, self-deactivation blocked, last-admin blocked, Forbidden for IT Staff |

**Visual checklist** (completed per folder):

- Design consistency with Lab 2.
- Role navigation shows no unusable destinations.
- Badges are consistent for status, Requested Priority, IT Priority, and role.
- Editable vs read-only fields are distinguishable.
- Validation sits beside its field.
- Focus is visible.
- No clipping, overlap, or horizontal overflow.
