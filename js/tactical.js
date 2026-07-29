// Tactical Layer — Rendering supplements only
// All event handling is in game_core.js

// ===== Combat Timer (runs combat ticks at fixed intervals) =====
setInterval(()=>{
    if (typeof checkCombat==='function') checkCombat();
    if (typeof processCombat==='function') processCombat(0.5);
    if (typeof moveUnits==='function') moveUnits(0.5);
},500);
