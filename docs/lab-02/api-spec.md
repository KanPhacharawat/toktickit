# TokTickIT Lab 2 API Specification

## 1. General Rules

Base path:

`/api`

Content type:

`application/json` unless the operation involves file upload/download.

All requester-specific operations use the selected Development Requester ID as the Lab 2 testing identity.

This is not authentication.

## 2. Response Error Shape

All API errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data.",
    "fieldErrors": {
      "summary": "Summary is required."
    }
  }
}
```

`fieldErrors` is optional.

Unexpected errors use a generic message and never expose stack traces or internal implementation information.

## 3. GET `/api/categories`

Returns active Categories.

### Success

`200 OK`

```json
{
  "data": [
    {
      "id": 1,
      "name": "Account and Access"
    }
  ]
}
```

Only active Categories are returned.

## 4. GET `/api/related-systems`

Returns active Related Systems.

### Success

`200 OK`

```json
{
  "data": [
    {
      "id": 1,
      "name": "Campus Wi-Fi"
    }
  ]
}
```

Only active Related Systems are returned.

## 5. GET `/api/development-requesters`

Returns active Development Requesters.

### Success

`200 OK`

```json
{
  "data": [
    {
      "id": 1,
      "name": "Requester A",
      "email": "requester-a@example.com"
    }
  ]
}
```

Inactive Requesters are excluded.

## 6. POST `/api/tickets`

Creates one Ticket.

### Request

```json
{
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 4,
  "summary": "Laptop battery drains quickly",
  "requestedPriority": "MEDIUM",
  "description": "The laptop battery reaches zero within approximately one hour."
}
```

### Success

`201 Created`

```json
{
  "data": {
    "id": 101,
    "ticketNumber": "TT-20260905-0001",
    "ticketDate": "2026-09-05T12:30:00Z",
    "requester": {
      "id": 1,
      "name": "Requester A"
    },
    "category": {
      "id": 2,
      "name": "Hardware"
    },
    "relatedSystem": {
      "id": 4,
      "name": "Corporate Laptop"
    },
    "summary": "Laptop battery drains quickly",
    "requestedPriority": "MEDIUM",
    "currentStatus": "New",
    "description": "The laptop battery reaches zero within approximately one hour.",
    "createdAt": "2026-09-05T12:30:00Z",
    "updatedAt": "2026-09-05T12:30:00Z"
  }
}
```

### Validation

`400 Bad Request`

Used for:

- missing required fields;
- invalid lengths;
- invalid enum values;
- nonexistent reference values;
- inactive requester/category/system.

### Conflict

`409 Conflict`

Used when a request would create an unintended duplicate according to the server's duplicate-protection mechanism.

### Unexpected Error

`500 Internal Server Error`

Safe generic message only.

## 7. GET `/api/requesters/:requesterId/tickets`

Returns Tickets owned by the selected Requester.

### Query Parameters

| Parameter           | Meaning                                      |
| ------------------- | -------------------------------------------- |
| `search`            | Search Ticket Number or Summary              |
| `categoryId`        | Filter by Category                           |
| `requestedPriority` | Filter by Requested Priority                 |
| `currentStatus`     | Filter by Current Status                     |
| `sortBy`            | `ticketDate`, `ticketNumber`, or `updatedAt` |
| `sortOrder`         | `asc` or `desc`                              |
| `page`              | 1-based page number                          |
| `pageSize`          | 10, 20, or 50                                |

Default:

- `sortBy=updatedAt`
- `sortOrder=desc`
- secondary sort = `ticketNumber desc`
- `page=1`
- `pageSize=10`

### Success

`200 OK`

```json
{
  "data": [
    {
      "id": 101,
      "ticketNumber": "TT-20260905-0001",
      "summary": "Laptop battery drains quickly",
      "category": "Hardware",
      "requestedPriority": "MEDIUM",
      "currentStatus": "New",
      "updatedAt": "2026-09-05T12:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

### Invalid query

`400 Bad Request`

Used for invalid sort fields, invalid sort order, invalid page number, or unsupported page size.

## 8. GET `/api/requesters/:requesterId/tickets/:ticketId`

Returns one Ticket Detail.

### Success

`200 OK`

Returns the complete read-only Ticket representation plus Attachment metadata.

### Missing Ticket

`404 Not Found`

Used when the Ticket does not exist.

### Ownership Failure

`403 Forbidden`

Used when the Ticket exists but does not belong to the selected Development Requester.

The response must not reveal unnecessary information about the other Requester.

## 9. POST `/api/requesters/:requesterId/tickets/:ticketId/attachments`

Uploads one Attachment.

Content type:

`multipart/form-data`

Field:

`file`

### Success

`201 Created`

```json
{
  "data": {
    "id": 501,
    "originalFilename": "screenshot.png",
    "mimeType": "image/png",
    "fileSize": 182034,
    "uploadedAt": "2026-09-05T12:40:00Z",
    "removedAt": null,
    "removalReason": null
  }
}
```

### Errors

- `400 Bad Request` — malformed upload request.
- `403 Forbidden` — Ticket is not owned by requester.
- `404 Not Found` — Ticket does not exist.
- `413 Payload Too Large` — file exceeds 5 MB.
- `415 Unsupported Media Type` — file type is not permitted.
- `409 Conflict` — Ticket already has five active Attachments.
- `500 Internal Server Error` — unexpected failure.

## 10. GET `/api/requesters/:requesterId/tickets/:ticketId/attachments`

Returns Attachment metadata for an owned Ticket.

### Success

`200 OK`

Removed Attachments may remain in the metadata response with their removal state.

## 11. GET `/api/requesters/:requesterId/tickets/:ticketId/attachments/:attachmentId`

Downloads an active Attachment.

### Success

`200 OK`

Returns the file with its stored MIME type.

### Errors

- `403 Forbidden` — not owned.
- `404 Not Found` — Attachment/Ticket not found.
- `410 Gone` — Attachment was soft-removed.
- `500 Internal Server Error` — unexpected failure.

Removed Attachments never return file content.

## 12. DELETE `/api/requesters/:requesterId/tickets/:ticketId/attachments/:attachmentId`

Soft-removes an Attachment.

### Request

```json
{
  "removalReason": "Duplicate screenshot"
}
```

### Success

`200 OK`

```json
{
  "data": {
    "id": 501,
    "removedAt": "2026-09-05T12:50:00Z",
    "removalReason": "Duplicate screenshot"
  }
}
```

### Validation

`400 Bad Request`

Returned when `removalReason` is empty.

### Ownership

`403 Forbidden`

Returned when the Ticket does not belong to the selected Requester.

### Missing

`404 Not Found`

Returned when the Ticket or Attachment does not exist.

## 13. HTTP Status Summary

| Status | Usage                                        |
| ------ | -------------------------------------------- |
| `200`  | Successful retrieval/update                  |
| `201`  | Resource successfully created                |
| `400`  | Invalid input/query/body                     |
| `403`  | Ownership failure                            |
| `404`  | Missing resource                             |
| `409`  | Conflict/duplicate/attachment-limit conflict |
| `410`  | Removed Attachment requested for download    |
| `413`  | Attachment too large                         |
| `415`  | Unsupported file type                        |
| `500`  | Unexpected server error                      |

The Lab requires the API contract to explicitly define successful responses, validation failures, ownership failures, missing resources, unexpected errors, and appropriate HTTP statuses.
