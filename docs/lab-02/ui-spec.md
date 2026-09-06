# TokTickIT Lab 2 UI Specification

## 1. Design System

### Colors

| Token      | Value                        | Usage                                    |
| ---------- | ---------------------------- | ---------------------------------------- |
| Primary    | `#006B3C`                    | Header, primary actions, strong emphasis |
| Secondary  | `#0B7A46`                    | Active tabs, links, focus accents, hover |
| Pale       | `#EAF6EF`                    | Selected/success/subtle section emphasis |
| Background | `#F5F7F6`                    | Page background                          |
| Surface    | `#FFFFFF`                    | Cards and main content                   |
| Text       | Dark charcoal-green          | Primary text                             |
| Editable   | White + neutral border       | Input controls                           |
| Read-only  | Soft gray-green / warm ivory | System-generated values                  |
| Error      | Dark red                     | Error text and border                    |
| Warning    | Amber                        | Warnings                                 |
| Success    | Green                        | Successful operations                    |

These colors follow the required Zen Green system in the Lab handout.

## 2. Application Shell

The shell contains:

- TokTickIT identity.
- My Tickets navigation.
- Create Ticket navigation.
- Current Development Requester display.
- Change Requester action.
- Active navigation indication.
- Responsive mobile navigation.

The selected requester identity is a testing identity and must not be described as real authentication.

## 3. Requester Selection

### Elements

- TokTickIT title.
- Testing-only explanation.
- Development Requester dropdown.
- Continue button.
- Loading state.
- Empty state.
- API failure state.

### Behavior

**Loading:** show a visible loading indicator while active Requesters are fetched.

**Success:** display only active Requesters and enable Continue after selection.

**Empty:** explain that no active Requesters are available and prevent continuation.

**Failure:** show a safe error message and a Retry action.

**Keyboard:** dropdown and Continue must be keyboard accessible with visible focus.

After selection, the shell displays the Requester and provides Change Requester.

## 4. Create Ticket

### Layout

Desktop:

- System-generated fields near the top.
- Classification fields grouped together.
- Summary and Description receive the main content width.
- Attachments below primary Ticket information.
- Primary action at the bottom.

Tablet:

- Two-column arrangement where practical.

Mobile:

- Fields stacked vertically.
- Buttons remain touch-friendly.
- No horizontal page scrolling.

### Fields

| Field              | Editable |           Required |
| ------------------ | -------: | -----------------: |
| Ticket Number      |       No | No before creation |
| Ticket Date        |       No | No before creation |
| Requester          |       No |                Yes |
| Category           |      Yes |                Yes |
| Related System     |      Yes |                Yes |
| Ticket Summary     |      Yes |                Yes |
| Requested Priority |      Yes |                Yes |
| Description        |      Yes |                Yes |
| Attachments        |      Yes |                 No |

### Component rules

- Labels appear above controls.
- Required fields have a red asterisk.
- Validation text appears beside the associated field.
- Inputs have consistent heights.
- Description is taller than normal inputs.
- Buttons have visible text.
- Icon-only buttons require accessible labels/tooltips.
- Disabled controls have a distinct appearance.
- Keyboard focus remains visible.
- Submit becomes busy and disabled while processing.
- Success clearly displays the official Ticket Number.

These component behaviors follow the handout's required UI rules.

## 5. Create Ticket States

### Initial

All editable fields are empty except the selected Requester and loaded reference data.

### Validation Error

- Invalid controls receive error styling.
- Error text appears immediately below the relevant field.
- Submit does not call the API when client validation fails.

### Submitting

- Submit button is disabled.
- Busy indicator/text is shown.
- Form controls cannot cause duplicate submission.

### Success

- Show official Ticket Number.
- Show confirmation message.
- Provide navigation to My Tickets.
- Keep the successful Ticket identifiable.

### API Failure

- Show safe failure message.
- Preserve entered form values.
- Allow retry.

## 6. My Tickets

### Required controls

- Search input.
- Category filter.
- Requested Priority filter.
- Current Status filter.
- Sort control.
- Clear filters action.
- Pagination.
- Create Ticket action.

### Ticket representation

Desktop uses a clear table/list representation containing at least:

- Ticket Number.
- Summary.
- Category.
- Requested Priority.
- Current Status.
- Last Updated.

Mobile may use cards or another responsive representation.

### States

**Loading:** visible loading indicator.

**Empty:** Requester has no Tickets; show Create Ticket action.

**No Results:** filters/search returned zero matches; provide clear/reset action.

**Failure:** show safe error with Retry.

## 7. Ticket Detail

Ticket information is read-only.

Display:

- Ticket Number.
- Ticket Date.
- Requester.
- Category.
- Related System.
- Summary.
- Requested Priority.
- Current Status.
- Description.
- Attachments.

Do not implement Public Comments, Internal Notes, Actions Taken, or later status-workflow features.

## 8. Attachment UI

### Active Attachment

Display:

- Original filename.
- File type.
- File size.
- Upload date.
- Preview where supported.
- Download action.
- Remove action.

### Removed Attachment

Display:

- Original filename.
- Removed status.
- Removal timestamp where available.
- Removal reason where permitted.

Do not show active Download or Preview actions for removed Attachments.

### Upload validation

- Unsupported file type → field/component error.
- File >5 MB → size error.
- More than five active Attachments → limit error.

### Removal

Removing an Attachment opens a confirmation UI.

The user must provide a non-empty removal reason before the operation is completed.

## 9. Responsive Rules

| Viewport         | Required Behavior                                             |
| ---------------- | ------------------------------------------------------------- |
| Desktop >= 992px | Multi-column layout, centered with sensible max width         |
| Tablet 768–991px | Two-column layout where practical                             |
| Mobile < 768px   | Vertical stacking, touch-friendly controls                    |
| All sizes        | No clipping, overlap, hidden buttons, or unreadable filenames |

These viewport requirements are explicitly defined in the handout.

## 10. Accessibility

- All inputs have visible labels.
- Required fields have both asterisks and textual validation.
- Keyboard focus is visible.
- Icon-only controls have accessible labels.
- Disabled controls cannot be activated.
- Error states are communicated with text, not color alone.
- Success states are communicated with text, not color alone.

## 11. Visual Evidence

Required screenshots:

- `artifacts/lab-02/screenshots/create-ticket/`
- `artifacts/lab-02/screenshots/my-tickets/`
- `artifacts/lab-02/screenshots/ticket-detail/`

Capture desktop, tablet, and mobile views as required by the Lab. The handout also requires visual inspection for clipping, overlap, horizontal scrolling, styling consistency, badges, filters, pagination, Attachments, and empty states.
