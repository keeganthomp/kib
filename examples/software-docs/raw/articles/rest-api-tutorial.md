---
title: "REST API Tutorial"
source_type: web
url: "https://restfulapi.net/rest-api-design-tutorial-with-example/"
ingested: "2026-02-10"
word_count: 6800
---

# REST API Tutorial

REST (Representational State Transfer) is an architectural style for designing networked applications. It relies on a stateless, client-server, cacheable communications protocol — in practice, almost always HTTP.

## REST Principles

### Statelessness

Each request from client to server must contain all the information needed to understand and process the request. The server does not store session state between requests. This simplifies the server, improves scalability, and makes requests independently cacheable.

### Resource-Based

REST models everything as resources identified by URIs. A resource can be a user, a document, an image — anything that can be named. Each resource has one or more representations (JSON, XML, HTML).

### Uniform Interface

The constraint that distinguishes REST from other architectures. Four sub-constraints:
1. **Resource identification**: resources are identified by URIs
2. **Resource manipulation through representations**: clients hold enough information to modify or delete the resource
3. **Self-descriptive messages**: each message includes enough information to describe how to process it
4. **Hypermedia as the engine of application state (HATEOAS)**: clients discover actions through hypermedia links

## HTTP Methods

| Method | Action | Idempotent | Safe |
|--------|--------|------------|------|
| GET | Retrieve a resource | Yes | Yes |
| POST | Create a resource | No | No |
| PUT | Replace a resource entirely | Yes | No |
| PATCH | Partially update a resource | No | No |
| DELETE | Remove a resource | Yes | No |

## API Design Best Practices

### URL Design

Use nouns, not verbs: `/users/123` not `/getUser?id=123`. Use plural nouns: `/users` not `/user`. Nest related resources: `/users/123/posts`.

### Status Codes

Use standard HTTP status codes: 200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 404 Not Found, 500 Internal Server Error.

### Versioning

Version your API to avoid breaking clients. Common approaches: URL path (`/v1/users`), header (`Accept: application/vnd.api.v1+json`), or query parameter (`?version=1`).

### Pagination

For collections, support pagination with `limit` and `offset` (or cursor-based). Include total count and next/previous links in the response.

### Error Handling

Return structured error responses with a machine-readable error code, human-readable message, and optional details. Always use appropriate HTTP status codes.
