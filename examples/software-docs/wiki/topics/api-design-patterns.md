---
title: "API Design Patterns"
slug: api-design-patterns
category: topic
tags: [api, patterns, design]
sources: [src_rest001]
created: "2026-03-20T10:00:00.000Z"
updated: "2026-03-20T10:00:00.000Z"
summary: "Common patterns for building well-structured, consistent, and developer-friendly APIs"
---

# API Design Patterns

These patterns appear repeatedly in well-designed [[rest-api]] services. They address common challenges around pagination, filtering, error handling, and versioning.

## Pagination

For endpoints returning collections, support pagination to avoid returning thousands of records:

- **Offset-based**: `GET /users?offset=20&limit=10` — simple but slow for large offsets
- **Cursor-based**: `GET /users?after=abc123&limit=10` — efficient for large datasets, using an opaque cursor

Always include pagination metadata in the response: total count (if feasible), next/previous links.

## Filtering and Sorting

Allow clients to narrow results without custom endpoints:

```
GET /users?role=admin&created_after=2026-01-01&sort=-created_at
```

Prefix sort fields with `-` for descending order. Use query parameters for simple filters, reserved keywords for operators (`_gt`, `_lt`, `_contains`).

## Error Responses

Return consistent, structured errors with [[http-methods]] status codes:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [
      { "field": "email", "reason": "must not be empty" }
    ]
  }
}
```

Use 4xx for client errors, 5xx for server errors. Never return 200 with an error body.

## Versioning

Strategies for evolving an API without breaking existing clients:

- **URL path**: `/v1/users` — most common, easiest to understand
- **Header**: `Accept: application/vnd.myapp.v2+json` — cleaner URLs, harder to test
- **Query param**: `/users?version=2` — easy to use, not RESTful

## Rate Limiting

Protect your API with rate limits. Return `429 Too Many Requests` when exceeded. Include `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining` headers so clients can adapt.

## See Also

- [[rest-api]]
- [[http-methods]]
