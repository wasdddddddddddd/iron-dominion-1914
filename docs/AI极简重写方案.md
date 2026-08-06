# AI 战斗系统重写方案（极简版）

## 不要做的事
不搞集团军分类。不搞战区。不搞计划加成。不搞战线几何计算。不搞阶段转移。

## 四条硬规则（按顺序执行）

### 规则1：边境城市必须有驻军
```
遍历本国每个城市：
  如果城市3°内有敌国城市 → 这是边境城市
  需要驻军数 = 首都3个 / 大城市2个 / 普通1个
  从该城市附近找最近的非火炮单位，标记为 DEFEND_CITY
  DEFEND_CITY 的单位永远不离开（除非城市沦陷）
```
**就这么简单。** 不需要什么优先级评分、上限cap、阿尔萨斯特殊处理。每个边境城市固定数量驻军。

### 规则2：中立城市自动踩
```
遍历本国3.5°内的每个中立城市：
  找一个最近的空闲非火炮单位
  如果距离<8° → 直接走过去占领
  路上经过其他中立城市 → 顺路踩了
```

### 规则3：所有剩余兵力打同一个最近敌城
```
收集所有不是 DEFEND_CITY 的空闲单位
计算它们的位置中心
找离中心最近的敌方城市（前线城市优先）
把所有空闲单位全部派过去打这一个城
步兵和火炮一起走（取火炮速度）
到城下后：
  - 火炮在射程外轰城
  - 步兵围在城周围
  - 一直打到城破
城池攻破后 → 重新执行规则1-3
```

### 规则4：如果30天没进展，换目标
```
每个单位记录 _stuckTicks
如果单位30个tick内：
  - 没有移动超过0.3°
  - 且目标城市血量没下降
→ 清除任务标记，下一轮规则3会重新分配
```

## 一个文件搞定

全部写进 `js/ai/ai_battle.js`，大约200行。不需要多个文件。

## 执行顺序

```
每tick执行 updateAIBattle(country):

  1. 规则1：部署边境驻军（只在驻军不足时补）
  2. 规则2：占领附近中立城市
  3. 规则3：剩余兵力集中打最近敌城
  4. 规则4：检查卡住的单位，释放任务

  另外：如果本国任何城市HP下降且附近有敌军 →
        从规则3的进攻部队里抽最近单位回去支援
```

## 伪代码（就是最终代码的结构）

```javascript
function updateAIBattle(country) {
    let enemies = getEnemiesOf(country);
    if (enemies.length === 0) return;
    
    let myUnits = getMyLandUnits(country);
    let borderCities = getBorderCities(country, enemies);
    
    // === 规则1：边境驻军 ===
    for (let bc of borderCities) {
        let needed = bc.isCapital ? 3 : bc.isMajor ? 2 : 1;
        let has = countDefenders(bc);
        if (has >= needed) continue;
        // 找最近的空闲非火炮单位
        let candidates = findNearestIdleUnits(bc, needed - has);
        for (let u of candidates) {
            moveUnitTo(u, bc);
            u._task = 'DEFEND_CITY';
        }
    }
    
    // === 规则2：踩中立 ===
    let neutrals = getNeutralsInRange(country, 3.5);
    for (let nc of neutrals) {
        let u = findNearestNotDefending(nc);
        if (u) { moveUnitTo(u, nc); u._task = 'ATTACK'; }
    }
    
    // === 规则3：集中打一个城 ===
    let freeUnits = myUnits.filter(u => !u._task && u.state !== 'retreating');
    if (freeUnits.length >= 2) {
        let target = findClosestEnemyFrontierCity(freeUnits, enemies);
        if (target) {
            for (let u of freeUnits) {
                if (u.type === 'artillery') {
                    // 炮在后方轰
                    moveUnitToRange(u, target, u.range * 0.85);
                } else {
                    moveUnitTo(u, target);
                }
                u._task = 'ATTACK';
            }
        }
    }
    
    // === 规则4：卡住换目标 ===
    for (let u of myUnits) {
        if (u._task !== 'ATTACK') continue;
        u._stuckTicks = u._stuckTicks || 0;
        if (distance(u, u._lastPos) < 0.3) {
            u._stuckTicks++;
            if (u._stuckTicks > 30) {
                u._task = null; // 释放，下轮重新分配
                u._stuckTicks = 0;
            }
        } else {
            u._stuckTicks = 0;
        }
        u._lastPos = { rx: u.rx, ry: u.ry };
    }
    
    // === 支援被攻城市 ===
    for (let cid in myCities) {
        let ct = myCities[cid];
        if (ct.hp < ct.maxHp && hasEnemyNear(ct)) {
            let rescuers = findNearestNotDefending(ct, 3);
            for (let u of rescuers) {
                moveUnitTo(u, ct);
                u._task = 'DEFEND_CITY';
            }
        }
    }
}
```

## 和现有系统的关系

- **保留**：aiProduction（生产）、aiEconomy（经济）、aiDiplomacy（外交）
- **删除**：aiAttackMovement、aiSiegeBehavior、aiDefenseDeployment、aiFormDefensiveLine、aiEmergencyDefense、aiReinforceFrontline 等
- **新增**：ai_battle.js（这一个文件替代上面全部）
- **修改**：updateAI() 只调用 ai_battle.js 的函数

## 预期效果

- 德军对战法国：阿尔萨斯-洛林每个边境城2个驻军→剩余全部打列日→打下后全部打布鲁塞尔→打下后全部打巴黎
- 法军对战德国：每个边境城1个驻军→剩余全部打斯特拉斯堡
- 亚琛：只是路过，不是终点。不会再堆兵
- 中立城市：每个3.5°内的中立城自动有个兵去踩
