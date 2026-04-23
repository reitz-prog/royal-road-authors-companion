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

# Create Chrome ZIP for distribution. Enumerate dist/*.js* explicitly so
# build outputs like dist/firefox/ (generated below) aren't bundled in.
CHROME_ZIP="authors-companion-v$VERSION.zip"
echo "Creating $CHROME_ZIP..."
rm -f "$CHROME_ZIP"
zip -r "$CHROME_ZIP" \
    manifest.json popup.html offscreen.html guild.html \
    icons/ \
    dist/*.js dist/*.js.map

# Produce the Firefox package via build-firefox.sh (skipping its rebuild
# since we just ran one). Writes dist/firefox/ and the Firefox zip.
FIREFOX_ZIP="authors-companion-firefox-v$VERSION.zip"
echo "Creating $FIREFOX_ZIP..."
rm -f "$FIREFOX_ZIP"
SKIP_BUILD=1 ./build-firefox.sh >/dev/null

# Build release notes: caller may pass a notes file as $1.
# Its contents become the body; installation instructions are always appended.
NOTES_FILE="${1:-}"
INSTALL_BLOCK="## Installation

### Chrome / Edge / Brave / other Chromium
1. Download **$CHROME_ZIP**
2. Unzip the file
3. Go to \`chrome://extensions\`
4. Enable **Developer mode**
5. Click **Load unpacked** and select the unzipped folder

### Firefox
1. Download **$FIREFOX_ZIP**
2. **Temporary (any Firefox)**: go to \`about:debugging#/runtime/this-firefox\`, click **Load Temporary Add-on...**, select the zip
3. **Permanent (Dev Edition / Nightly)**: set \`xpinstall.signatures.required\` to \`false\` in \`about:config\`, rename the zip to \`.xpi\`, drag onto Firefox"

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

# Create the release with both Chrome + Firefox assets.
echo "Creating release v$VERSION..."
gh release create "v$VERSION" \
    --title "v$VERSION" \
    --notes "$NOTES_BODY" \
    "$CHROME_ZIP" "$FIREFOX_ZIP"

# Cleanup
rm -f "$CHROME_ZIP" "$FIREFOX_ZIP"

echo "Release v$VERSION created successfully!"
