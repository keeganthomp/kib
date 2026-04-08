---
title: "Continuous Integration"
source_type: web
url: "https://martinfowler.com/articles/continuousIntegration.html"
author: "Martin Fowler"
date: "2006-05-01"
ingested: "2026-02-20"
word_count: 9500
---

# Continuous Integration

Continuous Integration (CI) is a software development practice where team members integrate their work frequently — each person integrates at least daily, leading to multiple integrations per day. Each integration is verified by an automated build (including tests) to detect integration errors as quickly as possible.

## The Problem

Without CI, developers work in isolation on their branches for days or weeks. When they finally merge, the integration is painful — merge conflicts, broken tests, incompatible changes. This "integration hell" gets exponentially worse with team size and branch lifetime.

## Practices

### Maintain a Single Source Repository

Use version control (Git) for everything: source code, tests, scripts, configuration. Everyone commits to the mainline (or merges short-lived feature branches frequently).

### Automate the Build

A single command should build the entire system from source. Use build tools (Make, Gradle, Webpack, etc.) and avoid manual steps. If a new developer can't build the system in one step on a clean machine, the build is broken.

### Make Your Build Self-Testing

Include automated tests in the build. Unit tests, integration tests, and a subset of end-to-end tests should all run on every build. A build that compiles but fails tests is a broken build.

### Everyone Commits to the Mainline Every Day

The key practice. Short-lived branches (< 1 day) prevent drift. The longer a branch lives, the harder the merge. Trunk-based development takes this to the extreme: everyone commits directly to main.

### Every Commit Should Build the Mainline on an Integration Machine

Don't trust "works on my machine." CI servers (Jenkins, GitHub Actions, CircleCI) build and test every commit in a clean environment. If the build breaks, fixing it is the team's top priority.

### Keep the Build Fast

A 10-minute build is a good target. If the build is slow, developers won't integrate frequently. Stage the build: fast unit tests first, slower integration tests second.

## Continuous Delivery vs Continuous Deployment

- **Continuous Delivery**: every commit is potentially releasable. Deployment requires a manual approval step.
- **Continuous Deployment**: every commit that passes CI is automatically deployed to production. No manual gates.

Both extend CI by automating the release pipeline: build → test → stage → deploy.

## Benefits

1. **Reduced risk**: small, frequent integrations are easier to debug than big-bang merges
2. **Faster feedback**: broken code is caught in minutes, not days
3. **Always deployable**: the mainline should always be in a releasable state
4. **Team confidence**: comprehensive test suites let you refactor and add features fearlessly
