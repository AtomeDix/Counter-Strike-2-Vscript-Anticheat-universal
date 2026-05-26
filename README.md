# PAC (Public Anti-Cheat) for CS2 — Server-Side VScript

PAC is a lightweight, universal, server-side anti-cheat solution designed for Counter-Strike 2. Written entirely in VScript (JavaScript), it runs directly within the Source 2 engine, removing the need for external plugins, specialized Hammer entities, or heavy third-party dependencies. 

It proactively monitors player dynamics, combat events, and statistics in real-time, providing immediate feedback and in-game administration tools directly through the server chat.

---

## 🛡️ Features & Detection Modules

* **Anti-Bhop & Speedhack Detection:** Real-time velocity tracking on the horizontal plan. Highlights players bypassing the standard source stamina limits ($> 320 \text{ u/s}$).
* **Combat Analytics:** * **Kill-Delay Monitor:** Catches multi-kills/triggerbots executing separate targets under a human limit ($< 0.08\text{s}$).
    * **Headshot Thresholds:** Computes dynamic live headshot ratios after an initial sample size.
    * **Wallbang Tracking:** Keeps counters on suspicious back-to-back wallbang kills.
* **Heuristic Wall-Look (ESP/Wallhack):** Uses cross-product calculation between a player’s looking vector and nearby enemy bounding origins to flag sustained, unnatural tracking through geometry.
* **Smart Bot Filter:** Automatically filters and drops AI/Bot deaths from the threat metrics to prevent false-positives on practice, warm-up, or training maps.

---

## 🎮 In-Game Chat Commands

Admin and review tools are accessible instantly via the in-game text chat:

* `!pac` — Displays the welcome message and lists all available commands.
* `!pacverif` — Shows a real-time summary of currently logged flags for all active players.
* `!pacverif [playername]` — Provides deep-dive session stats and flags for a specific player.
* `!pacon` / `!pacoff` — Instantly toggles the monitoring loops and hooks on or off.
* `!pacver` — Displays the current framework build version.
* `!paccontact` — Shows repository or support information.

---

## ⚙️ Installation Instructions

1.  **Download** the `pac_anticheat.js` script file.
2.  **Move** the file into your Counter-Strike 2 dedicated server or client local files path:
    ```text
    .../Counter-Strike Global Offensive/game/csgo/scripts/vscripts/
    ```
3.  **To load automatically** upon server boot or map changes, append the following execution line to your `server.cfg` or `autoexec.cfg`:
    ```cfg
    script_reload_code pac_anticheat.js
    ```
4.  *Alternatively, execute it manually in the server developer console at any time using that same command.*

---

## 🔧 Configuration

At the top of the script, a `CONFIG` object is exposed for easy tuning depending on your server environment (Casual, Competitive, or Deathmatch settings):

```javascript
const CONFIG = {
    IS_ENABLED: true,          // Global anti-cheat toggle
    MAX_BHOP_SPEED: 320,       // Adjust based on server SV_STAMINA configs
    MIN_KILL_DELAY: 0.08,      // Minimum delay between human actions
    MAX_HS_RATIO: 0.85,        // Threshold for perfect aimbots (85%+)
    MIN_KILLS_FOR_HS_CHECK: 5, // Minimum sample size required
    MAX_KPM: 45,               // Maximum realistic Kills Per Minute
    MAX_WALLBANGS: 3           // Flag caps per round
};
