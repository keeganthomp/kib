---
title: "Twelve-Factor App"
slug: twelve-factor-app
category: topic
tags: [architecture, cloud, best-practices]
sources: [src_12f004]
created: "2026-03-20T10:00:00.000Z"
updated: "2026-03-20T10:00:00.000Z"
summary: "Methodology for building modern, portable, cloud-native applications"
---

# Twelve-Factor App

The Twelve-Factor App is a methodology for building software-as-a-service applications that are portable across execution environments, suitable for deployment on cloud platforms, and scalable without significant changes to tooling or architecture.

## The Factors (Summary)

| # | Factor | Key Idea |
|---|--------|----------|
| I | Codebase | One repo per app, many deploys |
| II | Dependencies | Explicitly declare and isolate |
| III | Config | Store in environment variables |
| IV | Backing Services | Treat as attached resources via URL |
| V | Build, Release, Run | Strict separation of stages |
| VI | Processes | Stateless, share-nothing |
| VII | Port Binding | Self-contained, export via port |
| VIII | Concurrency | Scale out via process model |
| IX | Disposability | Fast startup, graceful shutdown |
| X | Dev/Prod Parity | Keep environments identical |
| XI | Logs | Treat as event streams to stdout |
| XII | Admin Processes | Run as one-off processes |

## Why It Matters

The methodology codifies patterns that experienced teams arrive at independently. It's particularly relevant for:

- **Cloud-native deployment** (Heroku, AWS, GCP, Kubernetes) — these platforms assume twelve-factor behavior
- **[[continuous-integration]]** / CD pipelines — the build/release/run separation maps directly to CI/CD stages
- **Microservices** — stateless processes, port binding, and backing services are prerequisites

## Modern Relevance

Written in 2011, the twelve factors remain relevant. Containerization (Docker) and orchestration (Kubernetes) have made factors like disposability, port binding, and process-based concurrency even more natural. The main update needed is acknowledging service meshes and distributed tracing, which extend factor IV (backing services) to service-to-service communication.

## See Also

- [[continuous-integration]]
