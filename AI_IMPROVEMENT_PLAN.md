# AI 全面改善方案

## 一、当前 AI 核心问题分析

### 战略层面
1. **无战略目标**：每个单位各自为战，AI 没有全局"我想赢"的意识
2. **无前线概念**：单位各自找最近的敌人，不会形成防线，不会集中兵力突破
3. **无协同作战**：同盟国之间各自行动，德国打法国的同时奥匈在东线发呆
4. **无经济意识**：造工厂/升级城市随机选省份，不懂优先发展工业核心区
5. **无人力管理**：不顾人力消耗，无限暴兵，打到人力枯竭
6. **无战术配合**：炮兵不会支援步兵，骑兵不会侧翼包抄，军队不会撤退重整

### 具体到每个模块

| 模块 | 当前问题 | 严重程度 |
|------|---------|---------|
| 经济 | 工厂建造随机选省份；升级城市随机选；不判断收益 | ★★★ |
| 军事生产 | 兵种比例靠概率，没有针对性反制；海军几乎不造；节点不升级 | ★★★ |
| 外交 | 只有碾压时才宣战；同盟概率低；不会主动拉人入阵营 | ★★ |
| 陆军进攻 | 散兵游勇各自为战；不集中兵力；不绕后；不会包围 | ★★★★ |
| 陆军防守 | 没有防线；城市不留驻军；劣势不撤退 | ★★★ |
| 海军 | 不会两栖登陆；不会集中舰队决战；造舰不积极 | ★★★ |
| 运营 | 不懂维持战略预备队；不懂经济/军事平衡 | ★★★ |

---

## 二、改进方案总览

我建议将 AI 分为 **3 个层次**：

```
┌─────────────────────────────────────────────┐
│  第一层：战略决策 (每季度/半年评估一次)          │
│  - 评估全局态势，设定战略目标                    │
│  - 决定经济/军事投入比例                       │
│  - 决定外交取向(拉拢谁、打谁)                   │
├─────────────────────────────────────────────┤
│  第二层：战役计划 (每月/每周评估)                │
│  - 为每个战场制定进攻或防守计划                  │
│  - 分配兵力到各战场                            │
│  - 管理预备队                                 │
├─────────────────────────────────────────────┤
│  第三层：战术执行 (每 tick)                     │
│  - 单位按计划移动到指定区域                     │
│  - 自动攻击射程内的敌人                        │
│  - 微观操作(撤退、追击、支援)                   │
└─────────────────────────────────────────────┘
```

---

## 三、第一层：战略决策系统

### 3.1 战略目标设定

每个国家根据以下因素选择一个主要战略目标：

```javascript
// 可能的战略目标
STRATEGIC_GOALS = {
  BLITZ:          "速攻决战——集中兵力快速击溃主要敌人",
  TOTAL_WAR:      "总体战——全力消耗，经济军事全面动员",
  DEFENSIVE:      "固守待机——防守反击，等敌人犯错",
  ECONOMIC:       "经济发展——优先攀经济，暂避战事",
  NAVAL_SUPREMACY:"海上争霸——优先发展海军夺取制海权",
  BALANCE:        "均衡发展——经济和军事并重",
};
```

**决策因素**：
- 已损失城市比例 → 损失越大越倾向防守
- 国力对比（师团数 + 经济力）→ 优势时进攻，劣势时防守
- 性格（aggression）→ 好战国家更倾向进攻
- 战争时长 → 拖越久越倾向经济和谈
- 当前敌国数量 → 多线作战时至少一条线防守

**各国初始战略偏好**（基于性格和历史）：

| 国家 | 和平时期 | 战争初期 | 战争中期 | 战争后期 |
|------|---------|---------|---------|---------|
| 德国 | ECONOMIC | BLITZ | TOTAL_WAR | DEFENSIVE |
| 法国 | DEFENSIVE | DEFENSIVE | TOTAL_WAR | TOTAL_WAR |
| 英国 | NAVAL_SUPREMACY | NAVAL_SUPREMACY | TOTAL_WAR | TOTAL_WAR |
| 俄国 | BALANCE | BLITZ | TOTAL_WAR | DEFENSIVE |
| 奥匈 | BALANCE | BLITZ | DEFENSIVE | DEFENSIVE |
| 意大利 | ECONOMIC | DEFENSIVE | DEFENSIVE | BALANCE |
| 小国 | ECONOMIC | DEFENSIVE | DEFENSIVE | DEFENSIVE |

### 3.2 经济/军事资源分配

根据战略目标调整资源分配比例：

| 战略目标 | 工厂建造系数 | 军费系数 | 城市升级系数 | 海军投资系数 |
|---------|------------|---------|------------|------------|
| BLITZ | 0.3 | 1.0 | 0.2 | 0.1 |
| TOTAL_WAR | 0.6 | 0.8 | 0.3 | 0.3 |
| DEFENSIVE | 0.5 | 0.6 | 0.6 | 0.4 |
| ECONOMIC | 1.0 | 0.2 | 0.8 | 0.3 |
| NAVAL_SUPREMACY | 0.4 | 0.5 | 0.3 | 1.0 |
| BALANCE | 0.6 | 0.5 | 0.5 | 0.3 |

### 3.3 国库/人力管理

```javascript
// 每个国家维持以下储备目标
RESERVES = {
  emergency: {       // 紧急状态（被入侵/多线战争）
    treasury_min: 100,     // 至少保留 100 金应急
    manpower_min_percent: 0.15,  // 保留 15% 人力预备队
  },
  wartime: {         // 常规战争
    treasury_min: 200,
    manpower_min_percent: 0.20,
  },
  peacetime: {       // 和平时期
    treasury_min: 500,
    manpower_min_percent: 0.40,
  },
};
```

---

## 四、第二层：战役计划系统

### 4.1 战场划分

将全球划分为战区：

```javascript
THEATERS = {
  WESTERN_FRONT:    "西线：德/法/比/荷/卢边境",
  EASTERN_FRONT:    "东线：德/奥匈 vs 俄国",
  ITALIAN_FRONT:    "意大利战线：意 vs 奥匈",
  BALKAN_FRONT:     "巴尔干：奥匈/土/保 vs 塞尔维亚/黑山",
  MIDDLE_EAST:      "中东：土 vs 英/俄",
  NORTH_SEA:        "北海：英德海军对峙",
  MEDITERRANEAN:    "地中海：英/法 vs 意/奥匈海军",
  BALTIC:           "波罗的海：俄 vs 德海军",
  HOME_DEFENSE:     "本土防御",
};
```

### 4.2 兵力分配

每个战场分配一个**重要性权重**和**目标兵力比例**：

```javascript
// 例：德国1914年
theaterPlan = {
  WESTERN_FRONT: { priority: 1.0, targetPercent: 0.70, strategy: "OFFENSIVE" },
  EASTERN_FRONT: { priority: 0.5, targetPercent: 0.20, strategy: "DEFENSIVE" },
  HOME_DEFENSE:  { priority: 0.3, targetPercent: 0.10, strategy: "GARRISON" },
  NORTH_SEA:     { priority: 0.4, targetPercent: 0,    strategy: "NAVAL" },
};
```

**每周重新评估**：根据战况调整重点（某条战线快崩了就增援）。

### 4.3 进攻计划

每个进攻性战线生成一个**作战计划**：

```javascript
operationPlan = {
  type: "BREAKTHROUGH" | "FLANKING" | "SIEGE" | "PINCER",
  targetProvince: "provinceId",    // 优先目标
  secondaryTargets: [...],         // 次要目标
  concentration: { lon, lat },     // 集结点
  startDate: gameDate,
  minDivisionsRequired: 10,        // 最少需要多少师才发动
};
```

**突破计划 (BREAKTHROUGH)**：
1. 在前线选择一个薄弱点（敌方单位密度最低的边境省份）
2. 将主力集中到该点附近（目标兵力×2）
3. 突破后向敌国纵深推进
4. 分兵占领后方城市

**包围计划 (PINCER)**：
1. 从两个方向同时进攻
2. 目标是在敌后汇合，包围中间的敌人
3. 只在地形适合时使用（避开山地/河流障碍）

### 4.4 防守计划

```javascript
defensePlan = {
  type: "LINE" | "FORTRESS" | "FALLBACK",
  // LINE: 沿边境均匀布防
  // FORTRESS: 重点防守城市和战略要地
  // FALLBACK: 逐步后撤到有利地形
  fallbackLines: [...],           // 若 FALLBACK，指定撤退路线
  criticalCities: [...],          // 必须守住的城（首都、工业城）
};
```

**防守逻辑**：
- 敌方集中突破时：从两侧调兵堵缺口
- 城市被攻击时：附近部队自动回援
- 战线被包围时：下令撤退，避免被全歼

---

## 五、第三层：战术执行系统

### 5.1 单位行为状态机

每个 AI 单位不再是简单的"找最近的敌人→走过去"，而是：

```
IDLE → ASSIGNED(被分配到某条战线)
     → MOVING_TO_CONCENTRATION(前往集结区)
     → FORMING_LINE(在集结区展开阵型)
     → ADVANCING(随战线推进)
     → ENGAGING(接敌交战)
     → WITHDRAWING(撤退修整)
     → REINFORCING(支援友军)
     → RETURN_TO_GARRISON(回防城市)
```

### 5.2 组队系统

相邻的友军单位自动组成 **战术群 (Tactical Group)**：

```javascript
tacticalGroup = {
  id: groupId,
  units: [divId, divId, ...],
  centerLon, centerLat,
  formation: "LINE" | "WEDGE" | "SCREEN",
  task: "ATTACK" | "DEFEND" | "RESERVE",
  commander: divId,          // 群内最高经验单位
};
```

**编组规则**：
- 每 5-15 个单位一组
- 同类型优先编组（纯步兵群、炮步混合群）
- 同一战线的单位优先编组
- 每 tick 重新评估（单位死亡或走远后离队）

**战术群行为**：
- **攻击时**：步兵前压吸引火力，炮兵在后支援> 骑兵侧翼包抄
- **防守时**：步兵在前排，炮兵在后，骑兵机动预备
- **撤退时**：按顺序后撤，炮兵先撤，步兵殿后

### 5.3 撤退逻辑

```javascript
// 陆军撤退条件（当前没有）
// 新增撤退条件：
if (d.strength / d.maxStrength < 0.25) {
  // 血量低于25% → 向后方最近城市撤退
  d.state = "retreating";
  d.retreatTarget = nearestFriendlyCity;
}
if (groupCasualtyRate > 0.4) {
  // 战术群伤亡率 > 40% → 全群撤退
  for (let unit of group.units) orderRetreat(unit);
}
if (beingEncircled(d)) {
  // 被包围 → 立即突围
  d.state = "retreating";
  d.retreatTarget = nearestFriendlyUnit;
}
```

### 5.4 海军战术

**舰队集中**：
- 同一国家的海军单位自动编为舰队（5-10艘一队）
- 舰队统一行动，不分散
- 大舰队优先消灭对方小舰队（以多打少）

**舰队任务**：

```javascript
fleetMission = {
  "HUNT":       "搜索并消灭敌方舰队",
  "BOMBARD":    "沿岸炮击敌方城市（仅敌方海岸）",
  "BLOCKADE":   "封锁敌方港口（在敌方节点外巡逻）",
  "INVASION":   "护送登陆部队（等待陆军到达）",
  "RETREAT":    "撤回节点修整（HP低时）",
};
```

**两栖登陆**：
1. 舰队护送运兵船（携带陆军的海军单位）
2. 在敌方后方海岸选择登陆点（优先选防守薄弱处）
3. 登陆部队上岸后占领沿海城市
4. 建立滩头阵地后向内陆推进

### 5.5 炮兵/工程兵专用 AI

**炮兵**：
- 部署在步兵线后方 0.2°-0.3°
- 优先攻击射程内的敌人单位（不是城市）
- 己方步兵撤退时，炮兵先撤
- 敌人步兵靠近到 0.1° 时，炮兵自行后撤

**工程兵**：
- 在前线修理已方设施（工厂优先）
- 在占领的城市建造防御工事
- 不主动进攻，只自卫

---

## 六、外交 AI 改进

### 6.1 国家关系长期评估

```javascript
// 每半年评估一次所有国家的关系
diplomaticAssessment = {
  threats: [...],           // 有威胁的国家（边境+军力强+关系差）
  allies: [...],            // 盟友
  targets: [...],           // 可以打的目标（弱+边境接壤）
  neutrals: [...],          // 可拉拢的中立国
};
```

### 6.2 主动联盟策略

```javascript
// 根据以下因素决定拉谁入伙：
ALLIANCE_SCORE = {
  // +20 同阵营
  // +15 边境接壤
  // +10 有共同敌人
  // -10 对方是阵营敌对核心国
  // +5  对方弱小（需要保护）
  // +3  关系 > 60
  // -20 对方已有 3+ 盟友（外交溢出）
};
// 分数 > 30 且当前盟友 < 3 → 主动拉拢
```

### 6.3 宣战决策优化

当前 AI 宣战太保守（需要兵力 2-3 倍才打），改善：

```javascript
// 宣战条件（满足任意一条即可）：
// 1. 兵力优势 > 1.5倍 + 边境接壤 + 关系 < 30
// 2. 兵力优势 > 2.0倍 + 关系 < 20（只要打得过就扩张）
// 3. 兵力优势 > 1.2倍 + 对方正在多线战争
// 4. 对方保障国已投降/被牵制
// 5. 己方盟友正在和对方打仗 → 参战（履行同盟义务）
```

### 6.4 议和判断

```javascript
// 议和条件：
if (isNonGreatPower && warScore < -40 && divisions < 5) {
  // 小国被打残 → 割地赔款求和
  makePeace(enemy, reparations);
}
if (warScore < -60 && capitalLost) {
  // 首都丢了 → 不论大小国都考虑议和
}
if (warExhaustion > 3 years && warScore < -20) {
  // 打了3年还没赢 → 政治议和
}
```

---

## 七、运营 AI 改进

### 7.1 工厂建造优先级

不再随机选省份，而是按收益排序：

```javascript
// 评估每个省份的工厂价值
factoryScore(provinceId) {
  let score = 0;
  score += province.baseIncome * 10;      // 基础收入越高越好
  score += (3 - province.factories) * 5;  // 已有工厂少的优先（边际收益高）
  score += isMajorCity(provinceCity) ? 15 : 0;  // 大城市优先
  score += isCapital(provinceCity) ? 20 : 0;     // 首都优先
  score += provinceIsSafe ? 10 : -10;    // 安全省份优先（不被前线威胁）
  return score;
}
// 每 tick 造 1 个工厂，选分数最高的省份
```

### 7.2 城市升级策略

```javascript
// 优先升级的城市：
upgradeScore(cityId) {
  let score = 0;
  score += isBorderCity ? 20 : 0;        // 边境城市优先（可暴兵）
  score += isCapital ? 5 : 0;
  score += city.factories > 0 ? 10 : 0;  // 有工厂的优先
  score -= city.isCaptured ? 30 : 0;     // 刚打下来的不急着升
  return score;
}
```

### 7.3 兵种配比优化

```javascript
// 根据敌情调整兵种比例
function getDesiredUnitMix(country, enemies) {
  let mix = {
    infantry: 0.40,
    engineer: 0.10,
    cavalry:  0.10,
    artillery: 0.30,
    navy:     0.10,
  };
  
  // 敌人骑兵多 → 更多步兵（步兵反骑兵）
  if (enemyCavRatio > 0.20) mix.infantry += 0.10;
  
  // 敌人炮兵多 → 更多骑兵突袭（骑兵突袭炮兵阵位）
  if (enemyArtRatio > 0.25) mix.cavalry += 0.10;
  
  // 己方有海军节点 → 保持一定海军比例
  if (hasNavyNode) mix.navy = 0.10;
  else mix.navy = 0;  // 没港口的国家不造海军
  
  // 防守战 → 更多炮兵
  if (strategy === "DEFENSIVE") mix.artillery += 0.10;
  
  return normalize(mix);
}
```

### 7.4 造舰/升级节点

```javascript
// 海军节点升级优先级
NODE_UPGRADE_PRIORITY = {
  // 前线节点（离敌国近的）> 中心节点 > 后方节点
  // 已经 level 高的节点优先升满（边际收益高）
  // 有传奇造船潜力的节点（T8概率高）优先
};
```

---

## 八、自适应/记忆系统

### 8.1 玩家战术记忆

```javascript
// AI 记录玩家每局的行为特征
playerProfile = {
  preferredUnits: ["artillery", "cavalry"],  // 玩家爱用什么兵种
  attackPattern: "BLITZ" | "SLOW_PUSH" | "NAVAL",  // 玩家攻击风格
  weakDefense: ["eastern_front"],          // 玩家哪里防守薄弱
};

// 根据记忆调整策略
if (playerProfile.prefers("cavalry")) {
  buildMore("infantry");  // 多造步兵克制骑兵
}
if (playerProfile.pattern === "NAVAL") {
  buildMore("navy");      // 多造海军反制
}
```

### 8.2 战况复盘

每 3 个月（游戏内）做一次复盘：

```javascript
review() {
  let result = {
    territoriesGained: 3,
    territoriesLost: 1,
    divisionsLost: 25,
    enemyDivisionsKilled: 18,
    tradeEfficiency: 0.85,
  };
  
  // 损失惨重 → 换将（提高防守系数）
  if (result.divisionsLost / result.enemyDivisionsKilled > 2.0) {
    personality.aggression *= 0.8;
    personality.fortify *= 1.2;
  }
  // 进展顺利 → 保持进攻
  if (result.territoriesGained > 5 && result.territoriesLost === 0) {
    personality.aggression *= 1.1;
  }
}
```

---

## 九、实现路线图

### 第一阶段：快速见效（1-2天）
- ✅ 修复 AI 海军自动开火（已完成）
- 改进工厂/城市升级优先级排序
- 改进兵种配比（根据地情调整）
- 添加陆军撤退逻辑（< 25% HP 撤退）
- AI 维持预备队（不把所有兵派上前线）

### 第二阶段：战术层面（3-5天）
- 实现战术群编组系统
- 实现炮兵后撤和步兵协防
- 改进进攻路径选择（不直接走直线）
- 添加防御兵力集中逻辑
- 海军舰队集中和任务分配

### 第三阶段：战略层面（5-7天）
- 战略目标系统
- 战场划分和兵力分配
- 作战计划生成
- 外交评估和主动拉拢
- 议和判断

### 第四阶段：高级功能（7-10天）
- 两栖登陆作战
- 战线管理和前线推进
- 玩家战术记忆和自适应
- 战况复盘和策略调整
- 跨 AI 盟友协同

---

## 十、预期效果

完成上述改进后，AI 将具备以下能力：

1. **像个真正的指挥官**：会集中兵力、会撤退、会包围、会支援
2. **经济管理有方**：优先发展核心省份、维持战略储备、不把国库花光
3. **外交活起来了**：会主动拉盟友、会在有利时机宣战、会在劣势时求和
4. **海军有威胁**：会造舰、会组舰队、会两栖登陆（最终阶段）
5. **会"记仇"**：玩家如果反复用同一种战术，AI 会学会反制
6. **同盟协调**：德国打法国时奥匈不会在东线发呆

最终让玩家每一局都有不同的体验，感觉是在和一个有思考能力的对手打仗，而不是在打木头人。
