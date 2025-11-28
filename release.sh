#!/bin/bash

# Automated release script for Pocket Prompt
# This script handles version bumping, changelog updates, and release creation
#
# Usage: ./release.sh [version]
# Example: ./release.sh 0.1.8
#
# If no version is provided, it will bump the patch version automatically.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get current version from tauri.conf.json
CURRENT_VERSION=$(grep '"version":' src-tauri/tauri.conf.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')

echo -e "${GREEN}Current version: ${CURRENT_VERSION}${NC}"

# Determine new version
if [ -z "$1" ]; then
  # Auto-bump patch version
  IFS='.' read -r -a version_parts <<< "$CURRENT_VERSION"
  major="${version_parts[0]}"
  minor="${version_parts[1]}"
  patch="${version_parts[2]}"
  NEW_VERSION="${major}.${minor}.$((patch + 1))"
  echo -e "${YELLOW}Auto-bumping patch version to: ${NEW_VERSION}${NC}"
else
  NEW_VERSION="$1"
  echo -e "${YELLOW}Using provided version: ${NEW_VERSION}${NC}"
fi

# Confirm with user
read -p "Create release v${NEW_VERSION}? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}Release cancelled${NC}"
  exit 1
fi

# Update version in tauri.conf.json
echo "Updating version in tauri.conf.json..."
sed -i.bak "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" src-tauri/tauri.conf.json
rm src-tauri/tauri.conf.json.bak

# Update changelog (you'll need to manually edit the description)
echo -e "${YELLOW}Please update the changelog in README.md before continuing${NC}"
read -p "Press Enter when you've updated the changelog..."

# Commit version bump
git add src-tauri/tauri.conf.json README.md
git commit -m "Bump version to ${NEW_VERSION}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to master
echo "Pushing to master..."
git push

# Create and push tag
echo "Creating and pushing tag v${NEW_VERSION}..."
git tag "v${NEW_VERSION}"
git push origin "v${NEW_VERSION}"

echo -e "${GREEN}✓ Release v${NEW_VERSION} initiated!${NC}"
echo ""
echo "The GitHub Actions workflow is now building the release."
echo "Check progress at: https://github.com/dpshade/pocket-prompt-ui/actions"
echo ""
echo "Once the workflow completes:"
echo "  1. Go to https://github.com/dpshade/pocket-prompt-ui/releases"
echo "  2. Edit the draft release"
echo "  3. Update the release notes if needed"
echo "  4. Uncheck 'Set as a pre-release' if this is stable"
echo "  5. Publish the release"
