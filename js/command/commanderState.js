// 一战指挥系统 — 游戏状态结构
// G.commanderState = {
//   chiefs:      { 国家 -> 现任总司令id | null（被指派为集团军指挥官时为null，光环失效） }
//   chiefPools:  { 国家 -> 后备总司令id数组（可指派为集团军指挥官） }
//   cmdPools:    { 国家 -> 可用指挥官id数组 }
//   groups:      [ { id, country, name, commanderId, divisionIds, colorIdx, wasChief } ]
//   groupCounter:{ 国家 -> 集团军编号 }
// }

function createCommanderState() {
    return {
        chiefs: {},
        chiefPools: {},
        cmdPools: {},
        groups: [],
        groupCounter: {},
    };
}
