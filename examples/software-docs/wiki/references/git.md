---
title: "Git"
slug: git
category: reference
tags: [git, tools]
sources: [src_git002]
created: "2026-03-20T10:00:00.000Z"
updated: "2026-03-20T10:00:00.000Z"
summary: "Distributed version control system created by Linus Torvalds for Linux kernel development"
---

# Git

Git is a distributed [[version-control]] system created by Linus Torvalds in 2005 for managing the Linux kernel source code. It is now the de facto standard for version control in software development.

## Key Concepts

### Content-Addressable Storage

Git stores everything as objects identified by their SHA-1 hash. This means identical content always has the same hash — deduplication is automatic and corruption is detectable.

### Snapshots, Not Diffs

Each commit records a complete snapshot of the project (as a tree of blobs). Git computes diffs on the fly when needed, rather than storing them. This makes operations like switching branches and comparing arbitrary commits fast.

### Branches Are Cheap

A branch is just a pointer (40-byte file) to a commit. Creating, switching, and deleting branches is nearly instant. This encourages experimental branches and supports workflows like [[continuous-integration]].

## Common Workflows

```bash
# Start a feature
git checkout -b feat/new-widget
# ... make changes ...
git add -p                  # stage selectively
git commit -m "feat: add widget component"
git push -u origin feat/new-widget
# Open PR, get review, merge
```

## Ecosystem

Git's dominance comes partly from its hosting ecosystem. GitHub, GitLab, and Bitbucket provide pull requests, code review, CI/CD integration, issue tracking, and collaboration features on top of Git's core.

## See Also

- [[version-control]]
- [[continuous-integration]]
