---
title: "Version Control"
slug: version-control
category: concept
tags: [git, collaboration, workflow]
sources: [src_git002]
created: "2026-03-20T10:00:00.000Z"
updated: "2026-03-20T10:00:00.000Z"
summary: "System for tracking changes to files over time, enabling collaboration and history"
---

# Version Control

Version control (also called source control or revision control) is a system that records changes to files over time so you can recall specific versions later. It's the foundation of modern software development, enabling collaboration, experimentation, and auditability.

## Why Version Control

- **History**: every change is recorded with who made it, when, and why
- **Collaboration**: multiple people can work on the same codebase without overwriting each other
- **Branching**: experiment in isolation without affecting the main codebase
- **Recovery**: revert to any previous state if something breaks
- **Auditability**: trace any line of code back to the commit that introduced it

## Centralized vs Distributed

**Centralized** systems (SVN, Perforce) have a single server that holds the complete history. Clients check out working copies and must be online to commit.

**Distributed** systems ([[git]], Mercurial) give every developer a full copy of the repository. You can commit, branch, and merge entirely offline. This makes operations fast and eliminates the single point of failure.

## Branching Strategies

- **Trunk-based development**: everyone commits to main, short-lived feature branches (< 1 day)
- **Git Flow**: long-lived develop and main branches, feature branches, release branches
- **GitHub Flow**: simplified — main is always deployable, feature branches + pull requests

The trend is toward trunk-based development, which minimizes merge conflicts and aligns with [[continuous-integration]].

## See Also

- [[git]]
