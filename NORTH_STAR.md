---
tags:
  - asset
  - asset/tier-3
  - software
  - product
source:
  - https://github.com/dpshade/pocket-prompt-ui
status: idea
monthly-potential-usd: 2500
days-to-activate: 4
audience: developers
last-updated: 2025-11-26
bridges:
  - "[[2025-11-25 Dylan Shade Asset Inventory]]"
---
# Prompt Vault (Desktop)

> A free, local-first prompt manager with paid cloud sync and premium prompt packs.

---
## Overview

| Field | Value |
|-------|-------|
| **Platform** | Desktop (Tauri) |
| **Tech Stack** | React, Tauri, Turso (libSQL embedded) |
| **Status** | Idea Phase |
| **Repo** | `pocket-prompt-ui` |

---
## Features

- **Local-First Architecture**: Uses embedded `libSQL` (Turso) for instant, offline local storage.
- **Global Hotkey**: `Cmd+Shift+P` overlay to inject prompts anywhere.
- **Open in your LLM of choice**: button to open prompt in your LLM of choice
- **Pack Loader**: Import standardized JSON prompt packs.
- **Sync Engine (Paid)**: Activates Turso replication to sync local DB with cloud edge.

---
## Revenue

| Metric | Value |
|--------|-------|
| Current Revenue | $0/mo |
| Potential Revenue | $2,500/mo |

### Revenue Sources

1. **"Pro" Sync Subscription** — **$4/mo** or **$40/yr**.
   - *Gate:* Sync across 3+ devices.
2. **Official Prompt Packs** — **$10 - $25** per pack.
   - *Example:* "The Y-Combinator Application Pack", "The Senior React Dev Pack."
   - *Mechanism:* One-time purchase unlocks the JSON import.

---
## Marketing

**Primary audience:** Developers and Power Users who want *privacy* and *speed*.
**Best channel:** Product Hunt (as a free tool), Hacker News.
**Key message:** "The fastest way to use AI. Free forever locally. Sync if you need it."

---
## Activation Plan

- [ ] **Tauri + LibSQL**: Initialize the app using `libsql` in file-system mode. This ensures data format is ready for sync later without migration logic.
- [ ] **Pack Schema**: Define the JSON structure for a "Pack" (Title, Description, List of Prompts).
- [ ] **The "Store" View**: A simple tab in the app that fetches a JSON list of available packs from a static URL. Clicking "Buy" opens a Gumroad/LemonSqueezy checkout.
- [ ] **48-hour validation test**:
    1. Release the **Free Local Version** on Twitter/Reddit.
    2. Include a "Sync" button in the UI that opens a modal: "Sync is coming soon. Join the waitlist for $29/yr (50% off)."
    3. **Success Metric:** 50 active installs of the free tool + 3 pre-orders for sync.

---
## Why This Asset

- **Distribution Advantage**: Free tools spread faster than paid ones. The free local version acts as your marketing agent.
- **Turso Leverage**: Using Turso's embedded replica technology solves the hardest part of this app (offline-to-online sync) out of the box.
- **Monetization Optionality**: If Sync is hard to sell, you can pivot entirely to selling Packs. If Packs don't sell, you can lean into the SaaS Sync. You have two ways to win.
- **Low Risk**: If the server costs ever get too high (unlikely with Turso), the app still functions perfectly as a local-only tool for existing users.

---

*Part of [[2025-11-25 Dylan Shade Asset Inventory]]*
