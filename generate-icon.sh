#!/bin/bash

# Custom icon generator for Pocket Prompt
# This script generates a clean .icns file without the gray halo that Tauri's icon generator creates.
#
# Usage: ./generate-icon.sh
#
# IMPORTANT: Do NOT use `bunx tauri icon` or `bun run tauri icon` as it will overwrite this clean icon
# with a version that has a gray border artifact.

set -e

echo "Generating clean icon from app-icon.png..."

# Clean up any existing iconset
rm -rf PocketPrompt.iconset

# Create iconset directory
mkdir -p PocketPrompt.iconset

# Generate all required icon sizes
for size in 16 32 64 128 256 512 1024; do
  echo "  Generating ${size}x${size}..."
  magick app-icon.png -resize ${size}x${size} PocketPrompt.iconset/icon_${size}x${size}.png

  if [ "$size" -ne 1024 ]; then
    double=$((size * 2))
    echo "  Generating ${size}x${size}@2x..."
    magick app-icon.png -resize ${double}x${double} PocketPrompt.iconset/icon_${size}x${size}@2x.png
  fi
done

# Convert iconset to icns
echo "Creating .icns file..."
iconutil -c icns PocketPrompt.iconset -o icon.icns

# Move to Tauri icons directory
echo "Moving icon.icns to src-tauri/icons/..."
mv icon.icns src-tauri/icons/icon.icns

# Clean up
rm -rf PocketPrompt.iconset

echo "✓ Icon generation complete!"
echo ""
echo "Next steps:"
echo "  1. Build your app: cd src-tauri && cargo tauri build"
echo "  2. Check the new icon in the DMG"
echo ""
echo "Remember: NEVER run 'bunx tauri icon' as it will overwrite this clean icon!"
