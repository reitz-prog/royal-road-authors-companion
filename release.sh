#!/bin/bash

set -e

# Read version from manifest.json
VERSION=$(grep -o '"version": *"[^"]*"' manifest.json | cut -d'"' -f4)

if [ -z "$VERSION" ]; then
    echo "Error: Could not read version from manifest.json"
    exit 1
fi

echo "Version from manifest: $VERSION"

# Build the project
echo "Building project..."
npm run build

# Create the release
echo "Creating release v$VERSION..."
gh release create "v$VERSION" \
    --title "v$VERSION" \
    --generate-notes \
    dist/*

echo "Release v$VERSION created successfully!"
