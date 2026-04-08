---
title: "REST API"
slug: rest-api
category: concept
tags: [api, web, http]
sources: [src_rest001]
created: "2026-03-20T10:00:00.000Z"
updated: "2026-03-20T10:00:00.000Z"
summary: "Architectural style for designing networked applications using stateless HTTP operations on resources"
---

# REST API

REST (Representational State Transfer) is an architectural style for building web APIs. It uses standard [[http-methods]] to perform stateless operations on resources identified by URIs. REST has become the dominant style for public-facing web APIs due to its simplicity and alignment with HTTP.

## Core Constraints

1. **Client-Server**: separation of concerns between UI and data storage
2. **Stateless**: each request contains all context needed to process it — no server-side sessions
3. **Cacheable**: responses must declare themselves cacheable or non-cacheable
4. **Uniform Interface**: resources are identified by URIs, manipulated through representations, with self-descriptive messages
5. **Layered System**: intermediaries (load balancers, caches, gateways) can be inserted transparently

## Resource Design

Everything in REST is a resource with a unique URI:

```
GET    /users           → list all users
GET    /users/123       → get user 123
POST   /users           → create a new user
PUT    /users/123       → replace user 123
DELETE /users/123       → delete user 123
```

Use nouns (not verbs) in URLs. Nest related resources: `/users/123/posts` for posts belonging to user 123.

## When to Use REST

REST works well for CRUD-oriented APIs with clear resource boundaries. For real-time data, consider WebSockets. For complex queries with nested data, consider GraphQL. For internal service-to-service communication, consider gRPC.

See [[api-design-patterns]] for common patterns used when building REST APIs.

## See Also

- [[http-methods]]
- [[api-design-patterns]]
