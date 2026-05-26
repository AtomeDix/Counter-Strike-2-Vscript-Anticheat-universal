import { Instance } from "cs_script/point_script";

const CONFIG = {
    IS_ENABLED: true,
    VERSION: "1.1",
    MAX_BHOP_SPEED: 320,
    MIN_KILL_DELAY: 0.08,
    MAX_HS_RATIO: 0.85,
    MIN_KILLS_FOR_HS_CHECK: 5,
    MAX_KPM: 45,
    MAX_WALLBANGS: 3,
};

const playerData = {};
const chatQueue = [];
let nextChatTime = 0;

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
        wallLockFlags: 0
    };
    return playerData[steamID];
}

function _say(msg) { chatQueue.push(msg); }

function _logAC(playerStr, checkName, details) {
    Instance.Msg(`[PAC] ${playerStr} | ${checkName} | ${details}\n`);
    _say(`\x07[PAC] \x02⚠️ Warning: \x03${playerStr}\x01 (${checkName}).`);
}

const acScheduler = (() => {
    let running = false;
    function tick() {
        const now = Instance.GetGameTime();
        try {
            if (CONFIG.IS_ENABLED) monitorPlayersDynamics();
            if (chatQueue.length > 0 && now >= nextChatTime) {
                Instance.ServerCommand(`say "${chatQueue.shift()}"`);
                nextChatTime = now + 0.6;
            }
        } catch (e) {}
        Instance.SetNextThink(now + 0.1);
    }
    return {
        start() { 
            if (!running) { 
                running = true; 
                Instance.SetThink(tick); 
                Instance.SetNextThink(Instance.GetGameTime() + 0.1); 
            } 
        }
    };
})();

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
            const vel = pawn.GetVelocity?.();
            if (vel) {
                const speedH = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
                if (speedH > CONFIG.MAX_BHOP_SPEED) {
                    data.bhopFlags++;
                    if (data.bhopFlags >= 5) { _logAC(name, "Bhop", speedH); data.bhopFlags = 0; }
                } else if (data.bhopFlags > 0) data.bhopFlags--;
            }
        } catch (e) {}
    }
}

Instance.OnPlayerKill?.((ctx) => {
    if (!CONFIG.IS_ENABLED) return;
    try {
        const attacker = ctx.attacker;
        const ctrl = attacker?.GetPlayerController?.();
        if (!ctrl || ctrl.IsBot?.()) return;
        const data = _initPlayerTrack(ctrl.GetSteamID?.(), ctrl.GetPlayerName?.());
        const now = Instance.GetGameTime();
        data.kills++;
        if (data.lastKillTime > 0 && (now - data.lastKillTime) < CONFIG.MIN_KILL_DELAY) _logAC(data.name, "Trigger", (now - data.lastKillTime));
        data.lastKillTime = now;
        if (ctx.headshot || ctx.last_hitgroup === 1) data.headshots++;
        if (data.kills >= CONFIG.MIN_KILLS_FOR_HS_CHECK && (data.headshots / data.kills) > CONFIG.MAX_HS_RATIO) _logAC(data.name, "Aimbot", (data.headshots / data.kills));
    } catch (e) {}
});

Instance.OnPlayerChat?.((ctx) => {
    const text = (ctx.text || "").trim();
    if (!text.startsWith("!")) return;
    const args = text.split(" ");
    const cmd = args[0].toLowerCase();
    if (cmd === "!pac") { _say("PAC v1.1 - Monitoring active."); }
    else if (cmd === "!pacon") { CONFIG.IS_ENABLED = true; }
    else if (cmd === "!pacoff") { CONFIG.IS_ENABLED = false; }
});

function initAntiCheat() {
    _say(`🛡️ PAC v${CONFIG.VERSION} Online.`);
    acScheduler.start();
}

Instance.OnActivate(initAntiCheat);
Instance.OnScriptInput("Init", initAntiCheat);
