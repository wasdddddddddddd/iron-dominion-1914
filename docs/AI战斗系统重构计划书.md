# AI 战斗系统完全重构计划书

> 当前问题：单位各自为战、亚琛堆积、中立城无人踩、攻防无常、火炮步兵分开送死、前线概念混乱。

---

## 一、核心架构：集团军制（Army Group System）

### 1.1 基本概念
**集团军（Army Group）是整个 AI 的唯一行动单元。** 单个单位不再独立决策。

```
国家
 └─ 集团军（4-8个，视国家规模而定）
      ├─ 成员：步兵 + 骑兵 + 火炮 + 工兵（混合编组）
      ├─ 编制：每个集团军 3-15 个单位
      ├─ 任务：ATTACK / DEFEND / GARRISON / RESERVE / NEUTRAL
      └─ 行动：集团军作为整体行动，步兵和火炮永不分离
```

### 1.2 集团军类型
| 类型 | 任务 | 兵力占比 | 行动模式 |
|------|------|----------|----------|
| **OFFENSIVE** | 主动进攻敌国 | 40-60% | 选定一个敌国战区，以集团军为单位突破 |
| **DEFENSIVE** | 防守前线/边境 | 20-30% | 部署在前线城市，被动应敌 |
| **GARRISON** | 和平邻国边境 | 5-10% | 与未开战邻国接壤的边境城市 |
| **RESERVE** | 后方预备队 | 10-15% | 首都附近集结，前线危急时支援 |
| **NEUTRAL** | 占领中立城市 | 2-5% | 1-2个单位组，半径内自动冲占 |

---

## 二、前线城市系统（Frontline City Detection）

### 2.1 判定规则
一个城市是"前线城市"，满足以下任一条件：

```
① 该城市 3° 半径内有敌国城市
② 该城市 3° 半径内有敌国领土（PROVINCE_DATA 的 country ≠ 自己）
③ 该城市 2.5° 半径内有敌方军事单位
④ 和平时期：与任何接壤国家（邻国领土 < 2°）的城市
```

### 2.2 前线城市的用途
- **和平时期**：所有 GARRISON 集团军驻守在前线城市
- **战争时期**：DEFENSIVE 集团军优先部署在最受威胁的前线城市
- **生产导向**：前线城市权重 5×（后方 1×），新兵主要产出在前线
- **优先加固**：前线城市优先升级防御/工厂

### 2.3 受攻击城市支援
当己方前线城市 HP 下降或附近有敌军：
- 后方 RESERVE 集团军立即向该城移动支援
- 相邻的 DEFENSIVE 集团军可临时移动支援
- 支援距离：被攻城市 8° 内的所有集团军

---

## 三、任务系统（Task System）

### 3.1 每个士兵面板显示内容
```
单位名称：德第3步兵师
所属：西线第2集团军（OFFENSIVE）
任务：进攻比利时 → 布鲁塞尔（围攻中，已24天）
当前位置：列日城下 (lon:5.6, lat:50.6)
兵力：87/100 HP
状态：idle（等待集团军火炮就位）
```

### 3.2 集团军任务
每个集团军有且仅有一个任务：

| 任务 | 目标 | 触发条件 |
|------|------|----------|
| `AG_ATTACK_CITY` | 攻占指定城市 | 集团军为 OFFENSIVE 类型，选最近敌方前线城市 |
| `AG_DEFEND_LINE` | 防守指定前线城市群 | 集团军为 DEFENSIVE 类型 |
| `AG_GARRISON_BORDER` | 驻守和平邻国边境 | 集团军为 GARRISON 类型 |
| `AG_RESERVE_STANDBY` | 首都附近待命 | 集团军为 RESERVE 类型 |
| `AG_CAPTURE_NEUTRAL` | 占领中立城市 | 集团军为 NEUTRAL 类型 |
| `AG_REINFORCE` | 支援被攻城市 | 单位城市HP < 70% 且附近有敌方单位 |

---

## 四、中立城市占领系统

### 4.1 自动占领半径
每个中立城市周围有 `NEUTRAL_CAPTURE_RADIUS = 1.0°` 半径。
- 一旦己方**任何**军事单位进入这个半径，**立即**触发占领行动。
- **不依赖集团军指派**，任何路过单位都会自动冲占。
- 对已经 en-route 去攻击敌国城市的集团军：如果经过中立城市半径内 → 分出最小单位（1个步兵）去占，主力继续前进。

### 4.2 中立城市优先级
```
距离己方控制区 3.5° 内的中立城市 → 自动指派最近空闲单位
如果前方 5° 内无敌军 → 优先占领
如果占领途中遇到敌军 → 放弃，退回
```

---

## 五、进攻逻辑（Offensive Group）

### 5.1 目标选择（国家→战区→城市三层）
```
第一层：国家选择
  - 历史宿敌优先（德国→法国/俄国，法国→德国）
  - 已开战国中，与己方接壤的优先
  - 不选已投降/已灭国

第二层：战区分配
  - 每个 OFFENSIVE 集团军分配到一个战区（WESTERN/EASTERN/ITALIAN…）
  - 按战区兵力需求比例分配集团军数量

第三层：城市选择（集团军独立判断）
  - 选战区中距离最近 + 守军最少的敌国城市
  - 弱城检测：守军 < 集团军兵力 × 0.5 → 判定为"薄弱" → 立即总攻（跳过集结阶段）
  - 硬城：守军 > 集团军兵力 → 等待其他集团军支援或绕行
```

### 5.2 攻城流程（简化版）
```
PHASE 1: APPROACH（接近）
  - 集团军所有单位向目标城市移动
  - 移动过程中步兵和火炮保持在同一位置（火炮不单独行动）
  - 移动速度：跟随最慢的火炮

PHASE 2: ASSAULT（攻城）
  - 所有单位到达射程内后统一攻城
  - 火炮在 85% 射程处远程轰击
  - 步兵推进到城下围攻
  - 骑兵绕侧翼搜索残血敌军

PHASE 3: RETREAT / REDIRECT
  - 30 天无进展 → 放弃此城，选下一个目标
  - 收到 REINFORCE 请求（友方城市被攻）→ 中断攻城，转向支援
```

---

## 六、防御逻辑（Defensive Group）

### 6.1 部署策略
```
DEFENSIVE 集团军部署规则：
  ① 前线城市按威胁度排序（敌军密度×距离×城市价值）
  ② 集团军部署在威胁最高的前线城市
  ③ 一个集团军可覆盖 5° 半径内的多个边境城市
  ④ 集团军内部队不分散：部署到同一个城市/区域
```

### 6.2 战时调动
```
宣战后：
  GARRISON 集团军（和平邻国边境）→ 抽调 50% 兵力编入 OFFENSIVE/DEFENSIVE
  后方 RESERVE 集团军 → 保持 10° 内有被攻城市时自动出动
```

---

## 七、兵种协同规则

| 兵种 | 行动限制 | 协同要求 |
|------|----------|----------|
| **步兵** | 必须在集团军内，不单独行动 | 与火炮同步移动 |
| **火炮** | 必须在集团军内，不单独行动 | 跟随步兵组，保持在85%射程外 |
| **骑兵** | 可在集团军周围 2° 内独立侦察/收割 | 不单独攻城，不单独远离集团军 |
| **工兵** | 集团军内，攻城时优先维修 | 随主力行动 |
| **山地** | 集团军内，优先分配到山地战区 | 标准步兵规则 |

**绝对禁止：**
- ❌ 火炮单独推进（没有步兵保护的火炮是靶子）
- ❌ 步兵分散逐个送死（排队送死）
- ❌ 不同集团军的单位混合（保持指挥链）

---

## 八、生产配比

```
总体比例（战后）：
  步兵 55% | 火炮 15% | 骑兵 10% | 工兵 3% | 山地 2%（非山地国0%）

生产逻辑：
  - 每 20 tick 检查一次各兵种比例
  - 最缺的兵种优先生产
  - 生产城市：前线城市权重 5×，后方 1×
  - 不再有"某城市产兵过多堆积"问题：新兵自动分配到最近的集团军
```

---

## 九、实施路径（分5个文件）

### 文件1：`js/ai/ai_army_group.js`（新建，集团军系统核心）
- ArmyGroup 类：id, type, country, units[], task, target, theater
- createArmyGroups(country)：创建/重组集团军
- assignGroupTask(group, country)：分配任务
- updateGroupMovement(group)：移动集团军所有单位
- 集团军面板数据提供函数

### 文件2：`js/ai/ai_frontline.js`（新建，前线城市系统）
- isFrontlineCity(city, country)：判断是否前线
- getFrontlineCities(country)：获取前线城市列表（排序）
- getThreatenedCities(country)：获取受威胁城市
- getNeutralInRange(country)：获取可占领中立城市
- neutralAutoCapture(country)：自动占领逻辑

### 文件3：`js/ai/ai_controller.js`（重写，主控制器）
- updateAI()：简化为集团军系统的调度入口
- aiProduction → 保持但调整比例
- aiDiplomacy → 保持
- aiEconomy → 保持

### 文件4：`js/ai/ai_attack.js`（新建，进攻逻辑）
- offensiveGroupBehavior(group)：进攻集团军行为
- selectTargetCity(group)：选择目标城市
- assaultCity(group, city)：攻城行为
- weakCityCheck(city, group)：弱城检测

### 文件5：`js/ai/ai_defense.js`（新建，防御逻辑）
- defensiveGroupBehavior(group)：防御集团军行为
- deployDefensiveGroup(group)：部署防御集团军
- reinforceThreatenedCity(city, country)：支援被攻城市
- garrisonPeaceBorder(country)：和平时期边境驻军

### 文件6：`js/ai/ai_task_display.js`（新建，士兵面板任务显示）
- getUnitTaskDisplay(unit)：返回单位任务字符串
- getGroupTaskDisplay(group)：返回集团军任务字符串
- 提供给 game_ui.js 在单位面板中渲染

### 文件7：`js/ai/ai_strategy.js`（修改，战略层保持）
- 国家战略目标（BLITZ/DEFENSIVE等）
- 战区计划
- 不涉及具体单位操作

### 文件8：`js/ai/ai_tactics.js`（废弃，合并到 group 系统）
- 原撤退系统 → 合并到 ai_defense.js
- 原编组系统 → 被 ArmyGroup 替代
- 原目标优先级 → 被 selectTargetCity 替代

---

## 十、与现有系统的兼容

| 现有系统 | 处理方式 |
|----------|----------|
| `updateAI()` | 重写入口，只调用新系统的函数 |
| `aiAttackMovement()` | 废弃，被集团军进攻系统替代 |
| `aiSiegeBehavior()` | 废弃，被集团军攻城替代 |
| `aiDefenseDeployment()` | 废弃，被防御集团军替代 |
| `aiFormArmyGroups()` | 重写为 createArmyGroups |
| `aiDefensiveLine()` | 废弃，被前线系统替代 |
| `getDynamicFrontlineCities()` | 移到 ai_frontline.js 并改进 |
| `isNeutralCity()` | 移到 ai_frontline.js |
| `aiEmergencyDefense()` | 改为 reserveGroup.reinforce() |
| `aiReinforceFrontline()` | 改为 defensiveGroup.reinforce() |
| `aiReleaseDefensiveForOffense()` | 不再需要，集团军类型即决定角色 |
| `ai_production()` | 保持但调整兵种比例 |
| `aiEconomy()`, `aiDiplomacy()` | 保持不变 |
| `processRetreats()` | 合并到 ai_defense.js |
| `updateTacticalGroups()` | 被 ArmyGroup 替代 |

---

## 十一、信心评估

### 为什么这次能做对

**1. 根本原因已看清**
过去 16 轮的 "修bug" 像打地鼠：压下一个，冒出三个。根本原因是——单个单位独立决策、攻防混在一套代码里、任务状态散落四面八方。集团军制让"谁负责什么"一目了然。

**2. 架构先行**
之前是"出了问题加补丁"，现在是"先定架构再写代码"。集团军的五个角色（进攻/防御/驻守/预备/占领）覆盖了所有场景，不会再有功能交叉导致的互相冲突。

**3. 可验证性**
- 中性城市半径自动占——开游戏看地图就知道做没做对
- 士兵面板显示任务——点单位看面板就验证
- 亚琛是否堆兵——打开游戏看亚琛周围的单位标志

**4. 军队协同**
"步兵和火炮不分开"是硬规则，不是模糊的"偏好"。代码里直接：`group.moveAll()` 全体一起走。不会有炮单跑送死。

### 风险

- 新系统需要改动 7 个文件，量大
- 旧系统功能（生产/经济/外交）不能受影响
- 需要充分的模拟验证和实际游戏测试

---

## 十二、执行计划

| 阶段 | 内容 | 验证方式 |
|------|------|----------|
| **第一阶段** | 创建 `ai_army_group.js` + `ai_frontline.js`，建立集团军和前线城市数据结构 | 模拟器打印集团军列表 |
| **第二阶段** | 重写 `ai_controller.js` 主入口，集团军系统接管调度 | 模拟器运行 200 帧无崩溃 |
| **第三阶段** | 创建 `ai_attack.js` + `ai_defense.js`，进攻和防御行为 | 模拟器验证攻城/守城行为 |
| **第四阶段** | 添加中立城市自动占领 + 士兵面板任务显示 | 真实游戏验证UI |
| **第五阶段** | 废弃旧冗余函数，整体调试 | 完整模拟+游戏测试 |

---

**结论：有充分信心。架构彻底清理后，16 轮的补丁债务一笔勾销。**
