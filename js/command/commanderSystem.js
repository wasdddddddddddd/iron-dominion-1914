// 一战指挥系统 — 核心逻辑（编成、解散、加成计算、指派/撤换）
// 设计原则：指挥官不生成战场实体、不死人、无消耗，仅作为集团军的"属性挂件"。

const CMD_GROUP_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#e84393'];

// ==== 初始化 ====
function initCommanderSystem() {
    if (G.commanderState && G.commanderState.groups && Array.isArray(G.commanderState.groups)) {
        // 读档后：清理已失效的师团引用（集团军保留，即使成员全灭）
        pruneBrokenGroups();
        return;
    }
    G.commanderState = createCommanderState();
    let cs = G.commanderState;
    for (let code in COMMANDER_DATA) {
        let d = COMMANDER_DATA[code];
        if (!d) continue;
        if (d.chiefs && d.chiefs.length > 0) {
            cs.chiefs[code] = d.chiefs[0].id;
            cs.chiefPools[code] = d.chiefs.slice(1).map(c => c.id);
        }
        cs.cmdPools[code] = (d.commanders || []).map(c => c.id);
    }
}

function pruneBrokenGroups() {
    let cs = G.commanderState;
    if (!cs) return;
    for (let g of cs.groups) {
        g.divisionIds = (g.divisionIds || []).filter(did => G.divisions.some(d => d.id === did));
    }
    _markGroupsDirty(cs);
}

// ==== 数据查询 ====
function commanderDataOf(code, id) {
    let d = COMMANDER_DATA[code];
    if (!d) return null;
    for (let c of d.chiefs || []) if (c.id === id) return c;
    for (let c of d.commanders || []) if (c.id === id) return c;
    return null;
}

function getActiveChief(code) {
    let cs = G.commanderState;
    if (!cs || !cs.chiefs) return null;
    let cid = cs.chiefs[code];
    if (!cid) return null;
    return commanderDataOf(code, cid);
}

function getChiefAura(code) {
    let chief = getActiveChief(code);
    if (!chief || !chief.aura) return null;
    return chief.aura;
}

// 光环效果归一化为数组（支持 {stat,value} 或 [{stat,value},...]）
function getAuraList(chief) {
    if (!chief || !chief.aura) return [];
    let a = chief.aura;
    return Array.isArray(a) ? a : [a];
}

// 师→集团军 查找缓存：避免每帧 O(集团军×师) includes 扫描
// cs._grpVer 在每次 groups 结构变更时 +1，缓存按 (cs 对象, 版本号) 惰性重建
let _divGroupCacheCs = null, _divGroupCacheVer = -1, _divGroupCache = null;

function _markGroupsDirty(cs) {
    if (cs) cs._grpVer = (cs._grpVer || 0) + 1;
}

function getGroupOfDivision(divId) {
    let cs = G.commanderState;
    if (!cs) return null;
    let ver = cs._grpVer || 0;
    if (_divGroupCacheCs !== cs || _divGroupCacheVer !== ver) {
        let m = new Map();
        for (let g of cs.groups) {
            let ids = g.divisionIds;
            if (!ids) continue;
            for (let i = 0; i < ids.length; i++) {
                if (!m.has(ids[i])) m.set(ids[i], g);
            }
        }
        _divGroupCache = m;
        _divGroupCacheCs = cs;
        _divGroupCacheVer = ver;
    }
    return _divGroupCache.get(divId) || null;
}

function getGroupById(groupId) {
    let cs = G.commanderState;
    if (!cs) return null;
    return cs.groups.find(g => g.id === groupId) || null;
}

function getGroupColor(group) {
    return CMD_GROUP_COLORS[(group.colorIdx || 0) % CMD_GROUP_COLORS.length];
}

function getCommanderPool(code) {
    let cs = G.commanderState;
    if (!cs) return [];
    return cs.cmdPools[code] || [];
}

function getChiefPool(code) {
    let cs = G.commanderState;
    if (!cs) return [];
    return cs.chiefPools[code] || [];
}

// 可用指挥官列表（含后备总司令；现任总司令不可指派为集团军指挥官）
function getAvailableCommanders(code, excludeId) {
    let out = [];
    for (let cid of getCommanderPool(code)) {
        if (cid === excludeId) continue;
        let d = commanderDataOf(code, cid);
        if (d) out.push({ data: d, source: 'pool' });
    }
    for (let cid of getChiefPool(code)) {
        if (cid === excludeId) continue;
        let d = commanderDataOf(code, cid);
        if (d) out.push({ data: d, source: 'chiefPool' });
    }
    return out;
}

// ==== 加成计算（纯数值层） ====
// per-unit 缓存：组结构/总司变更会 _markGroupsDirty(+1 版本号)，缓存按版本惰性重建
function getDivisionBonuses(div) {
    let cs = G.commanderState;
    if (!div || !div.country || !cs) return { atk: 0, hp: 0, spd: 0, logi: 0 };
    let ver = cs._grpVer || 0;
    if (div._bonusVer === ver && div._bonus) return div._bonus;
    let b = { atk: 0, hp: 0, spd: 0, logi: 0 };
    let group = getGroupOfDivision(div.id);
    if (group) {
        let cmdr = commanderDataOf(group.country, group.commanderId);
        if (cmdr) {
            b.atk += cmdr.atk || 0;
            b.hp += cmdr.hp || 0;
            b.spd += cmdr.spd || 0;
            b.logi += cmdr.logi || 0;
        }
    }
    // 总司令全局光环（被指派为集团军指挥官时光环失效）
    let chief = getActiveChief(div.country);
    for (let ef of getAuraList(chief)) {
        if (b[ef.stat] !== undefined) b[ef.stat] += ef.value || 0;
    }
    div._bonus = b; div._bonusVer = ver;
    return b;
}

function getDivisionAtkBonus(d) { return getDivisionBonuses(d).atk; }
function getDivisionHpBonus(d) { return getDivisionBonuses(d).hp; }
function getDivisionSpdBonus(d) { return getDivisionBonuses(d).spd; }
function getDivisionLogiBonus(d) { return getDivisionBonuses(d).logi; }

// 加成明细拆分（集团军指挥官 / 总司令光环分开返回，便于叠加显示）
function getBonusBreakdown(div) {
    let out = { group: null, aura: null };
    if (!div || !div.country) return out;
    let cs = G.commanderState;
    if (!cs) return out;
    let group = getGroupOfDivision(div.id);
    if (group) {
        let cmdr = commanderDataOf(group.country, group.commanderId);
        if (cmdr) {
            out.group = {
                name: group.name,
                atk: cmdr.atk || 0, hp: cmdr.hp || 0, spd: cmdr.spd || 0, logi: cmdr.logi || 0
            };
        }
    }
    let chief = getActiveChief(div.country);
    if (chief && chief.aura) {
        out.aura = { name: chief.name, effects: getAuraList(chief) };
    }
    return out;
}

// ==== 集团军编成 ====
function createArmyGroup(code, commanderId, divIds) {
    let cs = G.commanderState;
    if (!cs) return { ok: false, msg: "指挥系统未初始化" };
    if (cs.groups.filter(g => g.country === code).length >= 6) {
        return { ok: false, msg: "集团军数量已达上限（6个），请先在集团军管理面板删除部分集团军" };
    }
    let cmdr = commanderDataOf(code, commanderId);
    if (!cmdr) return { ok: false, msg: "找不到该指挥官" };
    if (cs.groups.some(g => g.country === code && g.commanderId === commanderId)) {
        return { ok: false, msg: "该指挥官已在指挥其他集团军" };
    }
    let poolOk = getCommanderPool(code).includes(commanderId) ||
        getChiefPool(code).includes(commanderId);
    if (!poolOk) return { ok: false, msg: "该指挥官当前不可用（现任总司令不可指派为集团军指挥官）" };

    let valid = [];
    for (let did of divIds) {
        if (valid.includes(did)) continue;
        let d = G.divisions.find(x => x.id === did);
        if (!d || d.country !== code || d.strength <= 0) continue;
        if (typeof isSeaType === 'function' && isSeaType(d.type)) continue;
        valid.push(did);
    }
    if (valid.length > cmdr.cap) return { ok: false, msg: "师团数超出该指挥官可指挥上限(" + cmdr.cap + ")" };

    // 从原集团军脱离
    for (let did of valid) {
        let old = getGroupOfDivision(did);
        if (old) removeDivInternal(old, did);
    }

    let wasChief = false; // 现任总司令不可指派为集团军指挥官
    removeFromPool(code, commanderId);

    cs.groupCounter[code] = (cs.groupCounter[code] || 0) + 1;
    let group = {
        id: 'grp_' + code + '_' + cs.groupCounter[code],
        country: code,
        name: '第' + cs.groupCounter[code] + '集团军',
        commanderId: commanderId,
        divisionIds: valid,
        colorIdx: cs.groups.length % CMD_GROUP_COLORS.length,
        wasChief: wasChief,
    };
    for (let did of valid) {
        let d = G.divisions.find(x => x.id === did);
        if (d) d.armyGroupId = group.id;
    }
    cs.groups.push(group);
    _markGroupsDirty(cs);
    return { ok: true, group: group };
}

// ==== 解散 ====
function disbandArmyGroup(groupId) {
    let cs = G.commanderState;
    if (!cs) return { ok: false, msg: "指挥系统未初始化" };
    let gi = cs.groups.findIndex(g => g.id === groupId);
    if (gi < 0) return { ok: false, msg: "集团军不存在" };
    let group = cs.groups[gi];
    for (let did of group.divisionIds) {
        let d = G.divisions.find(x => x.id === did);
        if (d) d.armyGroupId = null;
    }
    cs.groups.splice(gi, 1);
    _markGroupsDirty(cs);
    returnGroupCommander(group);
    return { ok: true };
}

// ==== 更换指挥官 ====
function replaceGroupCommander(groupId, newCommanderId) {
    let cs = G.commanderState;
    if (!cs) return { ok: false, msg: "指挥系统未初始化" };
    let group = getGroupById(groupId);
    if (!group) return { ok: false, msg: "集团军不存在" };
    if (group.commanderId === newCommanderId) return { ok: false, msg: "该指挥官已在指挥本集团军" };
    if (cs.groups.some(g => g.country === group.country && g.commanderId === newCommanderId)) {
        return { ok: false, msg: "该指挥官已在指挥其他集团军" };
    }
    let cmdr = commanderDataOf(group.country, newCommanderId);
    if (!cmdr) return { ok: false, msg: "找不到该指挥官" };
    if (group.divisionIds.length > cmdr.cap) return { ok: false, msg: "师团数超出该指挥官可指挥上限(" + cmdr.cap + ")" };
    let poolOk = getCommanderPool(group.country).includes(newCommanderId) ||
        getChiefPool(group.country).includes(newCommanderId);
    if (!poolOk) return { ok: false, msg: "该指挥官当前不可用（现任总司令不可指派为集团军指挥官）" };

    returnGroupCommander(group);
    group.commanderId = newCommanderId;
    group.wasChief = false; // 现任总司令不可指派为集团军指挥官
    removeFromPool(group.country, newCommanderId);
    return { ok: true };
}

// ==== 师团脱离 ====
function removeDivisionFromGroup(divId) {
    let cs = G.commanderState;
    if (!cs) return { ok: false, msg: "指挥系统未初始化" };
    let group = getGroupOfDivision(divId);
    if (!group) return { ok: false, msg: "该师团不在任何集团军中" };
    let d = G.divisions.find(x => x.id === divId);
    removeDivInternal(group, divId);
    addGameLog((d ? d.name : "师团") + " 已脱离" + group.name + "，失去指挥官加成");
    return { ok: true };
}

// ==== 师团加入集团军 ====
function addDivisionToGroup(divId, groupId) {
    let cs = G.commanderState;
    if (!cs) return { ok: false, msg: "指挥系统未初始化" };
    let group = getGroupById(groupId);
    if (!group) return { ok: false, msg: "集团军不存在" };
    let d = G.divisions.find(x => x.id === divId);
    if (!d || d.country !== group.country || d.strength <= 0) return { ok: false, msg: "该师团无效" };
    if (typeof isSeaType === 'function' && isSeaType(d.type)) return { ok: false, msg: "海军不能编入集团军" };
    let cmdr = commanderDataOf(group.country, group.commanderId);
    if (!cmdr) return { ok: false, msg: "找不到集团军指挥官" };
    if (group.divisionIds.includes(divId)) return { ok: false, msg: "该师团已在" + group.name + "中" };
    if (group.divisionIds.length >= cmdr.cap) return { ok: false, msg: "集团军已满员（上限" + cmdr.cap + "个师）" };
    let old = getGroupOfDivision(divId);
    if (old) removeDivInternal(old, divId);
    group.divisionIds.push(divId);
    d.armyGroupId = group.id;
    _markGroupsDirty(cs);
    return { ok: true, group: group };
}

// 内部：从集团军移除某师（不弹日志）
function removeDivInternal(group, divId) {
    let i = group.divisionIds.indexOf(divId);
    if (i >= 0) group.divisionIds.splice(i, 1);
    let d = G.divisions.find(x => x.id === divId);
    if (d) d.armyGroupId = null;
    _markGroupsDirty(G.commanderState);
}

// 单位死亡时调用（静默清理）
function cleanupDivisionGroup(divId) {
    let cs = G.commanderState;
    if (!cs) return;
    let group = getGroupOfDivision(divId);
    if (!group) return;
    removeDivInternal(group, divId);
}

// ==== 指挥官池管理 ====
function removeFromPool(code, cid) {
    let cs = G.commanderState;
    if (!cs) return;
    let cp = cs.chiefPools[code];
    if (cp) {
        let i = cp.indexOf(cid);
        if (i >= 0) { cp.splice(i, 1); return; }
    }
    let mp = cs.cmdPools[code];
    if (mp) {
        let i = mp.indexOf(cid);
        if (i >= 0) mp.splice(i, 1);
    }
}

// ==== 任命总司令 ====
function setChief(code, cmdId) {
    let cs = G.commanderState;
    if (!cs) return { ok: false, msg: "指挥系统未初始化" };
    if (cs.chiefs[code] === cmdId) return { ok: false, msg: "该将领已是现任总司令" };
    let d = commanderDataOf(code, cmdId);
    if (!d) return { ok: false, msg: "找不到该将领" };
    let cp = getChiefPool(code);
    if (!cp.includes(cmdId)) return { ok: false, msg: "该将领当前不可用" };
    // 现任总司令回归后备池
    let cur = cs.chiefs[code];
    if (cur) {
        if (!cs.chiefPools[code]) cs.chiefPools[code] = [];
        if (!cs.chiefPools[code].includes(cur)) cs.chiefPools[code].push(cur);
    }
    cs.chiefs[code] = cmdId;
    removeFromPool(code, cmdId);
    // 总司变更影响全单位光环 → 使 getDivisionBonuses 的 per-unit 缓存失效
    _markGroupsDirty(cs);
    let auraTxt = "无光环";
    if (d.aura) {
        let labelMap = { atk: '攻击', hp: '血量', spd: '移速', logi: '后勤' };
        auraTxt = "光环：" + getAuraList(d).map(a => {
            let v = a.value || 0;
            let sign = v < 0 ? '-' : '+';
            return (labelMap[a.stat] || a.stat) + sign + Math.round(Math.abs(v) * 100) + '%';
        }).join('/');
    }
    return { ok: true, msg: "已任命 " + d.name + " 为新总司令（" + auraTxt + "）" };
}

// 指挥官回归：曾任总司令的恢复总司令职位（光环恢复），其余回各自池
function returnGroupCommander(group) {
    let cs = G.commanderState;
    if (!cs) return;
    let code = group.country;
    if (group.wasChief && cs.chiefs[code] === null) {
        cs.chiefs[code] = group.commanderId;
        return;
    }
    let d = COMMANDER_DATA[code];
    let isChiefType = !!(d && (d.chiefs || []).some(c => c.id === group.commanderId));
    if (isChiefType) {
        if (!cs.chiefPools[code]) cs.chiefPools[code] = [];
        if (!cs.chiefPools[code].includes(group.commanderId)) cs.chiefPools[code].push(group.commanderId);
    } else {
        if (!cs.cmdPools[code]) cs.cmdPools[code] = [];
        if (!cs.cmdPools[code].includes(group.commanderId)) cs.cmdPools[code].push(group.commanderId);
    }
}

// ==== 集团军查询 ====
function getGroupMembers(group) {
    return group.divisionIds.map(id => G.divisions.find(d => d.id === id)).filter(d => d);
}

function getGroupTotalStrength(group) {
    let members = getGroupMembers(group);
    let sum = 0;
    for (let m of members) sum += (m.strength || 0);
    return Math.round(sum * 110 / 100) * 100; // 每100兵力≈11000人
}
