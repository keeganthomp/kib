---
title: "The Twelve-Factor App"
source_type: web
url: "https://12factor.net/"
author: "Adam Wiggins"
ingested: "2026-03-01"
word_count: 7000
---

# The Twelve-Factor App

The twelve-factor app is a methodology for building software-as-a-service apps. These best practices enable applications to be built with portability and resilience when deployed to the web.

## The Twelve Factors

### I. Codebase
One codebase tracked in version control, many deploys. A one-to-one correlation between the codebase and the app. Multiple apps sharing code is a violation — factor shared code into libraries.

### II. Dependencies
Explicitly declare and isolate dependencies. Never rely on system-wide packages. Use a dependency declaration manifest (package.json, Gemfile, requirements.txt) and a dependency isolation tool (node_modules, bundler, virtualenv).

### III. Config
Store config in the environment. Config varies between deploys (staging, production), code does not. Use environment variables, not config files checked into the repo. A litmus test: could the codebase be made open source without compromising credentials?

### IV. Backing Services
Treat backing services as attached resources. A database, message queue, or SMTP service should be accessible via a URL in config. The app should make no distinction between local and third-party services.

### V. Build, Release, Run
Strictly separate build and run stages. Build converts code into an executable bundle. Release combines the build with config. Run launches the app. Every release should have a unique ID (timestamp or incrementing number).

### VI. Processes
Execute the app as one or more stateless processes. Any data that needs to persist must be stored in a stateful backing service (database, object store). Session data goes in a session store (Redis, Memcached), not the filesystem.

### VII. Port Binding
Export services via port binding. The app is completely self-contained and doesn't rely on injection of a webserver. It exports HTTP as a service by binding to a port and listening for requests.

### VIII. Concurrency
Scale out via the process model. Rather than running one giant process, run multiple small processes of different types (web, worker, clock). The OS process manager handles restarts and distribution.

### IX. Disposability
Maximize robustness with fast startup and graceful shutdown. Processes should start in seconds and shut down gracefully on SIGTERM. This enables rapid elastic scaling and fast deploys.

### X. Dev/Prod Parity
Keep development, staging, and production as similar as possible. The gap between dev and prod causes bugs that are hard to reproduce. Use the same backing services, the same OS, the same versions.

### XI. Logs
Treat logs as event streams. The app should not concern itself with routing or storage of its output stream. Write to stdout, and let the execution environment collect and route logs.

### XII. Admin Processes
Run admin/management tasks as one-off processes. Database migrations, console sessions, and one-time scripts should run in the same environment as the app's regular processes, using the same codebase and config.
