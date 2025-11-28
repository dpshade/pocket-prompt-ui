# Pocket Prompt (Desktop)

> A free, local-first prompt manager with paid cloud sync and premium prompt packs.

---

## Overview

| Field | Value |
|-------|-------|
| **Platform** | Desktop (Tauri) |
| **Tech Stack** | React, Tauri, Turso (libSQL embedded) |
| **Status** | Active Development (v0.1.5) |
| **Repo** | `pocket-prompt-ui` |

---

## Features

### Core Functionality
- **Local-First Architecture**: Uses embedded `libSQL` (Turso) for instant, offline local storage
- **Directory Sync**: Attach to local directories (e.g., Obsidian vaults) with real-time file watching
- **Global Hotkey**: `Cmd+Shift+P` overlay to inject prompts anywhere
- **Open in LLM**: Button to open prompt in your LLM of choice
- **Pack Loader**: Import standardized JSON prompt packs
- **Full-Text Search**: Powered by FlexSearch for instant results
- **Tag Management**: Organize prompts with tags and multi-tag filtering
- **One-Click Copy**: Instantly copy prompts to clipboard
- **Edit & Version Control**: Create new versions on edit, navigate version history
- **Archive System**: Soft delete with ability to restore archived prompts

### UI/UX
- **Search-Engine Style Layout**: Clean, centered search bar with Geist font
- **Dark Mode**: Built-in dark/light theme toggle
- **Responsive Design**: Works on all screen sizes
- **Platform Integration**: macOS rounded corners, proper window decorations
- **Keyboard Navigation**: Full keyboard shortcuts support

### Privacy & Security
- **100% Local by Default**: All data stored locally in embedded database
- **Optional Cloud Sync (Paid)**: Activates Turso replication to sync across devices
- **No Tracking**: No analytics, no telemetry

---

## Quick Start

### Prerequisites
- macOS 10.15+ (Windows/Linux support coming soon)
- [Bun](https://bun.sh/) for development

### Installation

#### From Release (Recommended)
1. Download the latest `.dmg` from [Releases](https://github.com/dpshade/pocket-prompt-ui/releases)
2. Drag `Pocket Prompt.app` to Applications
3. Launch and grant accessibility permissions for global hotkey

#### Build from Source
```bash
# Clone the repository
git clone https://github.com/dpshade/pocket-prompt-ui.git
cd pocket-prompt-ui

# Install dependencies
bun install

# Development mode
bun run tauri dev

# Build production app
bun run tauri build
```

#### Install Local Binary
```bash
# Quick install/update script
./install-local
```

---

## Usage

### Getting Started
1. **Launch App**: Use global hotkey `Cmd+Shift+P` or launch from Applications
2. **Create Prompt**: Click "New Prompt" to create your first prompt
3. **Add Details**: Fill in title, description, tags, and content
4. **Save**: Prompts are automatically saved to local database

### Directory Sync (Obsidian Integration)
1. **Attach Directory**: Click "Attach Local Directory" in settings
2. **Select Folder**: Choose your Obsidian vault or any markdown folder
3. **Real-Time Sync**: File changes are automatically detected and synced
4. **Status Indicator**: Header shows "Linked" or "Syncing..." status

### Managing Prompts
- **Search**: Use the search bar to find prompts by title, description, content, or tags
- **Filter by Tags**: Click tags to filter, or use the tag filter dropdown
- **View**: Click any prompt card to see full details
- **Copy**: One-click copy button on cards and in detail view
- **Edit**: Edit prompts to create new versions (old versions preserved)
- **Archive**: Hide prompts without deleting (can be restored)

### Version History
- Each edit creates a new version in the database
- View version history in prompt details
- Restore any previous version (creates a new version with old content)

---

## Project Structure

```
pocket-prompt-ui/
├── src/
│   ├── frontend/              # React frontend
│   │   ├── components/        # UI components
│   │   │   ├── prompts/      # Prompt management components
│   │   │   ├── search/       # Search and filtering
│   │   │   ├── shared/       # Shared UI components
│   │   │   └── sync/         # Directory sync components
│   │   ├── hooks/            # React hooks
│   │   └── index.css         # Tailwind styles
│   ├── backend/              # Tauri backend
│   │   └── api/              # Turso database queries
│   └── core/                 # Shared logic
│       ├── search/           # FlexSearch integration
│       ├── storage/          # Local storage & caching
│       └── sync/             # Directory sync engine
├── src-tauri/                # Tauri application
│   ├── src/                  # Rust backend
│   ├── icons/                # App icons (generated)
│   └── tauri.conf.json       # Tauri configuration
└── public/                   # Static assets
```

---

## Development

### Available Scripts
```bash
bun run dev          # Start Tauri dev server
bun run build        # Build frontend
bun run tauri dev    # Run Tauri in development
bun run tauri build  # Build production app
./generate-icon.sh   # Regenerate app icons (custom script)
```

### Generating App Icons

**IMPORTANT**: macOS 26 (Tahoe) requires "Liquid Glass" icons in Assets.car format. Use our custom scripts for proper icon generation.

#### For macOS 26+ (Liquid Glass Icons)
```bash
# Place a square PNG (1024x1024+) as app-icon.png in project root
./generate-liquid-glass-icon.sh

# This script generates macOS 26-compatible Liquid Glass icons:
# - Creates Assets.xcassets with all required icon sizes
# - Compiles to Assets.car using Apple's actool
# - Prevents the grey border issue on macOS 26 (Tahoe)
# - Requires Xcode Command Line Tools
```

#### For macOS <26 (Legacy .icns Icons)
```bash
# Generates traditional .icns format for backward compatibility
./generate-icon.sh

# This script generates clean .icns icons:
# - Uses ImageMagick + iconutil for macOS .icns
# - Preserves transparency and gradients properly
# - Avoids the Tauri icon generator's border artifact
```

**Technical Details**: 
- **macOS 26 (Tahoe)** enforces squircle-shaped app icons using the new "Liquid Glass" design system. Apps using the old `.icns` format will have a grey border added by the system.
- Our `generate-liquid-glass-icon.sh` script creates an `Assets.xcassets` structure and compiles it to `Assets.car` using Apple's `actool`, ensuring proper Liquid Glass appearance.
- The app maintains both formats (`.icns` and `Assets.car`) for backward compatibility with older macOS versions.

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Rust + Tauri v2
- **Database**: Turso (libSQL embedded mode)
- **Search**: FlexSearch (client-side)
- **State Management**: Zustand
- **UI Components**: shadcn/ui

---

## Revenue Model

| Metric | Value |
|--------|-------|
| Current Revenue | $0/mo |
| Potential Revenue | $2,500/mo |

### Revenue Sources

1. **"Pro" Sync Subscription** — **$4/mo** or **$40/yr**
   - Gate: Sync across 3+ devices
   - Activates Turso cloud replication
   - No migration needed (data format ready)

2. **Official Prompt Packs** — **$10-$25** per pack
   - Example: "The Y-Combinator Application Pack", "The Senior React Dev Pack"
   - One-time purchase unlocks JSON import
   - Distributed as DLC in "Store" view

---

## Action Plan

### ✅ Completed
- [x] Allow attaching to local dir instead of importing (2025-11-27)
- [x] Rebrand to "Pocket Prompt" with new gradient logo (v0.1.4)
- [x] Search-engine style UI overhaul with Geist font
- [x] Sync status indicator and manual sync button
- [x] Reset all data functionality with confirmation
- [x] Local install script for easy updates
- [x] macOS platform polish (rounded borders, proper decorations)

### 🚧 In Progress
- [ ] Fix the x-schema to work with `pocketprompt://search?q=test`
- [ ] Add hotkeys dictionary/reference
- [ ] Add drag and resize support on macOS
- [ ] Add "View All Prompts" button

### 📋 Planned
- [ ] **Pack Schema**: Define JSON structure for "Pack" (Title, Description, List of Prompts)
- [ ] **The "Store" View**: DLC marketplace for purchasable prompt packs
- [ ] **48-hour Validation Test**:
  1. Release Free Local Version on Twitter/Reddit
  2. Include "Sync" waitlist modal: "$29/yr (50% off early bird)"
  3. Success Metric: 50 active installs + 3 pre-orders

---

## Changelog

### v0.1.7 (2025-11-28)
- **Fixed Icon Border**: Resolved gray halo artifact on macOS app icon
- **Custom Icon Generator**: Added `generate-icon.sh` script using ImageMagick
- **Documentation**: Updated icon generation workflow to avoid Tauri CLI bug

### v0.1.6 (2025-11-28)
- **macOS Window Styling**: Native macOS appearance with proper rounded corners
- **Platform Polish**: Enhanced window decorations and transparency

### v0.1.5 (2025-11-28)
- **New App Icons**: Professional gradient logo across all platforms
- **Icon Generation**: Automated icon generation workflow using Tauri CLI

### v0.1.4 (2025-11-27)
- **Rebrand**: Renamed from "Prompt Vault" to "Pocket Prompt"
- **New Logo**: Gradient logo (purple → pink → orange)
- **Updated Color Scheme**: Pocket Red accent color

### v0.1.3 (2025-11-27) - 22 commits
- **Directory Sync**: Attach to local directories with real-time file watching
- **Obsidian Integration**: Full support for Obsidian vault syncing
- **UI Overhaul**: Search-engine style layout, centered search bar, softer design
- **Sync Indicator**: Header shows "Linked" or "Syncing..." status
- **Data Management**: Reset all data button with confirmation
- **Install Script**: Added `install-local` for easy binary updates
- **Platform Polish**: macOS improvements, better keyboard/mouse navigation

---

## Marketing

**Primary Audience**: Developers and Power Users who want privacy and speed

**Best Channels**: 
- Product Hunt (as free tool)
- Hacker News
- Developer communities (Reddit r/programming, r/productivity)

**Key Message**: "The fastest way to use AI. Free forever locally. Sync if you need it."

---

## Why This Asset

- **Distribution Advantage**: Free tools spread faster than paid ones. The free local version acts as marketing
- **Turso Leverage**: Embedded replica technology solves offline-to-online sync out of the box
- **Monetization Optionality**: Two revenue streams (Sync SaaS + Prompt Packs DLC)
- **Low Risk**: App functions perfectly as local-only tool if cloud costs become prohibitive
- **Privacy-First**: Appeals to developers who want full control over their data

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow existing code style (TypeScript + Rust)
4. Write tests for new functionality
5. Update documentation
6. Submit a Pull Request

---

## License

MIT License - see LICENSE file for details

---

*Part of [[2025-11-25 Dylan Shade Asset Inventory]]*

**Built with ❤️ for productivity and privacy**
