#!/bin/bash

# Build a Firefox-compatible package from the same source as release.sh.
# Produces dist/firefox/ (loadable via about:debugging → Load Temporary
# Add-on → pick dist/firefox/manifest.json) and a corresponding
# authors-companion-firefox-v<version>.zip alongside the repo for
# signing / upload to AMO.
#
# NOTE: runtime code may still need adjusting — Firefox doesn't implement
# chrome.offscreen, so the HTML-parsing path that relies on it needs to
# fall back to in-background parsing. This script only handles packaging.

set -e

VERSION=$(grep -o '"version": *"[^"]*"' manifest.json | cut -d'"' -f4)
if [ -z "$VERSION" ]; then
    echo "Error: Could not read version from manifest.json"
    exit 1
fi

echo "Version from manifest: $VERSION"

# Set SKIP_BUILD=1 when calling from release.sh (which already ran the build).
if [ -z "$SKIP_BUILD" ]; then
    echo "Building project..."
    npm run build
else
    echo "Skipping build (SKIP_BUILD set)."
fi

OUT=dist/firefox
echo "Writing to $OUT/ ..."
rm -rf "$OUT"
mkdir -p "$OUT/dist"

# Copy bundle files only (not dist/firefox itself) to avoid recursion.
cp dist/*.js dist/*.js.map "$OUT/dist/"
cp popup.html offscreen.html guild.html "$OUT/"
cp -r icons "$OUT/"

echo "Generating Firefox manifest..."
node - <<EOF
const fs = require('fs');
const m = JSON.parse(fs.readFileSync('manifest.json', 'utf-8'));

// Drop the offscreen permission — Firefox has no chrome.offscreen.
m.permissions = (m.permissions || []).filter(p => p !== 'offscreen');

// Firefox MV3 uses a background event page, not a service worker.
// "type": "module" is supported from Firefox 128.
delete m.background.service_worker;
m.background = {
  scripts: ['dist/background.js'],
  type: 'module'
};

// Required by Firefox: tie the add-on to a stable gecko ID.
m.browser_specific_settings = {
  gecko: {
    id: 'rr-author-companion@basoftwares.com',
    strict_min_version: '128.0'
  }
};

fs.writeFileSync('$OUT/manifest.json', JSON.stringify(m, null, 2) + '\n');
EOF

XPI_PATH="dist/authors-companion-firefox-v$VERSION.xpi"
ZIP_PATH="dist/authors-companion-firefox-v$VERSION.zip"

echo "Creating $XPI_PATH..."
rm -f "$XPI_PATH"
( cd "$OUT" && zip -r "../../$XPI_PATH" . >/dev/null )

# .xpi and .zip have identical bytes; ship both so users can pick whichever
# extension their install path prefers.
echo "Creating $ZIP_PATH..."
rm -f "$ZIP_PATH"
cp "$XPI_PATH" "$ZIP_PATH"

echo
echo "Firefox build ready."
echo "  Temporary install (any Firefox):"
echo "    about:debugging#/runtime/this-firefox → Load Temporary Add-on..."
echo "    → pick $OUT/manifest.json"
echo "  Permanent install (Dev Edition / Nightly with signatures off, or AMO):"
echo "    use $XPI_PATH (or $ZIP_PATH if the install path wants .zip)"
