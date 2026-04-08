---
title: "Continuous Integration"
slug: continuous-integration
category: topic
tags: [ci-cd, devops, automation]
sources: [src_cicd003]
created: "2026-03-20T10:00:00.000Z"
updated: "2026-03-20T10:00:00.000Z"
summary: "Practice of frequently merging code changes into a shared repository with automated build and test verification"
---

# Continuous Integration

Continuous Integration (CI) is the practice of merging all developers' working copies into a shared mainline frequently — ideally multiple times per day. Each merge triggers an automated build and test suite that verifies the integration didn't break anything.

## Core Practices

1. **Maintain a single source repository** — use [[version-control]] ([[git]]) for everything
2. **Automate the build** — one command, from clean checkout to running artifact
3. **Make the build self-testing** — automated tests run on every build
4. **Everyone commits daily** — short-lived branches prevent integration drift
5. **Fix broken builds immediately** — a broken build is the team's top priority
6. **Keep the build fast** — 10 minutes is a good target

## Why CI Matters

Without CI, developers work in isolation for days or weeks. The eventual merge produces "integration hell" — merge conflicts, incompatible changes, subtle bugs. CI replaces one painful big-bang integration with many small, easy ones.

## CI Services

Popular CI platforms: GitHub Actions, GitLab CI, CircleCI, Jenkins, Buildkite. All follow the same pattern: watch for commits, run a pipeline (build → test → report), notify on failure.

## CI vs CD

- **CI**: automatically build and test on every commit
- **[[continuous-deployment]]**: automatically deploy to production when CI passes
- **Continuous Delivery**: like CD but with a manual approval gate before production

The [[twelve-factor-app]] methodology recommends strict separation of build and run stages, which aligns naturally with CI/CD pipelines.

## See Also

- [[version-control]]
- [[continuous-deployment]]
- [[twelve-factor-app]]
