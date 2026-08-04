// Tactical Layer — Rendering supplements only
// All event handling is in game_core.js

// ===== Combat Timer (runs combat ticks at fixed intervals) =====
// moveUnits 已由 gameLoop 每帧执行；此 interval 只保留守卫调用（相关函数未定义时零开销）
setInterval(()=>{
    if (typeof checkCombat==='function') checkCombat();
    if (typeof processCombat==='function') processCombat(0.5);
},500);
