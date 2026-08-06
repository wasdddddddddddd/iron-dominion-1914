# AI 战斗方案（仅战斗相关）

## 一、现状分析

经过对 `ai_controller.js`、`ai_tactics.js`、`ai_strategy.js`、`game_core.js`（fireUnits）的全面分析，当前 AI 战斗存在以下核心问题：

**1. 每轮重新选目标** — `aiAttackMovement` 每 tick 对所有非移动单位重新选目标，不记住上一轮打的敌人，导致 AI 单位像"失忆"一样反复切换目标。

**2. 无兵种角色分工** — 步兵、炮兵、骑兵、工兵的行为完全一样，都是"找到最近的敌人走过去"。炮兵不利用远程优势站位，骑兵不利用速度包抄，工兵不做任何事（fireUnits 里直接 `continue` 跳过工兵）。

**3. 没有兵力集中** — 每个单位各自找目标，不形成集团冲锋。虽然有战术编组（`updateTacticalGroups`），但编组后的 units 从未被用于集中指挥——每个单位依然独立行动。

**4. 攻城没有阶段性** — 直接冲城市，不管城市旁边有没有守军。应该是"先清野→再围城→最后总攻"。

**5. 没有撤退协作** — 单体撤退（`processRetreats`）存在，但撤退后不会重新集结再战，残血单位各自逃命。

**6. 没有目标优先级** — `getPriorityTarget` 函数存在但从未被实际调用。`fireUnits` 中的自动射击只找距离最近的敌人，不区分炮兵、残血、工兵。

**7. 没有防线管理** — 单位分散在整条战线上，敌人突破一点时没有预备队去堵缺口。

**8. 生产与战斗脱节** — `aiProduction` 按固定比例出兵，不根据当前战场损失动态调整（比如炮兵损失大就多造炮兵）。

---

## 二、总体方案架构

```
AI战斗系统（三层架构）
├── 战略层（ai_strategy.js） — 决定哪条战线是主攻/佯攻/防守
├── 战术层（ai_tactics.js） — 目标锁定、兵力集中、攻城阶段、撤退协作
└── 执行层（ai_controller.js + game_core.js） — 移动、开火、生产
```

**核心原则：**
- 每个 AI 单位必须有"持久目标"（记住在打谁，不每帧重选）
- 兵种必须分工：步兵抗线、炮兵输出、骑兵包抄、工兵修建筑
- 兵力必须集中：3个以上单位一起行动，不单独送死
- 攻城必须分阶段：清野→围城→总攻
- 生产必须响应战场：根据损失动态调整兵种比例

---

## 三、具体方案（共12项）

### 方案A：持久目标锁定系统（最高优先级）

**问题**：当前每个单位每 tick 重新选目标，导致目标来回切换，永远打不死一个敌人。

**做法**：给每个 AI 单位添加 `_aiTarget` 属性，锁定一个目标后持续攻击直到目标死亡或超出范围。

```
每个AI单位新增属性：
  _aiTarget: null,           // 当前锁定的目标ID
  _aiTargetType: 'unit',     // 'unit' | 'city' | 'factory'
  _aiTargetTimeout: 0,       // 锁定超时计数（天），超过4天自动解锁
  _aiTargetAge: 0,           // 锁定已持续天数

锁定规则：
  1. 无目标时 → 扫描周围敌人，选最高优先级目标锁定
  2. 有目标时 → 检查目标是否存活 && 是否仍在交战范围内（距离<射程*3）
  3. 目标死亡/超出范围/超时4天 → 解锁，重新选目标
  4. 锁定期间 → 一直朝目标移动（到射程内停止），持续开火

关键代码位置：ai_controller.js 的 aiAttackMovement 函数
```

### 方案B：多层目标优先级系统（最高优先级）

**问题**：现在只打最近的敌人，不区分炮兵/残血/工兵。

**做法**：为每个 AI 单位计算目标优先级分数，选分数最高的锁定。

```
目标优先级评分公式（每帧对范围内敌人计算）：

score = 100
  - dist * 8                    // 距离越近分越高（基础分）
  + (e.type === 'artillery') * 30   // 炮兵威胁大，优先打
  + (e.type === 'engineer') * 20    // 工兵会修建筑
  + (e.type === 'cavalry') * 5      // 骑兵威胁一般
  + isLowHp(e) * 25                // 残血优先收割
  + isFriendlyCityUnderAttack(e) * 15  // 正在攻击己方城市的敌人
  - (e.type === 'infantry') * 10   // 步兵优先级最低（肉盾）

特殊规则：
  - 炮兵(artillery) 优先打敌方炮兵（反炮击），其次打城市
  - 骑兵(cavalry) 优先打残血和炮兵，不打城市
  - 步兵(infantry) 优先打最近的敌人，进城

关键代码位置：ai_tactics.js 的 getPriorityTarget 函数
```

### 方案C：兵种角色分工（高优先级）

**问题**：所有兵种行为一样，步兵不抗线、炮兵不远程、骑兵不包抄、工兵没事做。

**做法**：为每个兵种定义独立的行为模式。

```
步兵(infantry) — 主力战斗兵
  - 职责：推进战线、占领城市、抗线
  - 目标优先级：最近敌人 > 城市 > 工厂
  - 移动目标：到敌方城市射程内停下，或追击敌人到射程内
  - 特殊：处于己方城市附近时获得防御加成（不主动出击太远）

炮兵(artillery) — 远程火力支援
  - 职责：远程炮击敌城市/工厂/集群，不参与近战
  - 目标优先级：城市 > 工厂 > 敌方炮兵 > 敌方步兵集群
  - 移动目标：保持在射程内攻击，不进入敌方步兵射程
  - 距敌距离：保持 0.5~0.6 度（约 55~65km），远大于步兵射程 0.2
  - 山地加成：在山地时射程+20%，主动优先占据山地位置
  - 受威胁时后撤：当有敌方单位进入 0.3 度以内时，自动后撤到安全距离

骑兵(cavalry) — 机动包抄
  - 职责：侧翼包抄、追击残血、骚扰后方
  - 目标优先级：残血单位 > 炮兵 > 工兵 > 无防御城市
  - 移动目标：绕到敌人侧面/后方攻击，不正面硬冲
  - 攻城：只攻击低血量城市（hp<30%），不硬啃满血城
  - 速度利用：利用高移速，打完就跑（hit & run）

工兵(engineer) — 工程支援
  - 职责：修复己方城市/工厂，不参与进攻
  - 行为：扫描周围己方受损建筑，移动到最近的需要修复的建筑
  - 修复范围：0.15 度
  - 修复速度：每 tick 恢复 5% 建筑血量
  - 自保：当有敌人进入 0.2 度范围时撤退到安全城市
  - 注意：fireUnits 中当前跳过工兵（continue），需要改为修复逻辑

山地师(mountain) — 山地特战
  - 职责：山地作战、突破防线
  - 目标优先级：山地上的敌人 > 城市 > 平原敌人
  - 移动：优先走山地地形（利用山地移动优势）
  - 攻城：在山地附近的城市获得攻击加成

空军(airplane) — 空中打击
  - 职责：快速突袭、打残血、侦察
  - 目标优先级：残血单位 > 炮兵 > 城市
  - 移动：高机动性，跨越地形限制
  - 自保：低血量（<30%）时返回己方城市上空
```

### 方案D：兵力集中与集团冲锋（高优先级）

**问题**：单位各自为战，不形成集团，容易被逐个击破。

**做法**：利用现有的 `_tacticalGroups`，让同一编组的单位一起行动。

```
编组规则：
  1. 同一编组的单位锁定同一个目标（编组 leader 选目标，全组跟随）
  2. 编组 leader 选编组中心最近的最高优先级目标
  3. 全组朝目标方向移动，保持编组队形（松散，不强求整齐）
  4. 编组内至少3个单位才发起进攻，少于3个则等待集结

集结逻辑：
  - 当编组内单位分散（最大间距>0.5度）时，先在编组中心集结
  - 集结完成后（所有单位间距<0.2度），一起向目标推进
  - 推进速度以最慢的单位为准（不让炮兵掉队）

冲锋触发条件：
  - 编组兵力 ≥ 目标守军 * 1.5 时发起冲锋
  - 编组兵力 < 目标守军时，等待其他编组汇合
  - 紧急情况（己方城市被攻击）：不等待，直接救援

关键代码位置：ai_tactics.js 的 updateTacticalGroups 函数
```

### 方案E：三阶段攻城策略（高优先级）

**问题**：AI 直接冲城市，不管周围有没有守军，导致攻城部队被夹击。

**做法**：攻城分为三个阶段，依次执行。

```
阶段1 — 清野（CLEAR）：
  条件：目标城市周围 0.3 度内有敌方单位数量 > 3
  行动：先消灭城市周围的所有敌方单位（不直接打城）
  目标：让城市孤立无援
  编组命令：锁定周围最高优先级敌人

阶段2 — 围城（SIEGE）：
  条件：城市周围已清理，城市血量 > 30%
  行动：炮兵在射程内炮击城市，步兵在城外包围（不进城）
  目标：消耗城市血量到 30% 以下
  编组命令：炮兵锁定城市，步兵在外围警戒

阶段3 — 总攻（ASSAULT）：
  条件：城市血量 ≤ 30%
  行动：所有单位冲入城市占领
  目标：占领城市
  编组命令：全体向城市中心移动

特殊处理：
  - 如果城市血量极低（<10%）且守军少（<2），跳过阶段1和2，直接总攻
  - 如果攻城过程中有敌方援军到来，退回阶段1
  - 阶段切换由编组 leader 判断，每 5 tick 评估一次

关键代码位置：ai_controller.js 的 aiAttackMovement 函数
```

### 方案F：防线与预备队体系（中优先级）

**问题**：AI 没有防线概念，敌人突破一点后没有预备队堵截。

**做法**：动态划分前线，保留 15%~20% 兵力作为预备队。

```
防线定义：
  - 以己方城市为锚点，将己方所有与敌国接壤的省份定义为"前线省份"
  - 前线省份上的己方单位构成"前线部队"
  - 前线部队的职责：阻止敌人进入己方领土

预备队管理：
  - 保留 15%~20% 的总兵力作为预备队（距离前线 > 1 度的己方城市待命）
  - 预备队职责：当敌人突破防线（进入己方领土 > 0.5 度）时，调预备队堵截
  - 预备队补充：当预备队 < 总兵力 10% 时，从后方城市抽调 idle 单位补充

防线崩溃处理：
  - 当某条战线上己方单位数量 < 敌方单位数量 * 0.5 时，判定为"防线危机"
  - 防线危机时：从其他战线抽调 30% 兵力支援，或从预备队调兵
  - 如果首都受到威胁：所有可用兵力回防首都

关键代码位置：ai_controller.js 的 aiDefenseResponse 函数
```

### 方案G：撤退与重组系统（中优先级）

**问题**：现有撤退系统（`processRetreats`）让残血单位各自逃命，但逃走后不会重新集结再战。

**做法**：改进撤退系统，增加"撤退 → 回血 → 重组 → 再战"的完整流程。

```
撤退触发条件：
  - 血量 < 25% 时触发撤退（保存现有）
  - 血量 < 35% 且周围 0.2 度内有 3 个以上敌方单位时触发撤退（新增）
  - 被包围时（周围 0.3 度内都是敌人）立即撤退

撤退目标：
  - 最近的己方安全城市（周围 1 度内无敌人）
  - 如果所有城市都不安全，往后方撤退到最近的己方城市

重组流程：
  1. 撤退到城市后，在城市周围待命（state = 'idle'）
  2. 每 tick 恢复 2% 血量（利用城市补给）
  3. 血量恢复到 70% 以上后，重新加入最近的编组
  4. 如果恢复过程中城市被攻击，立即加入防守

关键代码位置：ai_tactics.js 的 processRetreats 函数
```

### 方案H：动态生产与战斗联动（中优先级）

**问题**：`aiProduction` 按固定比例出兵，不根据战场损失调整。

**做法**：根据最近 30 天各兵种损失比例，动态调整生产比例。

```
损失统计：
  - 维护一个全局数组记录最近 30 天内各兵种的损失数量
  - 每 tick 检查：如果某兵种损失比例 > 该兵种占总兵力比例，提高该兵种生产优先级

动态调整公式：
  baseRatio = 默认比例（infantry 0.35, artillery 0.25, cavalry 0.15, engineer 0.10, mountain 0.10, airplane 0.05）
  lossRatio = 某兵种最近30天损失数 / 总损失数
  adjustRatio = lossRatio - baseRatio
  newRatio = baseRatio + adjustRatio * 0.5   // 半量调整，避免剧烈波动

生产紧急响应：
  - 当己方单位总数 < 敌方单位总数 * 0.6 时，进入"紧急征兵"模式
  - 紧急征兵：生产队列翻倍（rounds = 4），优先造最便宜的步兵
  - 当己方首都被攻击时，暂停所有工厂建造，全力造兵

关键代码位置：ai_controller.js 的 aiProduction 函数
```

### 方案I：地形利用（中优先级）

**问题**：AI 无视地形，不在山地设防、不在河流后布阵。

**做法**：让 AI 优先占据有利地形。

```
战前选位：
  - 防守时：优先移动到山地/丘陵地形（防御加成）
  - 进攻时：绕过山地，从平原方向进攻
  - 炮兵：优先占据山地位置（射程+20%）

移动路径偏好：
  - 陆军寻路时，在 route cost 中增加地形权重
  - 山地：cost 降低（对于山地师），或升高（对其他兵种）
  - 平原：所有兵种 cost 降低

防守位置：
  - 在己方城市和敌人之间的山地/河流后布置防线
  - 防线单位间距 0.1~0.15 度，形成连续防线
  - 炮兵在防线后方 0.2~0.3 度处布置

关键代码位置：ai_pathfinding.js 的 cellCost 函数
```

### 方案J：反包围与突围（低优先级）

**问题**：AI 单位被包围后不会尝试突围，只会原地等死。

**做法**：检测被包围状态，触发突围或投降。

```
被包围检测：
  - 单位周围 0.3 度内，敌方单位 > 己方单位 * 3
  - 且所有方向都被敌人封锁（无法通过寻路到达己方领土）

突围行为：
  - 兵力充足（己方 > 敌方 * 0.5）：向兵力最薄弱的方向突围
  - 兵力不足：向最近的己方城市方向突围（牺牲部分单位掩护主力）

被围城市救援：
  - 当己方城市被包围（周围 0.3 度内 > 5 个敌方单位，无己方单位）
  - 从最近的前线抽调 50% 兵力救援
  - 如果无兵可调，首都城市不惜一切代价救援

关键代码位置：ai_tactics.js（新增函数）
```

### 方案K：海军战术改进（低优先级）

**问题**：海军 AI 只会找最近的敌舰单挑，不会形成舰队、不会封锁港口。

**做法**：舰队集中、区域控制、港口封锁。

```
舰队集中：
  - 所有己方舰船在最高级海军节点集结成舰队
  - 舰队目标：找到敌方舰队决战
  - 分舰队：当己方舰船 > 10 艘时，分成 2 个分舰队

区域控制：
  - 北海 / 地中海 / 波罗的海 各指派一个分舰队控制
  - 控制方式：在该海域巡逻，拦截进入的敌方舰船

港口封锁：
  - 当 AI 有海军优势（己方舰船 > 敌方 * 2）时
  - 派 3~5 艘舰船封锁敌方主要海军节点（堵在节点门口）
  - 封锁效果：阻止敌方从该节点出海

潜艇战术（德国专属）：
  - 潜艇不参与舰队决战
  - 在敌方主要港口附近游猎（埋伏）
  - 攻击路过的敌方运输船/军舰

关键代码位置：ai_controller.js 的 aiNavyStrategy 函数
```

### 方案L：战场态势评估（低优先级）

**问题**：AI 不知道当前战斗是优势还是劣势，不会根据态势调整策略。

**做法**：每 10 tick 评估一次战场态势，调整作战模式。

```
态势评估指标：
  - 战线推进速度：最近 10 天占领的敌方城市数量
  - 交换比：最近 10 天己方损失 / 敌方损失（越低越好）
  - 战线稳定性：最近 10 天己方城市被占领数量

作战模式切换：
  - 进攻模式（交换比 < 0.8 且 推进速度 > 0）：保持进攻
  - 相持模式（交换比 0.8~1.2 或 推进速度 ≈ 0）：稳扎稳打
  - 防守模式（交换比 > 1.2 或 推进速度 < 0）：收缩防线，等待援军
  - 溃败模式（推进速度 < -1 城市/10天）：全线后撤，保存实力

模式切换影响：
  - 进攻模式：生产比例偏重炮兵和骑兵，编组主动寻找敌人
  - 防守模式：生产比例偏重步兵和工兵，编组在防线后待命
  - 溃败模式：所有单位向首都方向撤退，放弃外围城市

关键代码位置：ai_strategy.js 的 reevaluateStrategy 函数
```

---

## 四、各兵种最终行为对照表

| 兵种 | 主要职责 | 目标优先级 | 理想距离 | 特殊行为 |
|------|---------|-----------|---------|---------|
| 步兵 | 抗线、攻城 | 敌人 > 城市 > 工厂 | 射程内 (~0.2) | 进城占领、守城 |
| 炮兵 | 远程火力 | 城市 > 工厂 > 敌方炮兵 | 0.5~0.6 | 山地+20%射程、遇敌后撤 |
| 骑兵 | 包抄追击 | 残血 > 炮兵 > 工兵 | 0.12~0.2 | 绕侧翼、hit&run、不打城 |
| 工兵 | 修复建筑 | 受损建筑 > 撤退 | 贴近建筑 | 不攻击、遇敌撤退 |
| 山地师 | 山地作战 | 山地敌人 > 城市 | 0.16~0.2 | 优先走山地、山地攻城加成 |
| 空军 | 快速打击 | 残血 > 炮兵 > 城市 | 0.45 | 高机动、低血回撤 |
| 海军 | 舰队决战 | 敌舰 > 港口 > 海岸城市 | 0.8 | 舰队集中、区域控制 |
| 潜艇 | 游猎封锁 | 商船 > 落单军舰 | 0.9 | 埋伏、不参与舰队战 |

---

## 五、实现优先级与建议

### 第一阶段（立刻做，核心战斗体验）
1. **方案A：持久目标锁定** — 解决 AI 不会打架的核心问题
2. **方案B：目标优先级** — 让 AI 知道该打谁
3. **方案C：兵种分工** — 让不同兵种做不同的事（特别是炮兵远程、工兵修复）

### 第二阶段（提升战斗力）
4. **方案D：兵力集中** — 让 AI 抱团进攻
5. **方案E：三阶段攻城** — 让 AI 会攻城
6. **方案F：防线与预备队** — 让 AI 会防守

### 第三阶段（精细化）
7. **方案G：撤退重组** — 残血回收再战
8. **方案H：动态生产** — 生产响应战场
9. **方案I：地形利用** — 地利优势

### 第四阶段（锦上添花）
10. **方案J：反包围**
11. **方案K：海军战术**
12. **方案L：态势评估**

---

## 六、关键代码修改位置清单

| 文件 | 函数 | 修改内容 |
|------|------|---------|
| `ai_controller.js` | `aiAttackMovement` | 重写：持久目标锁定 + 兵种分工 + 三阶段攻城 |
| `ai_controller.js` | `aiProduction` | 修改：动态生产调整 + 紧急征兵 |
| `ai_controller.js` | `aiDefenseResponse` | 修改：防线管理 + 预备队调度 |
| `ai_controller.js` | `aiNavyStrategy` | 重写：舰队集中 + 区域控制 + 港口封锁 |
| `ai_tactics.js` | `getPriorityTarget` | 重写：多层目标优先级评分 |
| `ai_tactics.js` | `processRetreats` | 修改：撤退→重组→再战流程 |
| `ai_tactics.js` | `updateTacticalGroups` | 修改：编组集中行动 + 编组 leader 机制 |
| `ai_tactics.js` | (新增) `evaluateBattlefield` | 新增：战场态势评估 |
| `ai_tactics.js` | (新增) `handleSiege` | 新增：三阶段攻城逻辑 |
| `ai_tactics.js` | (新增) `handleEngineer` | 新增：工兵修复逻辑 |
| `ai_strategy.js` | `reevaluateStrategy` | 修改：作战模式切换 |
| `game_core.js` | `fireUnits` | 修改：工兵修复逻辑（替代 continue） |
| `game_core.js` | `fireUnits` | 修改：AI 自动射击使用优先级目标 |
| `ai_controller.js` | `updateAI` | 修改：主循环中集成集团军编成、战略评估、防御部署 |
| `ai_controller.js` | (新增) `aiFormArmyGroups` | 新增：AI自动编成集团军（调用commanderSystem） |
| `ai_controller.js` | (新增) `evaluateStrategicSituation` | 新增：多维度战略态势评估 |
| `ai_controller.js` | (新增) `aiDefenseDeployment` | 新增：防御优先级部署 |
| `ai_controller.js` | (新增) `aiEmergencyDefense` | 新增：首都紧急防御 |
| `ai_controller.js` | (新增) `aiReinforceFrontline` | 新增：战线增援调度 |
| `ai_controller.js` | `aiAttackMovement` | 重写：集成集团军目标、兵种分工、三阶段攻城 |
| `ai_tactics.js` | (新增) `calculateThreatLevel` | 新增：威胁等级计算函数 |
| `ai_tactics.js` | (新增) `calculateCapitalRisk` | 新增：首都风险计算函数 |
| `ai_tactics.js` | (新增) `getGroupTargetCity` | 新增：集团军级目标选择 |
| `ai_strategy.js` | `reevaluateStrategy` | 修改：集成态势评估，动态切换策略 |

---

## 七、新增方案（M~R：集团军、战略评估、防御优先级、战术决策）

---

### 方案M：集团军编成与指挥系统（最高优先级）

**问题**：当前 AI 完全不使用 `commanderSystem.js` 的集团军系统，所有单位各自为战，无法享受指挥官加成（攻击+25%、血量+25%、移速+15%、后勤+40%），战斗力白白损失。

**做法**：让 AI 自动编成集团军，并充分利用指挥官加成。

#### M1：AI自动编成集团军

```
AI 集团军编成规则（每30 tick执行一次）：

1. 扫描条件：
   - 只能编成陆军（海军不编入集团军）
   - 每个国家最多6个集团军（系统硬上限）
   - 每个集团军至少3个师

2. 编成优先级：
   - 第一优先：补充现有集团军缺口
     - 遍历所有已有集团军，检查缺员（指挥官上限 - 当前人数）
     - 从 idle 单位中按距离最近优先补入

   - 第二优先：新建集团军
     - 检查可用的指挥官池（cmdPools + chiefPools 中未被占用的）
     - 按指挥官星级排序，优先用高星指挥官
     - 至少3个师才创建，最多不超过指挥官上限
     - 编成时将距离最近的 idle 单位聚在一起

   - 第三优先：合并小集团军
     - 当某个集团军人数 < 3 且有其他集团军缺员时
     - 将该集团军解散，成员并入其他集团军

3. 指挥官选择策略：
   - 进攻型国家（德国、俄国）：优先选 atk 高的指挥官（如马肯森 atk+20%、布鲁西洛夫 atk+25%）
   - 防御型国家（法国、奥匈）：优先选 hp 高的指挥官（如贝当 hp+25%、博罗耶维奇 hp+20%）
   - 后勤优先（英国）：优先选 logi 高的指挥官（如基钦纳 logi+40%、普卢默 logi+40%）
```

**伪代码**：
```javascript
function aiFormArmyGroups(country) {
    let cs = G.commanderState;
    if (!cs || !G.date) return;
    let tick = G.tick || 0;
    if (tick % 30 !== 0) return; // 每30 tick执行一次

    // 获取己方所有存活陆军单位
    let myDivs = G.divisions.filter(d => 
        d.country === country && d.strength > 0 && 
        d.type !== 'navy' && d.type !== 'submarine'
    );

    // 1. 已有集团军补充
    for (let g of cs.groups) {
        if (g.country !== country) continue;
        let cmdr = commanderDataOf(country, g.commanderId);
        if (!cmdr) continue;
        let need = cmdr.cap - g.divisionIds.length;
        if (need <= 0) continue;

        // 找距离集团军中心最近的 idle 单位
        let center = getGroupCenter(g);
        let candidates = myDivs.filter(d => 
            !d.armyGroupId && d.state !== 'retreating' &&
            Math.hypot(d.rx - center.lon, d.ry - center.lat) < 3.0
        ).sort((a, b) => 
            Math.hypot(a.rx - center.lon, a.ry - center.lat) - 
            Math.hypot(b.rx - center.lon, b.ry - center.lat)
        );
        let take = Math.min(need, candidates.length);
        for (let i = 0; i < take; i++) {
            addDivisionToGroup(candidates[i].id, g.id);
        }
    }

    // 2. 新建集团军
    let availableCmds = getAvailableCommanders(country);
    // 按星级降序排列
    availableCmds.sort((a, b) => (b.data.stars || 0) - (a.data.stars || 0));

    let unassigned = myDivs.filter(d => !d.armyGroupId && d.state !== 'retreating');
    for (let cmd of availableCmds) {
        let cap = cmd.data.cap;
        // 在未分配单位中找距离最近的cap个，如果距离跨度太大则放弃
        let sorted = unassigned.sort((a, b) => 
            Math.hypot(a.rx - unassigned[0].rx, a.ry - unassigned[0].ry) -
            Math.hypot(b.rx - unassigned[0].rx, b.ry - unassigned[0].ry)
        );
        let take = Math.min(cap, sorted.length);
        if (take < 3) break; // 不够3个师就不编成

        // 取前take个，但检查它们是否集中（最大间距<2.0）
        let maxDist = 0;
        for (let i = 0; i < take; i++) {
            for (let j = i + 1; j < take; j++) {
                let d = Math.hypot(sorted[i].rx - sorted[j].rx, sorted[i].ry - sorted[j].ry);
                if (d > maxDist) maxDist = d;
            }
        }
        if (maxDist > 2.0) continue; // 太分散了，不编成

        let divIds = sorted.slice(0, take).map(d => d.id);
        let result = createArmyGroup(country, cmd.data.id, divIds);
        if (result.ok) {
            // 从unassigned中移除已编入的
            unassigned = unassigned.filter(d => !divIds.includes(d.id));
            addGameLog(COUNTRY_CN[country] + "编成了集团军：" + result.group.name + 
                "（指挥官" + cmd.data.name + "，统率" + take + "个师）");
        }
    }
}

function getGroupCenter(group) {
    let members = getGroupMembers(group);
    let sx = 0, sy = 0, cnt = 0;
    for (let m of members) {
        if (m && m.rx !== undefined) { sx += m.rx; sy += m.ry; cnt++; }
    }
    return cnt > 0 ? { lon: sx / cnt, lat: sy / cnt } : { lon: 0, lat: 0 };
}
```

#### M2：集团军战斗目标分配

**问题**：集团军编成后，各单位仍然各自选目标，集团军没有统一的攻击方向。

**做法**：集团军级别的目标由指挥官决定，下属单位跟随。

```
集团军目标选择（每10 tick刷新一次）：
1. 集团军 leader = 指挥官（集团军对象本身）
2. 集团军目标类型：
   - 进攻目标：最近的敌方城市（优先）
   - 防御目标：最近的己方被攻击城市
   - 拦截目标：正在攻击己方城市的敌人集群
3. 全集团军统一目标，所有成员朝目标方向移动
4. 目标切换条件：
   - 当前目标已被占领/摧毁
   - 出现更紧急的目标（己方首都被攻击）
   - 集团军接到的战略任务变更
```

#### M3：指挥官加成在战斗中的运用

**问题**：`getDivisionBonuses` 函数已经存在，但 AI 单位在战斗计算中从未使用这些加成。

**做法**：在 `fireUnits` 中应用指挥官加成。

```
加成应用方式：
1. 攻击加成（atk）：直接加到伤害计算中，`damage *= (1 + b.atk)`
2. 血量加成（hp）：单位创建时 apply，`maxStrength *= (1 + b.hp)`
3. 移速加成（spd）：单位移动速度 `speed *= (1 + b.spd)`
4. 后勤加成（logi）：单位补给消耗 `supplyCost *= (1 - b.logi)`

集团军加成效果对照：
  五星指挥官（马肯森）：攻击+20% 血量+5% 移速+15% 后勤+40%
  相当于全集团军战斗力提升约 30%~50%
```

---

### 方案N：战略态势评估系统（最高优先级）

**问题**：AI 不知道敌人有多少兵、打到自己家门口没有、丢失了多少城市，只知道"开战了，去打仗"。

**做法**：建立多维度态势评估系统，让 AI 真正"看懂"战场局势。

#### N1：战场态势数据结构

```
每个AI国家维护态势对象：
_aiSituation[country] = {
    // 基础指标
    myDivCount: 0,          // 己方单位总数
    enemyDivCount: 0,       // 敌方单位总数
    myCities: 0,            // 当前控制城市数
    originalCities: 0,      // 原始城市总数
    capitalThreat: 0,       // 首都威胁度（0~100）
    frontlineStability: 0,  // 前线稳定度（-100~100）

    // 衍生指标
    totalLossRatio: 0,      // 总城市丢失比例（0~1）
    forceRatio: 1.0,        // 敌我兵力比（<1 = 劣势）
    capitalEnemyDist: 999,  // 敌人距首都最近距离
    capitalEnemyCount: 0,   // 首都附近敌人数量

    // 推荐策略
    recommendedStrategy: 'BALANCE',
    emergencyLevel: 0,      // 紧急等级（0=正常, 1=紧张, 2=危急, 3=崩溃）
}
```

#### N2：首都威胁评估

```
首都威胁评估（每10 tick执行）：

1. 获取首都位置
2. 扫描所有敌方单位，计算到首都的距离
3. 计算首都威胁维度：
   a. 最近敌人距离：dist < 3.0 → 极高风险，dist < 6.0 → 高风险，dist < 10 → 中风险
   b. 首都方向敌人密度：首都周围5度内的敌方单位数量
   c. 首都方向敌人进攻势头：最近10天首都方向敌人数量变化趋势

4. 威胁等级公式：
   threat = 0
   // 距离权重
   if (dist < 1.0) threat += 100      // 兵临城下！
   else if (dist < 2.0) threat += 80  // 近在咫尺
   else if (dist < 3.0) threat += 60
   else if (dist < 5.0) threat += 40
   else if (dist < 8.0) threat += 20
   else if (dist < 12.0) threat += 10

   // 数量权重
   threat += nearby_enemies * 5
   threat = Math.min(100, threat)

5. 紧急等级判定：
   threat > 80 → 等级3（崩溃级）：所有军队回防首都
   threat > 60 → 等级2（危急级）：优先保护首都，召回前线部队
   threat > 40 → 等级1（紧张级）：加强首都防御，从后方调兵
   else → 等级0（正常级）：按正常策略行动
```

#### N3：城市丢失评估

```
城市丢失评估（每10 tick执行）：

1. 统计：originalCities = 该国创建时拥有的城市总数
            myCities = 当前控制的城市数
            lostCities = originalCities - myCities

2. 丢失比例：lossRatio = lostCities / originalCities

3. 丢失影响判定：
   lossRatio > 0.6 → 国家濒临灭亡！全面防御，所有资源用于防守
   lossRatio > 0.4 → 严重损失，转入战略防御
   lossRatio > 0.2 → 显著损失，加强防御投入
   lossRatio > 0.1 → 轻微损失，正常应对

4. 失陷城市重要性加权：
   - 首都被占 → 紧急等级直接拉到3
   - 大城市被占 → 按大城市数量加权
   - 农业城市被占 → 影响粮食供给
```

#### N4：敌我力量对比

```
力量对比评估（每10 tick执行）：

1. 己方总兵力：myDivs = 所有己方陆军单位数量
2. 敌方总兵力：enemyDivs = 所有敌方陆军单位数量之和
3. 各战线兵力对比：
   - 西线：德国vs英法比
   - 东线：德国/奥匈vs俄国
   - 巴尔干：奥匈/保加利亚vs塞尔维亚/罗马尼亚
   - 意大利：意大利vs奥匈

4. 力量对比公式：
   forceRatio = myDivs / Math.max(1, enemyDivs)
   forceRatio > 1.5 → 优势（可进攻）
   forceRatio 0.8~1.5 → 均势（谨慎推进）
   forceRatio 0.5~0.8 → 劣势（加强防御）
   forceRatio < 0.5 → 严重劣势（全线收缩）

5. 战线稳定性 = 各战线己方兵力 - 敌方兵力 的加权和
   正值表示战线稳定，负值表示战线吃紧
```

#### N5：动态策略切换

```
基于态势评估的策略切换（每10 tick）：

function evaluateStrategicSituation(country) {
    let sit = analyzeSituation(country); // 获取N1~N4的综合评估
    
    // 写入全局状态，供其他AI函数使用
    G._aiSituation = G._aiSituation || {};
    G._aiSituation[country] = sit;
    
    // 策略切换逻辑
    let newStrategy = null;
    
    // 紧急等级3：国家存亡危机
    if (sit.emergencyLevel >= 3) {
        newStrategy = 'EMERGENCY_DEFENSE'; // 紧急防御
    }
    // 紧急等级2：首都危急
    else if (sit.emergencyLevel >= 2) {
        newStrategy = 'CAPITAL_DEFENSE';   // 首都防御
    }
    // 城市损失过半
    else if (sit.totalLossRatio > 0.5) {
        newStrategy = 'LAST_STAND';        // 最后的抵抗
    }
    // 城市损失严重
    else if (sit.totalLossRatio > 0.3) {
        newStrategy = 'STRATEGIC_DEFENSE'; // 战略防御
    }
    // 兵力严重劣势
    else if (sit.forceRatio < 0.6) {
        newStrategy = 'ELASTIC_DEFENSE';   // 弹性防御
    }
    // 兵力优势且战线稳定
    else if (sit.forceRatio > 1.5 && sit.frontlineStability > 0) {
        newStrategy = 'ALL_OUT_OFFENSIVE'; // 全面进攻
    }
    // 兵力轻微优势
    else if (sit.forceRatio > 1.2) {
        newStrategy = 'FOCUSED_OFFENSIVE'; // 重点进攻
    }
    // 均势
    else {
        newStrategy = 'BALANCED';           // 均衡
    }
    
    // 更新策略
    let strat = getStrategy(country);
    if (strat) {
        strat.goal = mapNewStrategyToGoal(newStrategy);
        strat.emergency = sit.emergencyLevel;
        strat.alloc = getEmergencyAllocation(newStrategy, sit);
    }
    
    return sit;
}
```

**策略与行为的映射表**：

| 策略 | 触发条件 | 生产 | 进攻 | 防御 | 预备队 |
|------|---------|------|------|------|--------|
| EMERGENCY_DEFENSE | 首都1度内有敌人 | 只造步兵+炮兵 | 停止进攻 | 全部回防首都 | 0% |
| CAPITAL_DEFENSE | 首都3度内有敌人 | 75%步兵+25%炮兵 | 只防御 | 50%兵力守首都 | 5% |
| LAST_STAND | 丢失60%城市 | 全力造最便宜的兵 | 放弃进攻 | 守住最后城市 | 0% |
| STRATEGIC_DEFENSE | 丢失30%城市 | 60%步兵+20%炮兵+20%工兵 | 局部反击 | 3/4兵力防守 | 20% |
| ELASTIC_DEFENSE | 兵力<敌方60% | 50%步兵+30%炮兵+20%工兵 | 只在优势时打 | 弹性防御可放弃部分城市 | 25% |
| ALL_OUT_OFFENSIVE | 兵力>敌方1.5倍 | 30%步兵+35%炮兵+20%骑兵+15%工兵 | 全线推进 | 最低限度防守 | 10% |
| FOCUSED_OFFENSIVE | 兵力>敌方1.2倍 | 35%步兵+30%炮兵+15%骑兵+15%工兵+5%山地 | 主攻一路 | 其他战线防御 | 15% |
| BALANCED | 均势 | 40%步兵+25%炮兵+15%骑兵+10%工兵+10%山地 | 谨慎推进 | 稳固防守 | 20% |

---

### 方案O：防御优先级系统（高优先级）

**问题**：AI 防御时平均分配兵力，不会重点保护首都、大城市等关键目标。

**做法**：建立基于城市重要性和威胁程度的防御优先级系统。

#### O1：城市防御优先级评分

```
城市防御优先级公式（每10 tick对所有己方城市计算）：

priority = 0

// 1. 城市类型基础分（权重最高）
if (city.isCapital) priority += 1000    // 首都：绝对最高
else if (isMajorCity(city.id)) priority += 300  // 大城市
else if (city.cityType === 'agri') priority += 150  // 农业城市
else priority += 50                     // 普通小城

// 2. 城市工厂数加分
priority += (city.factories || 0) * 40

// 3. 威胁程度加分（附近敌人越多越需要保护）
let nearbyEnemies = countEnemiesNear(city, 1.5)
priority += nearbyEnemies * 30

// 4. 前线城市加分
if (isFrontlineCity(city)) priority += 60

// 5. 当前守军减分（已有充足守军的降低优先级）
let defenders = countDefendersNear(city, 0.5)
priority -= defenders * 25

// 6. 城市血量减分（残血城市更需要保护）
let hpRatio = city.hp / city.maxHp
if (hpRatio < 0.3) priority += 80      // 残血城市急需保护
else if (hpRatio < 0.5) priority += 40

// 7. 首都特殊加成
if (city.isCapital) {
    let capitalEnemies = countEnemiesNear(city, 3.0)
    priority += capitalEnemies * 50     // 首都附近每个敌人权重极高
    // 如果首都附近敌人超过一定数量，直接拉满
    if (capitalEnemies > 5) priority = 9999
}

return Math.max(0, priority)
```

#### O2：防御力量分配

```
防御力量分配（每20 tick执行）：

1. 获取所有己方城市，按防御优先级降序排序
2. 获取所有可用于防御的集团军和 idle 单位
3. 按优先级分配：

   for each city in sortedCities:
       needed = calculateNeededGarrison(city)
       current = getCurrentDefenders(city)
       shortage = needed - current
       if (shortage <= 0) continue

       // 从高优先级城市的低级单位中抽调？不，从最低优先级城市抽调
       // 从预备队中调派
       let units = findAvailableReserves(country, 2.0)
       let assigned = 0
       for each unit in units:
           if (assigned >= shortage) break
           orderDefend(unit, city)
           assigned++
       
       // 预备队不够，从最低优先级城市抽调
       if (assigned < shortage) {
           let lowestCities = getLowestPriorityCities(country, 3)
           for each lc in lowestCities:
               let defenders = getDefendersOf(lc)
               for each def in defenders:
                   if (assigned >= shortage) break
                   if (Math.hypot(def.rx - city.lon, def.ry - city.lat) < 5.0) {
                       orderDefend(def, city)
                       assigned++
                   }
           }
       }

4. 守军数量计算：
   - 首都：至少5个师
   - 大城市：至少3个师
   - 农业城市：至少2个师
   - 普通城市：至少1个师
```

#### O3：紧急防御模式

```
紧急防御模式触发条件（每5 tick检查）：

if (首都威脅度 > 60) {
    1. 标记所有距离首都 < 2.0 的己方单位：目标设为"首都防御"
    2. 标记所有距离首都 < 5.0 的己方单位：目标设为"向首都靠拢"
    3. 标记所有距离首都 > 5.0 的己方单位：评估是否可抽调
       - 如果该单位所在战线稳定（己方兵力 > 敌方兵力 * 1.5）
       - 则抽调50%回防首都
       - 否则留在原地，保持防线
    4. 生产队列：全部改为步兵（最便宜，最快）
    5. 所有正在建造的工厂暂停（如果有暂停机制）
}

if (首都威脅度 > 80) {
    1. 所有单位（包括正在进攻的）目标重设为"回防首都"
    2. 放弃所有进攻行动
    3. 所有正在建造的军事单位加速完成（如果可能）
}

if (首都已被占领) {
    1. 选择一个新的"临时首都"（当前最大的己方城市）
    2. 所有军队向临时首都集结
    3. 进入"复国模式"：集中所有力量试图夺回首都
}
```

---

### 方案P：战术决策系统（高优先级）

**问题**：AI 不知道何时该打、何时该撤、何时该集中兵力，只会无脑冲。

**做法**：建立基于态势感知的战术决策系统。

#### P1：交战决策

```
交战决策（每5 tick，对每个集团军/战术编组）：

function shouldEngage(group, enemyForce) {
    let myForce = getGroupTotalStrength(group)
    let ratio = myForce / Math.max(1, enemyForce)
    let sit = G._aiSituation?.[group.country]
    
    // 紧急防御模式下，不打，只回防
    if (sit?.emergencyLevel >= 2) return false
    
    // 兵力碾压：直接打
    if (ratio > 2.0) return true
    
    // 优势：打，但要评估损失
    if (ratio > 1.5) {
        // 如果敌人是残血，打
        if (isEnemyLowHp(enemyForce)) return true
        // 如果己方有炮兵支援，打
        if (hasArtillerySupport(group)) return true
        // 否则谨慎
        return Math.random() < 0.7
    }
    
    // 均势：评估战场环境
    if (ratio > 0.8) {
        // 防守方优势，打
        if (isDefending(group)) return true
        // 有地形优势，打
        if (hasTerrainAdvantage(group)) return true
        // 否则不主动打
        return Math.random() < 0.3
    }
    
    // 劣势：不打，撤退或等待增援
    if (ratio > 0.5) {
        // 如果是防守己方城市，必须打
        if (isDefendingFriendlyCity(group)) return true
        // 否则撤退
        return false
    }
    
    // 严重劣势：绝对不打
    return false
}
```

#### P2：撤退决策

```
战术撤退决策（每5 tick评估）：

1. 集团军级撤退条件（满足任一即可）：
   a. 集团军总兵力 < 初始兵力 * 0.3
   b. 集团军遭遇敌方兵力 > 己方 * 3
   c. 集团军被包围（周围都是敌人）
   d. 接到紧急防御命令（首都危急）

2. 撤退目标选择：
   - 优先撤向最近的己方安全城市
   - 如果首都危急，撤向首都方向
   - 撤退路线避开敌人密集区域

3. 撤退后的重组：
   - 到达安全城市后，自动进入 idle 状态
   - 等待其他撤退单位汇合
   - 兵力恢复到 50% 以上后重新编成
   - 集团军不解散，保持编制

4. 断尾求生：
   - 如果集团军被包围无法全体撤退
   - 牺牲最少血的1~2个师断后，掩护主力突围
   - 断后单位自动进入"自杀式防守"状态
```

#### P3：兵力集中决策

```
兵力集中决策（每15 tick评估）：

1. 集中条件：
   - 己方兵力 > 敌方 * 1.2（优势时集中打歼灭战）
   - 己方兵力 < 敌方 * 0.5（劣势时集中防守关键点）
   - 有重要目标需要攻占（如敌方首都、大城市）

2. 集中方式：
   - 相邻集团军向主攻方向靠拢
   - 集团军间距 < 1.0 度时视为"已集中"
   - 集中后形成"拳头"，选择最优目标攻击

3. 分散条件：
   - 战线过长需要多点防守
   - 多个城市同时被攻击
   - 追击溃败的敌人时

4. 集中 vs 分散判断：
   let totalEnemies = 0
   let totalFriendly = 0
   let enemyClusters = clusterEnemyUnits(country)
   
   if (enemyClusters.length <= 2) {
       // 敌人集中在少数几个点 → 集中兵力
       strategy = 'CONCENTRATE'
   } else if (enemyClusters.length >= 4) {
       // 敌人分散在多处 → 分散防守
       strategy = 'DISPERSED'
   } else {
       // 中间情况：主攻方向集中，其他方向分散
       strategy = 'HYBRID'
   }
```

---

### 方案Q：集团军战术运用（中优先级）

**问题**：集团军编成后，不知道怎么用——不知道哪个集团军该进攻、哪个该防守。

**做法**：为每个集团军分配战术任务，让集团军各司其职。

#### Q1：集团军任务分配

```
集团军任务分配（每20 tick执行）：

function assignArmyGroupTasks(country) {
    let cs = G.commanderState
    if (!cs) return
    let groups = cs.groups.filter(g => g.country === country)
    if (groups.length === 0) return
    
    let sit = G._aiSituation?.[country]
    let enemies = getEnemiesOf(country)
    
    // 获取所有作战方向
    let fronts = identifyFronts(country, enemies)
    
    // 按集团军数量和前线数量分配任务
    let offensiveGroups = []
    let defensiveGroups = []
    
    if (sit?.emergencyLevel >= 2) {
        // 紧急情况：所有集团军改为防御
        for (let g of groups) {
            setGroupTask(g, 'DEFEND_CAPITAL')
        }
        return
    }
    
    // 正常情况下分配
    for (let i = 0; i < groups.length; i++) {
        let g = groups[i]
        let cmdr = commanderDataOf(country, g.commanderId)
        
        if (i < Math.ceil(groups.length * 0.5) && sit?.forceRatio > 1.0) {
            // 前50%的集团军（高星级指挥官）负责进攻
            setGroupTask(g, 'OFFENSIVE')
            // 选择进攻方向：离敌人最近的敌方大城市
            let target = findBestOffensiveTarget(g, country)
            g._aiTaskTarget = target
            offensiveGroups.push(g)
        } else {
            // 后50%的集团军负责防守
            let defenseTarget = findMostThreatenedCity(g, country)
            setGroupTask(g, 'DEFENSIVE')
            g._aiTaskTarget = defenseTarget
            defensiveGroups.push(g)
        }
    }
}

function setGroupTask(group, task) {
    group._aiTask = task
    // 根据任务类型影响集团军内所有单位的行为
    let members = getGroupMembers(group)
    for (let d of members) {
        d._aiRole = task // 供 aiAttackMovement 使用
    }
}
```

#### Q2：集团军协同作战

```
集团军协同规则：

1. 进攻协同：
   - 主攻集团军攻击目标城市时
   - 相邻的辅助集团军自动向主攻方向移动
   - 辅助集团军不直接攻城，但在外围拦截援军

2. 防御协同：
   - 当某个集团军防守的城市被攻击时
   - 相邻防御集团军自动派1/3兵力支援
   - 支援部队到达后归防守集团军指挥

3. 包围协同：
   - 当主攻集团军从正面攻击时
   - 骑兵集团军/快速集团军从侧翼迂回
   - 迂回路线：绕到目标城市后方，切断退路

4. 战役级指挥：
   - 总司令（总指挥官）的光环影响所有集团军
   - 例如兴登堡的hp+8%光环覆盖全国
   - 鲁登道夫的atk+8%光环提升全队攻击力
```

#### Q3：集团军预备队

```
集团军级预备队：

1. 每个集团军内部保留 10%~20% 兵力作为预备队
2. 预备队位置：集团军中心后方 0.5 度
3. 预备队用途：
   - 填补战线缺口
   - 支援被攻击的友军
   - 追击溃败的敌人
4. 当集团军总兵力 < 初始 50% 时，自动转入防御并等待补充

国家层面预备队（与方案F衔接）：
1. 国家层面保留 15%~20% 兵力作为战略预备队
2. 战略预备队不编入集团军，单独管理
3. 战略预备队用途：
   - 应对紧急情况（首都危急、防线崩溃）
   - 补充损失严重的集团军
   - 发起战略性反击
```

---

### 方案R：综合AI战斗流程（整合方案）

**问题**：以上 M~Q 方案如何整合到现有 AI 框架中？需要清晰的执行时序。

**做法**：重新设计 `updateAI` 的执行流程，按优先级分阶段执行。

#### R1：AI主循环执行时序

```
updateAI() 的执行流程（每个 tick）：

1. 经济运营（aiEconomy）
   - 建造工厂、升级城市
   - 不受战略态势影响

2. 生产军队（aiProduction）
   - 读取当前战略态势（G._aiSituation[country]）
   - 根据策略调整生产比例
   - 紧急模式下全力造步兵

3. 战略态势评估（每10 tick）
   - evaluateStrategicSituation(country)
   - 计算首都威胁、城市损失、兵力对比
   - 更新策略和目标

4. 集团军管理（每30 tick）
   - aiFormArmyGroups(country)
   - 编成新集团军、补充现有集团军
   - 分配集团军任务

5. 防御部署（每20 tick）
   - aiDefenseDeployment(country)
   - 按防御优先级分配守军
   - 紧急防御模式

6. 撤退处理（每 tick）
   - processRetreats(country)
   - 低血量单位撤退

7. 战术编组更新（每 tick）
   - updateTacticalGroups(country)
   - 编组未编入集团军的零散单位

8. 攻击移动（每 tick）—— 核心战斗逻辑
   - aiAttackMovement(allCountries)
   - 集成：集团军目标、兵种分工、三阶段攻城

9. 外交策略（每 tick）
   - aiDiplomacy(co, cd, pers)
   - 宣战、结盟、保障

10. 求和（每 tick）
    - aiPeaceSeeking(allCountries)
    - 根据战况和态势决定是否求和
```

#### R2：新增全局数据

```
G._aiSituation = {}  // 每个国家的态势评估结果
  -> 格式: { capitalThreat, totalLossRatio, forceRatio, 
             emergencyLevel, recommendedStrategy, ... }

G._aiGroupTasks = {}  // 每个集团军的任务分配
  -> 格式: { groupId: 'OFFENSIVE' | 'DEFENSIVE' | 'RESERVE' }

G._aiDefenseOrders = {}  // 每个城市的防御部署
  -> 格式: { cityId: [unitId1, unitId2, ...] }
```

#### R3：关键修改点总结

```
修改文件清单：

1. ai_controller.js：
   - updateAI(): 重写主循环，集成M~R所有方案
   - 新增 aiFormArmyGroups(): 集团军编成
   - 新增 evaluateStrategicSituation(): 战略态势评估
   - 新增 aiDefenseDeployment(): 防御部署
   - 新增 aiEmergencyDefense(): 紧急防御
   - 新增 aiReinforceFrontline(): 战线增援
   - 修改 aiAttackMovement(): 集成集团军目标
   - 修改 aiProduction(): 根据态势调整生产

2. ai_tactics.js：
   - 新增 calculateThreatLevel(): 威胁等级计算
   - 新增 calculateCapitalRisk(): 首都风险
   - 新增 shouldEngage(): 交战决策
   - 新增 shouldRetreat(): 撤退决策
   - 新增 getGroupTargetCity(): 集团军目标选择
   - 新增 clusterEnemyUnits(): 敌方单位聚类
   - 修改 getPriorityTarget(): 集成态势感知

3. ai_strategy.js：
   - 修改 reevaluateStrategy(): 集成态势评估结果
   - 新增 mapNewStrategyToGoal(): 新策略到旧策略映射

4. game_core.js：
   - 修改 fireUnits(): 应用指挥官加成
   - 修改单位伤害计算: 使用 getDivisionBonuses()

5. commanderSystem.js：
   - 无需修改，AI直接调用现有API
```

---

### 八、新架构流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI 决策系统（完整架构）                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  第1层：战略层（每10 tick）                                        │
│  ┌─────────────────────────────────────────────────────┐        │
│  │ evaluateStrategicSituation()                        │        │
│  │  ├─ 首都威胁评估 (calculateCapitalRisk)              │        │
│  │  ├─ 城市丢失评估 (getCityLossRatio)                   │        │
│  │  ├─ 敌我力量对比 (forceRatio)                         │        │
│  │  ├─ 战线稳定性 (frontlineStability)                   │        │
│  │  └─ 输出: 策略切换 + 紧急等级                          │        │
│  └─────────────────────────────────────────────────────┘        │
│                              ↓                                  │
│  第2层：组织层（每20~30 tick）                                    │
│  ┌─────────────────────────────────────────────────────┐        │
│  │ aiFormArmyGroups() + aiDefenseDeployment()           │        │
│  │  ├─ 编成集团军 + 指派指挥官                           │        │
│  │  ├─ 分配集团军任务 (进攻/防御/预备队)                   │        │
│  │  ├─ 按防御优先级分配守军                              │        │
│  │  └─ 紧急防御模式                                     │        │
│  └─────────────────────────────────────────────────────┘        │
│                              ↓                                  │
│  第3层：战术层（每5~10 tick）                                     │
│  ┌─────────────────────────────────────────────────────┐        │
│  │ Tactical Decision Making                             │        │
│  │  ├─ shouldEngage(): 打不打？                          │        │
│  │  ├─ 目标选择: 集团军目标 + 兵种专用目标                 │        │
│  │  ├─ 三阶段攻城: 清野→围城→总攻                        │        │
│  │  └─ 撤退决策: 何时撤、撤到哪                          │        │
│  └─────────────────────────────────────────────────────┘        │
│                              ↓                                  │
│  第4层：执行层（每 tick）                                        │
│  ┌─────────────────────────────────────────────────────┐        │
│  │ aiAttackMovement() + fireUnits()                     │        │
│  │  ├─ 移动: 向目标前进 / 撤退 / 包抄                     │        │
│  │  ├─ 开火: 使用指挥官加成 + 优先级目标                   │        │
│  │  └─ 生产: 根据态势动态调整兵种比例                     │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 九、实现优先级（更新版）

```
第一阶段（立刻做，核心战斗体验）—— 约2~3天
  1. 方案M：集团军编成 → AI自动编成集团军，利用指挥官加成
  2. 方案N：战略态势评估 → AI看懂战场局势
  3. 方案O：防御优先级 → AI保护关键城市

第二阶段（提升战斗力）—— 约2天
  4. 方案P：战术决策 → 知道什么时候打、什么时候撤
  5. 方案A：持久目标锁定 → 解决"失忆"问题
  6. 方案B：目标优先级 → 知道该打谁

第三阶段（精细化战斗）—— 约2天
  7. 方案C：兵种分工 → 步兵/炮兵/骑兵/工兵各司其职
  8. 方案Q：集团军战术运用 → 集团军协同作战
  9. 方案D：兵力集中 → 集团冲锋

第四阶段（完善）—— 约2天
  10. 方案E：三阶段攻城
  11. 方案F：防线与预备队
  12. 方案G：撤退重组
  13. 方案H：动态生产
```

---

### 十、AI像真人一样博弈的关键设计要点

**1. 战争迷雾下的决策**（模拟真人信息不完全）
- AI 不知道敌人全部兵力，只能通过"侦察"获取前线信息
- 前线3度内的敌人可见，后方的敌人估算
- 敌方兵力估算 = 前线可见 + 国家总兵力推测

**2. 心理博弈要素**
- 当AI兵力劣势时，故意示弱诱敌深入（弹性防御）
- 当AI兵力优势时，主攻一路佯攻另一路
- 捏软柿子：优先攻击兵力最薄弱的敌人

**3. 历史性格差异**
- 德国：喜欢速攻决战、不轻易撤退、宁愿战至最后一人
- 法国：谨慎推进、擅长防守、重视要塞
- 英国：重视海军、喜欢打代理人战争
- 俄国：人海战术、不怕损失、但后勤差
- 奥匈：多线作战、依赖德国支援
- 意大利：进攻欲望低、防御为主

**4. 学习与适应**（模拟真人经验）
- 记录最近10次战斗的交换比
- 如果某兵种对某兵种交换比不利（如骑兵对机枪），减少该兵种的使用
- 如果某条进攻路线总失败，换一条路线

**5. 危机感**
- 丢失第1个城市：正常反应
- 丢失第3个城市：开始焦虑，加强防御
- 丢失第5个城市：惊慌，全面收缩
- 首都附近出现敌人：恐慌，不惜一切代价回防
- 首都失守：绝望，转入游击战/流亡政府