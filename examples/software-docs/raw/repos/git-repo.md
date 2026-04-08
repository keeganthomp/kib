---
title: "Git — distributed version control"
source_type: github
url: "https://github.com/git/git"
ingested: "2026-02-15"
word_count: 5200
---

# Git

Git is a free and open source distributed version control system designed to handle everything from small to very large projects with speed and efficiency. Created by Linus Torvalds in 2005 for Linux kernel development.

## Architecture

Git is a content-addressable filesystem. At its core, it stores snapshots (not diffs) of the project at each commit. Every object (blob, tree, commit, tag) is identified by its SHA-1 hash.

### Object Types

- **Blob**: stores file contents (no filename or metadata)
- **Tree**: maps filenames to blobs and other trees (represents a directory)
- **Commit**: points to a tree (project snapshot) plus metadata (author, message, parent commits)
- **Tag**: named pointer to a commit, optionally signed

### References

Branches and tags are simply pointers (refs) to commits. `HEAD` points to the current branch. The reflog records where refs have pointed over time, enabling recovery of "lost" commits.

## Key Commands

### Everyday Workflow

```bash
git init                    # create new repository
git clone <url>             # copy remote repository
git add <files>             # stage changes
git commit -m "message"     # record staged snapshot
git push origin main        # upload to remote
git pull origin main        # download and merge
```

### Branching

```bash
git branch feature          # create branch
git checkout feature        # switch to branch
git merge feature           # merge branch into current
git rebase main             # replay commits onto main
```

### History

```bash
git log --oneline           # compact commit history
git diff                    # unstaged changes
git blame <file>            # line-by-line authorship
git bisect                  # binary search for bug-introducing commit
```

## Distributed Model

Every clone is a full copy of the repository with complete history. Work happens locally — commit, branch, merge all without network access. Collaboration happens through push/pull to shared remotes (GitHub, GitLab, etc.).

## Why Git Won

1. **Speed**: local operations are nearly instant
2. **Branching**: lightweight branches make parallel development easy
3. **Integrity**: content-addressed storage means corruption is detectable
4. **Distributed**: no single point of failure, offline work is natural
