---
title: "Continuous Deployment"
slug: continuous-deployment
category: topic
tags: [ci-cd, devops, automation]
sources: [src_cicd003]
created: "2026-03-20T10:00:00.000Z"
updated: "2026-03-20T10:00:00.000Z"
summary: "Practice of automatically releasing every change that passes CI to production"
---

# Continuous Deployment

Continuous Deployment extends [[continuous-integration]] by automatically deploying every commit that passes the test suite to production. There are no manual gates — if the build is green, the code ships.

## How It Works

```
commit → build → unit tests → integration tests → staging deploy → smoke tests → production deploy
```

Each stage is a gate. If any step fails, the pipeline stops and the team is notified. If everything passes, the change is live in production within minutes of being pushed.

## Prerequisites

Continuous deployment requires:

- **Comprehensive test suite**: you're trusting automated tests to catch everything. Coverage and test quality must be high.
- **Feature flags**: decouple deployment from release. Ship code behind a flag, enable it gradually.
- **Monitoring and alerting**: detect problems in production quickly. Automated rollback when error rates spike.
- **Infrastructure as code**: reproducible environments so deploys are predictable.

## Continuous Delivery vs Continuous Deployment

| | Continuous Delivery | Continuous Deployment |
|---|---|---|
| Auto-deploy to staging | Yes | Yes |
| Auto-deploy to production | No (manual gate) | Yes |
| Requires manual approval | Yes | No |

Continuous Delivery means the code is *always deployable*. Continuous Deployment means it *is always deployed*. The [[twelve-factor-app]] methodology's emphasis on dev/prod parity and disposability supports both approaches.

## See Also

- [[continuous-integration]]
- [[twelve-factor-app]]
