---
description: Git workflow for safe development with branches
---

# Git Development Workflow

## Principle
Never work directly on `main`. Always use feature branches.

## Starting a new feature

```bash
# Make sure you're on main and updated
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/nombre-del-feature
```

## During development

```bash
# Save progress frequently
git add -A
git commit -m "Descripción del cambio"
```

## When feature is complete and tested

```bash
# Merge to main
git checkout main
git merge feature/nombre-del-feature --no-edit
git push origin main

# Delete the feature branch
git branch -d feature/nombre-del-feature
```

## If something breaks

```bash
# Just delete the branch, main is safe
git checkout main
git branch -D feature/nombre-del-feature
```

## Vercel auto-deploys
- Push to `main` → Production deploy
- Push to any other branch → Preview deploy (optional URL)
