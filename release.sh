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

# Create ZIP for distribution
ZIP_NAME="authors-companion-v$VERSION.zip"
echo "Creating $ZIP_NAME..."
rm -f "$ZIP_NAME"
zip -r "$ZIP_NAME" manifest.json popup.html offscreen.html offscreen.js dist/ icons/

# Build release notes: caller may pass a notes file as $1.
# Its contents become the body; installation instructions are always appended.
NOTES_FILE="${1:-}"
INSTALL_BLOCK="## Installation

1. Download **$ZIP_NAME**
2. Unzip the file
3. Go to \`chrome://extensions\`
4. Enable **Developer mode**
5. Click **Load unpacked** and select the unzipped folder"

if [ -n "$NOTES_FILE" ]; then
    if [ ! -f "$NOTES_FILE" ]; then
        echo "Error: notes file not found: $NOTES_FILE"
        exit 1
    fi
    NOTES_BODY="$(cat "$NOTES_FILE")

$INSTALL_BLOCK"
else
    NOTES_BODY="$INSTALL_BLOCK"
fi

# Create the release
echo "Creating release v$VERSION..."
gh release create "v$VERSION" \
    --title "v$VERSION" \
    --notes "$NOTES_BODY" \
    "$ZIP_NAME"

# Cleanup
rm -f "$ZIP_NAME"

echo "Release v$VERSION created successfully!"
