---
title: "HTTP Methods"
slug: http-methods
category: concept
tags: [api, http]
sources: [src_rest001]
created: "2026-03-20T10:00:00.000Z"
updated: "2026-03-20T10:00:00.000Z"
summary: "Standard HTTP verbs (GET, POST, PUT, DELETE) and their semantics in RESTful APIs"
---

# HTTP Methods

HTTP methods (also called verbs) define the action to perform on a resource in a [[rest-api]]. Each method has specific semantic guarantees around safety and idempotency.

## Methods

### GET

Retrieve a resource. **Safe** (no side effects) and **idempotent** (repeated calls return the same result). Should never modify data. Responses are cacheable.

### POST

Create a new resource or trigger a process. **Not safe**, **not idempotent** — calling POST twice may create two resources. Returns 201 Created with a `Location` header pointing to the new resource.

### PUT

Replace a resource entirely. **Idempotent** — putting the same data twice has the same effect as putting it once. The client sends the complete resource representation.

### PATCH

Partially update a resource. **Not idempotent** in the general case (though specific implementations may be). The client sends only the fields to change.

### DELETE

Remove a resource. **Idempotent** — deleting an already-deleted resource returns 404 (or 204), not an error. The resource should no longer be retrievable after deletion.

## Safety and Idempotency

| Method | Safe | Idempotent |
|--------|------|------------|
| GET | Yes | Yes |
| POST | No | No |
| PUT | No | Yes |
| PATCH | No | No |
| DELETE | No | Yes |

**Safe** means the method doesn't modify server state. **Idempotent** means calling it N times has the same effect as calling it once. These guarantees let clients, caches, and proxies make smart decisions about retries and caching.

## See Also

- [[rest-api]]
