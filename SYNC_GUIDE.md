# Repository Sync Guide

## Repository Structure

```
Origin (Your Fork)
├── main (tracks upstream/main)
└── my-changes (your work branch)

Upstream (Original Repo)
└── main (source of truth)
```

## Remote Configuration

- **origin**: Your fork (https://github.com/laith-abood/mcp-claude.git)
- **upstream**: Original repository (https://github.com/modelcontextprotocol/servers.git)

## Branch Configuration

### Main Branch
- Tracks: upstream/main
- Purpose: Syncing with original repository
- Configuration:
  ```bash
  branch.main.remote=upstream
  branch.main.merge=refs/heads/main
  ```

### My-changes Branch
- Tracks: origin/my-changes
- Purpose: Your development work
- Configuration:
  ```bash
  branch.my-changes.remote=origin
  branch.my-changes.merge=refs/heads/my-changes
  ```

## Common Commands

### Initial Setup (Already Completed)
```bash
# Fork repository on GitHub
git clone https://github.com/laith-abood/mcp-claude.git
git remote add upstream https://github.com/modelcontextprotocol/servers.git
git checkout -b my-changes
git push -u origin my-changes
```

### Keeping in Sync with Upstream

Your fork does NOT automatically sync with the original repository. You need to manually check for and pull updates:

1. Check for new updates from upstream:
```bash
git fetch upstream
git log HEAD..upstream/main --oneline  # Shows what updates are available
```

2. If there are updates, sync your main branch:
```bash
git checkout main
git pull  # Pulls from upstream/main automatically
git push origin main  # Updates your fork's main branch
```

3. Update your changes branch (if needed):
```bash
git checkout my-changes
git rebase main  # Incorporates upstream changes into your branch
git push --force-with-lease  # Only needed if you rebased
```

It's recommended to check for updates regularly (e.g., daily or weekly) to stay current with the original repository.

### Automatic Update Notifications

To get notifications about upstream changes:
1. Go to the original repository on GitHub (https://github.com/modelcontextprotocol/servers)
2. Click "Watch" at the top
3. Select "Custom" -> "Releases" and "Pull requests"

This way, GitHub will notify you when there are significant changes in the original repository.

### Working on Changes

1. Make sure you're on your changes branch:
```bash
git checkout my-changes
```

2. Make your changes and commit:
```bash
git add .
git commit -m "Description of your changes"
git push  # Pushes to origin/my-changes automatically
```

### Checking Status

1. View branch tracking:
```bash
git branch -vv
```

2. View remotes:
```bash
git remote -v
```

3. View current configuration:
```bash
git config --list | grep -E "branch\.|pull\."
```

## Current Configuration

- Pull is configured to use rebase by default: `pull.rebase=true`
- Main branch tracks upstream/main
- My-changes branch tracks origin/my-changes
- All branch tracking and remote configurations are set up

## Best Practices

1. Always make changes in the my-changes branch
2. Keep main branch clean and only use it for syncing with upstream
3. Regularly sync with upstream to stay up to date
4. Use rebase when incorporating upstream changes to maintain a clean history
5. Never push to upstream repository - all changes should stay in your fork
6. Only push to origin (your fork) using:
   ```bash
   git push origin my-changes  # For your changes
   git push origin main       # For syncing main
   ```

## Preventing Accidental Pushes to Upstream

To prevent accidentally pushing to the upstream repository, add this to your git configuration:
```bash
git remote set-url --push upstream no_push  # Disables pushing to upstream
```

This configuration ensures that:
1. You can pull from upstream to stay in sync
2. You cannot accidentally push your changes to the upstream repository
3. All your changes stay exclusively in your fork

## Troubleshooting

If branch tracking gets misaligned:
```bash
# For main branch
git branch --set-upstream-to=upstream/main main

# For my-changes branch
git branch --set-upstream-to=origin/my-changes my-changes
```

If you need to reset to upstream:
```bash
git checkout main
git fetch upstream
git reset --hard upstream/main
git push origin main --force
