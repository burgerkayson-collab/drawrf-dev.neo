# 🪓 drwarf v2

![Version](https://img.shields.io/badge/version-2.0-e8a33d?style=for-the-badge)
![Manifest V3](https://img.shields.io/badge/Chrome%20%2F%20Edge-Manifest%20V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![Zero Dependencies](https://img.shields.io/badge/dependencies-zero%20(1%20file)-2ea44f?style=for-the-badge)
![Engines](https://img.shields.io/badge/engines-JS%20%7C%20Godot%20%7C%20Unity%20%7C%20RPG%20Maker%20%7C%20Phaser-8A2BE2?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-lightgrey?style=for-the-badge)

A lightweight, single-file browser toolkit for inspecting, modifying, and debugging HTML5 & WebAssembly web games.

Built to work across **plain JS games, Cookie Clicker-style incrementals, RPG Maker MV/MZ, Phaser, Construct 2/3, Godot, Unity WebGL, and GameMaker**—complete with a draggable floating UI panel and a full console API.

---

## ✨ Features

* **Floating Overlay UI (`drwarf.ui`):** Filter live game variables by name or regex, edit numbers/strings/booleans in real time, and `❄` freeze values with a single click.
* **Deep Variable Scanner (`drwarf.vars`):** Search global objects by value, regex key name, or take before/after state snapshots (`snap` / `diff`) to pinpoint exact paths.
* **Save File Decoder & Editor (`drwarf.saves`):** Automatically detects and decodes `localStorage`, `sessionStorage`, and cookies (JSON, Base64, URI-encoded, and `!END!` formats) with one-click JSON field editing, patching, and full backups.
* **Godot `user://` File Manager (`drwarf.godot`):** Read, patch, overwrite, and download Godot web export save files directly from IndexedDB (`/userfs`).
* **WASM Linear Memory Scanner (`drwarf.mem`):** Cheat-Engine-style value scanning (`i32`, `u32`, `f32`, `f64`, `i16`, `u8`), narrowing (`changed`, `unchanged`, `inc`, `dec`), string searching, and memory freezing for Godot, Unity, and GameMaker WASM exports.

---

## 🚀 Installation

### Option 1: Chrome / Edge Extension (Recommended)
Installing as an unpacked extension automatically hooks `WebAssembly.Memory` at `document_start` (required for WASM memory scanning) and lets you toggle the floating UI from your toolbar.

1. Download the latest `drwarf-extension.zip` from **[Releases](../../releases)** and unzip it.
2. Open **`chrome://extensions`** (or **`edge://extensions`**) in your browser.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the unzipped `drwarf` folder.
5. Click the **🪓 drwarf** icon in your toolbar on any game tab to open or close the floating panel.

### Option 2: Quick DevTools Console Paste
*(Note: Everything except WASM memory scanning works when pasted after a game has already loaded.)*

1. Open DevTools (`F12` or `Ctrl+Shift+I`) and go to the **Console** tab.
2. Paste the contents of [`drwarf.js`](./drwarf.js) and press **Enter**.
3. Run `drwarf.ui.open()` to launch the overlay or `drwarf.help()` to view all commands.

---

## 📖 Tutorial: How to Use `drwarf`

### 1. First Step on Any Game
Open DevTools Console (`F12`) and run an automatic scan to detect the game engine, list top-level numbers, check save storage, and verify WASM memory capture:
```javascript
drwarf.scan()
```
Or click the extension icon (or run `drwarf.ui.open()`) to bring up the **floating panel**, type a keyword like `gold`, `hp`, or `speed` into the filter box, and click `❄` to lock a value.

---

### 2. Finding Hidden JS Variables (Snapshot & Diff)
When a game nests its stats deep inside objects or uses unclear variable names:
```javascript
// 1. Take a snapshot of all current game values
drwarf.vars.snap('before')

// 2. Spend a coin, take damage, or earn points in-game

// 3. See every variable that changed
drwarf.vars.diff('before')

// 4. Edit or freeze the path you found
drwarf.vars.set('Game.player.coins', 999999)
drwarf.vars.freeze('Game.player.hp', 100)
```

You can also search directly by **exact value** or **property name**:
```javascript
drwarf.vars.find(1250)               // Find where the number 1250 lives
drwarf.vars.key(/ammo|energy|gem/i)  // Search variable names by regex
```

---

### 3. Editing & Backing Up Web Saves
`drwarf` automatically decodes Base64 and JSON save strings stored in browser storage:
```javascript
// List all detected save entries
await drwarf.saves.show()

// Open and inspect a save (automatically decoded)
drwarf.saves.read('local:MyGameSave')

// Edit a specific field inside a JSON/Base64-JSON save, then refresh the page
drwarf.saves.edit('local:MyGameSave', 'player.level', 99)

// Download a full backup of all storage entries
drwarf.saves.backup()
```

---

### 4. Editing Godot Web (`user://`) Saves
For Godot HTML5 exports storing saves in IndexedDB:
```javascript
// List all files inside user://
await drwarf.godot.show()

// Read a save file
await drwarf.godot.read('/userfs/savegame.save')

// Patch text inside a save file, then reload the tab
await drwarf.godot.patch('/userfs/savegame.save', '"coins": 10', '"coins": 99999')

// Download the raw save file to your computer
await drwarf.godot.download('/userfs/savegame.save')
```

---

### 5. Scanning WASM Memory (Godot / Unity / GameMaker)
*(Requires the extension installed so the hook runs before the game boots.)*

```javascript
// 1. Verify WASM memory was captured
drwarf.mem.status()

// 2. Scan for your current in-game value (default type: 'i32'; also supports 'f32', 'f64', 'u32', 'i16', 'u8')
drwarf.mem.scan(100)

// 3. Change the value in-game (e.g., spend 15 gold so it becomes 85), then narrow down:
drwarf.mem.next(85)
// Or narrow by relative change: drwarf.mem.next('dec') / drwarf.mem.next('inc') / drwarf.mem.next('changed')

// 4. Once only a few addresses remain, poke or freeze the address:
drwarf.mem.poke('0x01a4f8c0', 99999)
drwarf.mem.freeze('0x01a4f8c0', 99999)
```

---

## ⚠️ Disclaimer
Intended for single-player games, offline tinkering, and debugging your own web builds. Always back up your saves (`drwarf.saves.backup()`) before modifying game state.

