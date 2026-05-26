code = """// ╔══════════════════════════════════════════════════════════════╗
//  INSTALLATION INSTRUCTIONS (CS2 VScript):
//  1. Save this file as 'pac_anticheat.js' inside your CS2 directory:
//     .../Counter-Strike Global Offensive/game/csgo/scripts/vscripts/
//  2. To load it automatically on server startup or map load, add the
//     following command to your 'server.cfg' or 'autoexec.cfg':
//     script_reload_code pac_anticheat.js
//  3. Alternatively, execute it manually in the server console via:
//     script_reload_code pac_anticheat.js
// ╚══════════════════════════════════════════════════════════════╝

import { Instance } from "cs_script/point_script";

// ╔══════════════════════════════════════════════════════════════╗
//  PAC ANTICHEAT v1.1 — CONSOLE & SERVER-SIDE MONITORING
//  Compatibility: Universal (All maps) - Public Release Edition
// ╚══════════════════════════════════════════════════════════════╝

// ════════════════════════════════════════════════════════════
//  SETTINGS / CONFIGURATION SEUILS
// ════════════════════════════════════════════════════════════
const CONFIG = {
    IS_ENABLED: true,          // Global anti-cheat state
    VERSION: "1.1-Public",
    MAX_BHOP_SPEED: 320,       // Max allowed horizontal speed on ground
    MIN_KILL_DELAY: 0.08,      // Min humanly possible delay (sec) between 2 distinct kills
    MAX_HS_RATIO: 0.85,        // Max suspicious headshot ratio after minimum kills
    MIN_KILLS_FOR_HS_CHECK: 5, // Minimum kills required before calculating HS ratio
    MAX_KPM: 45,               // Maximum realistic Kills Per Minute
    MAX_WALLBANGS: 3,          // Max allowed kills through walls per round
};

// ════════════════════════════════════════════════════════════
//  PLAYER DATA STORAGE
// ════════════════════════════════════════════════════════════
const playerData = {};

function _initPlayerTrack(steamID, name) {
    if (playerData[steamID]) return playerData[steamID];
    playerData[steamID] = {
        name: name,
        kills: 0,
        headshots: 0,
        wallbangs: 0,
        lastKillTime: 0,
        joinTime: Instance.GetGameTime(),
        bhopFlags: 0,
        wallLockFlags: 0,
        isFlagged: false
    };
    return playerData[steamID];
}

// ════════════════════════════════════════════════════════════
//  NOTIFICATION UTILITIES
// ════════════════════════════════════════════════════════════
function _say(msg) { Instance.ServerCommand(`say "${msg}"`); }
function _logAC(playerStr, checkName, details) {
    Instance.Msg(`[PAC] DETECTED: ${playerStr} | Check: ${checkName} | ${details}\n`);
    _say(`\x07[PAC] \x02⚠️ Warning: \x03${playerStr}\x01 is generating alerts (${checkName}).`);
}

// ════════════════════════════════════════════════════════════
//  SCHEDULER / TICK LOOP (MOVEMENT & VISION MONITORING)
// ════════════════════════════════════════════════════════════
const acScheduler = (() => {
    let running = false;
    function tick() {
        if (CONFIG.IS_ENABLED) {
            monitorPlayersDynamics();
        }
        schedulerNextTick();
    }
    function schedulerNextTick() {
        Instance.SetThink(tick);
        Instance.SetNextThink(Instance.GetGameTime() + 0.1); // Analyze every 100ms
    }
    return {
        start() { if (!running) { running = true; schedulerNextTick(); } }
    };
})();

// ════════════════════════════════════════════════════════════
//  DETECTION 1: PLAYER DYNAMICS (BHOP & WALL-LOOK)
// ════════════════════════════════════════════════════════════
function monitorPlayersDynamics() {
    for (let slot = 0; slot < 64; slot++) {
        try {
            const ctrl = Instance.GetPlayerController(slot);
            if (!ctrl || ctrl.IsBot?.()) continue;

            const pawn = ctrl.GetPlayerPawn?.();
            if (!pawn) continue;

            const steamID = ctrl.GetSteamID?.() ?? `SLOT_${slot}`;
            const name = ctrl.GetPlayerName?.() ?? "Unknown";
            const data = _initPlayerTrack(steamID, name);

            // --- HORIZONTAL SPEED ANALYSIS (Anti-Bhop / Speedhack) ---
            const vel = pawn.GetVelocity?.();
            if (vel) {
                const speedH = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
                
                if (speedH > CONFIG.MAX_BHOP_SPEED) {
                    data.bhopFlags++;
                    if (data.bhopFlags >= 5) { 
                        _logAC(name, "Bhop/Movement Hack", `Speed: ${Math.round(speedH)} u/s`);
                        data.bhopFlags = 0;
                    }
                } else {
                    if (data.bhopFlags > 0) data.bhopFlags--;
                }
            }

            // --- WALL-LOOK HEURISTIC ---
            monitorWallTrackHeuristic(pawn, data, slot);

        } catch (e) {}
    }
}

function monitorWallTrackHeuristic(pawn, data, currentSlot) {
    try {
        const eyePos = pawn.GetEyePosition?.();
        const eyeAng = pawn.GetEyeAngles?.();
        if (!eyePos || !eyeAng) return;

        const yawRad = (eyeAng.yaw ?? eyeAng.y ?? 0) * (Math.PI / 180);
        const lookDir = { x: Math.cos(yawRad), y: Math.sin(yawRad) };

        for (let targetSlot = 0; targetSlot < 64; targetSlot++) {
            if (targetSlot === currentSlot) continue;
            const targetCtrl = Instance.GetPlayerController(targetSlot);
            if (!targetCtrl) continue;

            const targetPawn = targetCtrl.GetPlayerPawn?.();
            if (!targetPawn || targetPawn.GetTeamNumber?.() === pawn.GetTeamNumber?.()) continue;

            const targetPos = targetPawn.GetAbsOrigin?.();
            if (!targetPos) continue;

            const toEnemy = { x: targetPos.x - eyePos.x, y: targetPos.y - eyePos.y };
            const dist = Math.sqrt(toEnemy.x * toEnemy.x + toEnemy.y * toEnemy.y);
            if (dist > 1500 || dist === 0) continue; 

            toEnemy.x /= dist; toEnemy.y /= dist;

            const dot = lookDir.x * toEnemy.x + lookDir.y * toEnemy.y;

            if (dot > 0.997) {
                data.wallLockFlags++;
                if (data.wallLockFlags > 30) { 
                    _logAC(data.name, "Suspicious Vision (Wall-Lock)", `Targeting entity through map bounds`);
                    data.wallLockFlags = 0;
                }
            } else {
                if (data.wallLockFlags > 0) data.wallLockFlags -= 0.5;
            }
        }
    } catch(e) {}
}

// ════════════════════════════════════════════════════════════
//  DETECTION 2: GAME EVENTS LOGIC (KILLS & HEADSHOTS)
// ════════════════════════════════════════════════════════════
Instance.OnPlayerKill?.((ctx) => {
    if (!CONFIG.IS_ENABLED) return;

    try {
        const attacker = ctx.attacker;
        const victim = ctx.victim;

        if (!attacker || !victim || attacker === victim) return;
        
        // --- BOT FILTER (Ignore if the victim is a bot) ---
        if (typeof victim.GetPlayerController === "function") {
            const victimCtrl = victim.GetPlayerController();
            if (victimCtrl && victimCtrl.IsBot?.()) return;
        }

        if (typeof attacker.GetPlayerController !== "function") return;
        const ctrl = attacker.GetPlayerController();
        if (!ctrl || ctrl.IsBot?.()) return;

        const steamID = ctrl.GetSteamID?.() ?? "UNKNOWN_ID";
        const name = ctrl.GetPlayerName?.() ?? "Unknown";
        const data = _initPlayerTrack(steamID, name);

        const now = Instance.GetGameTime();
        data.kills++;

        // --- KILL DELAY ANALYSIS (Multi-kill/Triggerbot/Aimbot) ---
        if (data.lastKillTime > 0) {
            const delay = now - data.lastKillTime;
            if (delay < CONFIG.MIN_KILL_DELAY && delay > 0.001) {
                _logAC(name, "Aimbot / Triggerbot (Kill-Delay)", `Time between kills: ${delay.toFixed(3)}s`);
            }
        }
        data.lastKillTime = now;

        // --- HEADSHOT RATIO ANALYSIS ---
        if (ctx.headshot || ctx.last_hitgroup === 1) { 
            data.headshots++;
        }

        if (data.kills >= CONFIG.MIN_KILLS_FOR_HS_CHECK) {
            const hsRatio = data.headshots / data.kills;
            if (hsRatio > CONFIG.MAX_HS_RATIO) {
                _logAC(name, "Absolute Aimbot (HS Ratio)", `HS Rate: ${Math.round(hsRatio * 100)}% (${data.headshots}/${data.kills} Kills)`);
            }
        }

        // --- WALLBANG ANALYSIS ---
        if (ctx.penetrated || ctx.thruwall) {
            data.wallbangs++;
            if (data.wallbangs > CONFIG.MAX_WALLBANGS) {
                _logAC(name, "Wallbang Tracking", `Kills through structures: ${data.wallbangs}`);
            }
        }

        // --- LIVE KPM ANALYSIS ---
        const totalSessionTime = (now - data.joinTime) / 60;
        if (totalSessionTime > 0.5) { 
            const currentKPM = data.kills / totalSessionTime;
            if (currentKPM > CONFIG.MAX_KPM) {
                _logAC(name, "Score Anomaly (Extreme KPM)", `KPM: ${currentKPM.toFixed(2)}`);
            }
        }

    } catch (e) {}
});

// ════════════════════════════════════════════════════════════
//  CHAT COMMANDS MODULE
// ════════════════════════════════════════════════════════════
Instance.OnPlayerChat?.((ctx) => {
    try {
        const text = (ctx.text || ctx.message || ctx.chat || "").trim();
        if (!text.startsWith("!")) return;

        const args = text.split(" ");
        const cmd = args[0].toLowerCase();

        if (cmd === "!pac") {
            _say("\x04[PAC]\x01 Intelligent anti-cheat monitoring player movement, KPM, and aim synchronization.");
            _say("\x04[PAC]\x01 Commands: !pacverif [name], !pacon, !pacoff, !pacver, !paccontact");
        } 
        else if (cmd === "!pacverif") {
            if (args[1]) {
                const searchName = args[1].toLowerCase();
                const target = Object.values(playerData).find(p => p.name.toLowerCase().includes(searchName));
                
                if (target) {
                    _say(`\x04[PAC]\x01 Stats for \x03${target.name}\x01:`);
                    _say(`\x01- Kills (vs Players): ${target.kills} | HS: ${target.headshots} | Wallbangs: ${target.wallbangs}`);
                    _say(`\x01- Active Flags -> Bhop: ${target.bhopFlags}/5 | Wall-Lock: ${Math.round(target.wallLockFlags)}/30`);
                } else {
                    _say(`\x04[PAC]\x01 No player found matching: \x02${args[1]}`);
                }
            } else {
                _say(`\x04[PAC]\x01 Suspicious Flags Summary (All Players):`);
                let found = false;
                for (const id in playerData) {
                    const p = playerData[id];
                    if (p.bhopFlags > 0 || p.wallLockFlags > 0 || p.wallbangs > 0) {
                        _say(`\x01- \x03${p.name}\x01: Bhop(${p.bhopFlags}) | WallLock(${Math.round(p.wallLockFlags)}) | WB(${p.wallbangs})`);
                        found = true;
                    }
                }
                if (!found) _say("\x01  No suspicious activity or flags recorded at the moment.");
            }
        }
        else if (cmd === "!pacon") {
            CONFIG.IS_ENABLED = true;
            _say("\x04[PAC]\x01 ✅ Anti-Cheat System \x04ENABLED\x01.");
        }
        else if (cmd === "!pacoff") {
            CONFIG.IS_ENABLED = false;
            _say("\x04[PAC]\x01 ❌ Anti-Cheat System \x02DISABLED\x01.");
        }
        else if (cmd === "!pacver") {
            _say(`\x04[PAC]\x01 Current Version: \x0C${CONFIG.VERSION}`);
        }
        else if (cmd === "!paccontact") {
            _say("\x04[PAC]\x01 Public Release Edition - Edit the script file to set your support or profile link.");
        }
    } catch (e) {}
});

// ════════════════════════════════════════════════════════════
//  INITIALIZATION ON MAP START
// ════════════════════════════════════════════════════════════
function initAntiCheat() {
    Instance.ServerCommand('say "========================================="');
    Instance.ServerCommand(`say "🛡️ Secured by Pichet Anti-Cheat v${CONFIG.VERSION}"`);
    Instance.ServerCommand('say "Type !pac in chat to view available commands."');
    Instance.ServerCommand('say "========================================="');
    Instance.Msg("[PAC] Core tracking modules initialized.\n");
    
    acScheduler.start();
}

Instance.OnActivate(() => {
    initAntiCheat();
});

Instance.OnScriptInput("Init", () => {
    initAntiCheat();
});

Instance.OnRoundStart(() => {
    for (const id in playerData) {
        playerData[id].bhopFlags = 0;
        playerData[id].wallLockFlags = 0;
        playerData[id].lastKillTime = 0;
    }
});
""

with open("pac_anticheat.js", "w", encoding="utf-8") as f:
    f.write(code)

print("File written successfully.")