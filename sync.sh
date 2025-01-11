#!/bin/bash

# Sync script for safely updating with upstream while preserving local changes

# Exit on any error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting sync process...${NC}"

# Function to handle package-lock.json conflicts
handle_package_lock_conflict() {
    echo -e "${YELLOW}Handling package-lock.json conflict...${NC}"
    # Remove package-lock.json
    rm -f package-lock.json
    # Remove node_modules to ensure clean state
    rm -rf node_modules
    # Reinstall dependencies
    npm install
    # Add the new package-lock.json
    git add package-lock.json
    return 0
}

# Function to handle merge conflicts
handle_merge_conflict() {
    if [[ $(git diff --name-only --diff-filter=U) == *"package-lock.json"* ]]; then
        handle_package_lock_conflict
        return 0
    else
        echo -e "${RED}Merge conflicts detected in files other than package-lock.json${NC}"
        echo -e "${YELLOW}Please resolve conflicts manually${NC}"
        return 1
    fi
}

# 1. Verify current state
echo -e "\n${YELLOW}Verifying current state...${NC}"
if [[ -n $(git status -s) ]]; then
    echo -e "${RED}Working directory is not clean. Please commit or stash changes first.${NC}"
    exit 1
fi

# 2. Create backup of current state
echo -e "\n${YELLOW}Creating backup of current state...${NC}"
BACKUP_BRANCH="backup-$(date +%Y%m%d-%H%M%S)"
git branch $BACKUP_BRANCH
echo -e "${GREEN}Backup created in branch: $BACKUP_BRANCH${NC}"

# 3. Fetch latest changes from upstream
echo -e "\n${YELLOW}Fetching latest changes from upstream...${NC}"
git fetch upstream

# 4. Show what updates are available
echo -e "\n${YELLOW}Available updates from upstream:${NC}"
git log HEAD..upstream/main --oneline

# 5. Update main branch with upstream changes
echo -e "\n${YELLOW}Updating main branch with upstream changes...${NC}"
git checkout main
git pull upstream main
git push origin main

# 6. Create a new sync branch
echo -e "\n${YELLOW}Creating new sync branch...${NC}"
SYNC_BRANCH="sync-$(date +%Y%m%d-%H%M%S)"
git checkout -b $SYNC_BRANCH

# 7. Try to merge changes from my-changes
echo -e "\n${YELLOW}Attempting to merge your changes...${NC}"
if git merge my-changes; then
    echo -e "${GREEN}Merge successful!${NC}"
else
    if ! handle_merge_conflict; then
        echo -e "${YELLOW}Your changes are safe in:${NC}"
        echo "1. Backup branch: $BACKUP_BRANCH"
        echo "2. Original my-changes branch"
        echo -e "\n${YELLOW}Options:${NC}"
        echo "1. Resolve conflicts manually and continue"
        echo "2. Abort merge: git merge --abort"
        echo "3. Start fresh: git checkout my-changes"
        exit 1
    fi
fi

# 8. Run build and tests if they exist
if [ -f "package.json" ]; then
    echo -e "\n${YELLOW}Installing dependencies...${NC}"
    npm install

    if grep -q "\"build\"" package.json; then
        echo -e "\n${YELLOW}Running build...${NC}"
        if ! npm run build; then
            echo -e "${RED}Build failed. Keeping changes in $SYNC_BRANCH for review.${NC}"
            exit 1
        fi
    fi

    if grep -q "\"test\"" package.json; then
        echo -e "\n${YELLOW}Running tests...${NC}"
        if ! npm test; then
            echo -e "${RED}Tests failed. Keeping changes in $SYNC_BRANCH for review.${NC}"
            exit 1
        fi
    fi
fi

# 9. If everything is successful, update my-changes
echo -e "\n${YELLOW}Updating my-changes branch...${NC}"
git checkout my-changes
git reset --hard $SYNC_BRANCH
git push -f origin my-changes

# 10. Cleanup
echo -e "\n${YELLOW}Cleaning up temporary branches...${NC}"
git branch -D $SYNC_BRANCH

echo -e "\n${GREEN}Sync complete!${NC}"
echo -e "${YELLOW}Backup branch ${BACKUP_BRANCH} preserved for safety${NC}"
echo -e "${GREEN}You can now continue working on the my-changes branch${NC}"

# 11. Verify final state
echo -e "\n${YELLOW}Verifying final state...${NC}"
if [ -f "package.json" ]; then
    echo -e "${YELLOW}Running final build check...${NC}"
    npm install
    if grep -q "\"build\"" package.json; then
        if npm run build; then
            echo -e "${GREEN}Final build successful!${NC}"
        else
            echo -e "${RED}Final build failed. Please investigate.${NC}"
            echo -e "${YELLOW}Your changes are safe in backup branch: $BACKUP_BRANCH${NC}"
            exit 1
        fi
    fi
fi
