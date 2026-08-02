# 铁与权柄：1914 — 项目状态总结

## 项目背景
纯前端 HTML5 Canvas 一战策略游戏，玩家可选 8 国（8 列强）之一。23 个国家，实时战术作战，涵盖经济、外交、海军、AI、联机对战等完整系统。

## 文件结构
```
index.html                  # 入口 + 国家选择覆盖层 + 错误捕获
js/config.js                # 全局配置（颜色、缩放、列强、附属国）
js/data_provinces.js        # 省份多边形数据（PROVINCES 数组）
js/data_province_name_cn.js # 省份中文名映射
js/data_cities.js           # 城市坐标+首都/港口标记
js/data_country_index.js    # 国家→省份索引（COUNTRY_PROVINCES）
js/data_factories.js        # 工厂分布（CITY_FACTORIES）
js/data_events.js           # 历史事件（奥匈宣战、意大利选阵营）
js/data_rivers.js           # 河流线数据
js/data_sea_zones.js        # 海域多边形数据
js/data_maps.js             # 旧国家级地图数据（Natural Earth 110m）
js/data_maps_real.js        # 自动生成版（COUNTRY_DATA）
js/game_state.js            # G 对象核心定义、UNIT_TYPES（含submarine）、人口、省份/城市初始化、declareWar/guaranteeIndependence
js/game_core.js             # 核心逻辑（游戏循环、战斗、移动、寻路、AI、外交、投降、事件、输入处理、isSeaType()、潜艇下潜/上浮过渡、炮弹追踪/鱼雷、中立城市、AI建造队列生产）
js/game_ui.js               # 渲染引擎（坐标变换、绘制调度、海洋/省份/河流/城市/工厂/单位、占领国旗绘制、潜艇墓碑）
js/game_panels.js           # UI面板（单位绘制、范围圈、集火线、侧栏、四标签页、海军面板、外交面板、城市面板、潜艇下潜按钮、海豚emoji）
js/game_init.js             # 选国家界面（7国选1）
js/tactical.js              # 定时战斗循环（setInterval 500ms）
js/roundrect_polyfill.js    # Canvas roundRect polyfill
js/ai/                      # AI 模块
    ai_controller.js        # AI 主控制器（生产、经济、外交、防御、攻击移动、求和）
    ai_pathfinding.js       # AI 寻路与路径分配
    ai_strategy.js          # AI 战略层（目标选择、战区规划、经济优先级）
js/navy/                    # 海军模块
    navyNode.js             # 海军节点系统（初始化、升级、T1-T8 品级随机、舰船建造）
    shipData.js             # 各国舰船预设名单
    shipGrades.js           # T1-T8 舰船等级定义 + 传奇舰船专属属性
    shipNaming.js           # 舰船命名逻辑
    shipProductionUI.js     # 海军管理面板UI（节点卡片、建造按钮、指南弹窗、滚动）
server/                     # 联机服务器
    server.js               # WebSocket 中继服务器（房间管理、AI席位、消息转发、静态文件服务）
js/multiplayer.js           # 联机客户端（WebSocket连接、房间大厅、状态同步、操作转发）
flags/                      # 8 张 PNG 旗帜图片
project_summary.md          # 本文件
AI_IMPROVEMENT_PLAN.md      # AI 全面改善方案
```

## 可选国家（8 个）
| 国家 | 国库 | 初始师团 | 描述 |
|------|------|---------|------|
| 德意志帝国 | 500 | 6 | 强大的中央帝国，两线作战的挑战 |
| 法兰西共和国 | 400 | 5 | 复仇与保卫祖国，抵御德国入侵 |
| 大不列颠 | 600 | 4 | 日不落帝国，制海权与全球利益 |
| 奥匈帝国 | 300 | 4 | 多民族帝国，在巴尔干与东线苦战 |
| 意大利王国 | 250 | 3 | 新生强国，伺机而动选择阵营 |
| 俄罗斯帝国 | 350 | 5 | 压路机般的人力优势，虽落后但庞大 |
| 奥斯曼帝国 | 200 | 3 | 病夫之躯，控制海峡与中东 |
| 西班牙王国 | 300 | 3 | 从辉煌中苏醒，维护殖民帝国尊严 |

## G 对象核心字段
```js
G.date              // 游戏内日期
G.speed             // 速度档位 (0-6)
G.paused            // 暂停
G.playerCountry     // 玩家所选国家
G.tick              // 帧计数器
G.countries{}       // 国家数据（国库、稳定度、收入、支出、人口、师团数）
G.divisions[]       // 所有师团（含 navy/submarine 类型 + 舰船属性 + submerged/diving/diveProgress 字段）
G.projectiles[]     // 炮弹
G.factories[]       // 工厂实体
G.cities{}          // 城市（有 HP/owner/fireCooldown/maxFireCd/provinceId/originalOwner/occupierFlag）
G.divIdCounter      // 单位 ID 自增
G.selectedProvince  // 当前选中省份对象
G.selectedDivisions[] // 当前选中单位 ID 列表
G.selBox            // 框选矩形
G.provinceOwners{}  // { provinceId: country }
G.provinceData{}    // 省份运行时数据
G.atWar{}           // 战争状态
G.warScore{}        // 战争分数
G.relations{}       // 好感度
G.alliances{}       // 同盟 { countryA: { countryB: true } }
G.militaryAccess{}  // 军事通行权
G.nonAggression{}   // 互不侵犯条约
G.guarantees{}      // 独立保障
G.patrolTargets{}   // 巡逻目标
G.newsBanner        // 横幅文字
G.newsTimer         // 横幅倒计时
G.newsQueue[]       // 横幅消息队列
G.armyGroups{}      // 编队
G.activeEvent       // 当前事件弹窗
G.buildQueue[]      // 建造队列
G.navyBuildQueue[]  // 海军建造队列（玩家专用）
G.focusFireLines[]  // 集火线
G.moveLines[]       // 行军指示线
G.frontlines{}      // 前线部署映射
G.frontlineDrawing  // 前线绘制模式
G.frontTargets[]    // 前线进攻目标
G.surrendered{}     // 投降标记
G.factions{}        // 阵营
G.warAnnouncements{} // 宣战公告记录
G.germanyDeclaredWar // 德国是否已触发自动宣战
G.activeTab         // 底部标签页
G.selectedCity      // 当前选中城市
G.selectedNavyNode  // 当前选中的海军节点 ID
G.ships[]           // 所有舰船对象
G.navyNodes{}       // 海军节点
G.shipIdCounter     // 舰船 ID 自增器
G.shipNameCounters{} // 舰船命名计数器
G.diplomacyFocus    // 外交面板聚焦的国家
G.gameOver          // 游戏结束标志
G.gravestones[]     // 阵亡墓碑动画
G._aiStrategy{}     // AI 战略状态
G.multiplayerMode   // 联机模式: 'host' | 'client' | null
G.multiplayerSeats[] // 联机席位列表 [{ id, name, country, isAI }]
G.multiplayerHumanCountries[] // 人类玩家控制的国家列表
```

## 兵种配置
| 兵种 | 花费 | 射程(°) | 射速(天) | 伤害 | 速度(°/天) | 最大HP | 弹速 | Sym | 消耗人口(千) |
|------|------|---------|---------|------|-----------|--------|------|-----|------------|
| 步兵 | 50 | 0.204 (×1.7) | 1 | 14 | 0.0432 | 100 | 1.4 | 🪖 | 15 |
| 工兵 | 70 | 0.1428 (×1.7) | 1.25 | 8.4 | 0.0389 | 110 | 1.12 | 🛠️ | 12 |
| 骑兵 | 80 | 0.1224 (×1.7) | 1.43 | 11.2 | 0.0648 | 90 | 1.26 | 🏇 | 10 |
| 炮兵 | 120 | 0.675 (×1.5) | 5 | 35 | 0.0259 | 70 | 2.52 | 💥 | 8 |
| 海军 | 500 | 0.816 (4×步兵) | 1.5 | 80 | 0.0675 | 500 | 12 | 🚢 | 5 |
| 潜艇 | 350 | 0.9 | 3 | 55 | 0.04 | 200 | 10 | 🐬 | 3 |

### 属性显示基准（步兵 = 1）
- 单选单位详情面板：射程/移速以步兵为基准显示倍数（步兵 = 1，如骑兵移速 1.5×步兵、海军射程 4×步兵），不再显示角度小数
- 海军射程 = 4×步兵（0.816°）；海军节点射程 = 1.2×舰船射程 = 4.8×步兵

## 旗帜系统
- `flags/` 目录 23 张 PNG 旗帜贴图（含一战国旗：德意志帝国黑白红、奥斯曼星月、黑山王国红金边等），`drawCountryFlag()` 优先用贴图，缺失时才退回 Canvas 绘制
- 占领城市后地图城市上方直接调用 `drawCountryFlag()` 显示占领国旗帜（不再用三色条 switch 绘制）

## 海军系统

### 海军节点（六大列强专属）
- 六大列强（GERMANY/UK/FRANCE/RUSSIA/AUSTRIA_HUNGARY/ITALY）使用海军节点系统
- 节点可升级：Lv.1→Lv.2 (800金/45天) → Lv.3 (3000金/120天)

### 海军节点战斗（建筑单位）
- **生命 3000**，受炮击/舰炮伤害；生命归零 → 节点从 `G.navyNodes` 删除并消失（地图/面板不再显示）
- 节点自动攻击射程内海面敌军：**伤害 60、射速 2×步兵（0.5天/发）、射程 1.2×舰船射程（=4.8×步兵）**，红色炮弹
- 城市、工厂、海军节点均为可自动索敌目标；单位/舰船/炮兵可攻击敌方节点（`targetType:'navynode'`）
- **节点可点击选中**（与城市类似）：右侧面板显示属性详情（血量/伤害/射速/射程）＋生产界面（建造舰船 $500/5人力/30天、建造潜艇、升级节点）＋建造队列
- 地图上受损节点显示血量条，受损严重时锚点变红
- 地图节点下方仅显示名称/海域标签（玩家节点的建造进度条、选中高亮圈、沿海淡色网格方块均已移除；`drawCoastalWaters` 及缓存逻辑已删除）

### 舰船品级（T1-T8）
| 品级 | 名称 | 颜色 | 速度 | 射程 | 射速 | 火力 | HP | 机动 |
|------|------|------|------|------|------|------|-----|------|
| T1 | 朽坏 | #888 | -10% | -10% | -10% | -12% | -12% | +6% |
| T2 | 老旧 | #8B7D3C | -12% | +6% | -12% | -8% | -10% | -8% |
| T3 | 普通 | #FFF | 0 | 0 | 0 | 0 | 0 | 0 |
| T4 | 精锐 | #4A90D9 | +8% | +5% | +10% | +6% | +8% | -4% |
| T5 | 新锐 | #00C8C8 | +16% | -4% | +16% | +4% | +5% | +12% |
| T6 | 旗舰 | #9B59B6 | +4% | +12% | -4% | +6% | +16% | -6% |
| T7 | 英雄级 | #FF8C00 | +10% | +14% | +8% | +16% | +12% | +10% |
| T8 | 传奇级 | #FFD700 | 专属 | 专属 | 专属 | 专属 | 专属 | 专属 |

- T8 传奇舰船拥有专属属性
- 舰船属性通过 `applyNavyShipStats()` 存储到 division 的 `navySpd/navyRng/navyFr/navyDmg/navyMvr` 字段
- **机动 = 闪避子弹率**：普通船基准 5%，其他品级按机动加成加减（`navyDodgeRate(d) = 5% + 机动加成`，最低 0）；单兵详情显示实际闪避率（如"机动: 15%（闪避子弹）"）
- 建造费用：500金 + 5人力

### AI 舰船生产
- AI 列强直接调用 `createShip(nodeId, co)` + 创建 division 推入 `G.divisions`
- 不经过 `G.navyBuildQueue`（仅玩家使用），避免 AI 造的船归属玩家
- AI 生产几率 0.015，上限 = 节点等级 × 4

## 潜艇系统
- 独立兵种 `type: 'submarine'`，使用 🐬 海豚 emoji 渲染
- 生产费用 350金 + 3人力，20天建造周期（海军面板「建造潜艇」按钮）
- **下潜机制**：下潜时缓慢过渡（`days*0.15`），上浮速度 3倍（`days*0.45`）
- 下潜后透明度降至 0.3，移动速度减半，不可攻击且不可被敌方选中/锁定
- 潜艇被溅射/火焰伤害时跳过（`submerged` 标记）
- AI 德国有 40% 概率建造潜艇而非常规舰船
- `isSeaType()` 统一处理 `navy` + `submarine`

## 海军阵型系统
- 一字阵（`formation: 'line'`）：移动时同阵型单位自动排列横队
- 阵型单位显示 ⛓️ 标记

## 城市攻击系统
- **小城市**（非首都/非大城市）：伤害 30，射程 0.24°（2×步兵射程）
- **大城市/首都**：伤害 50，射程 0.30°（2.5×步兵射程）
- 射速 1 天（同步兵）
- 城市自动攻击射程内敌军
- 选中城市后显示攻击范围圈（白色/黑色自适应）
- 城市面板显示冷却条 + 伤害/射程信息

## 框选系统
- 框选可同时选中单位与本国城市（`G.selectedCities`）
- 同时选中城市与单位 → 只显示单位侧栏；只选中城市 → 显示多城市生产面板
- 多城市生产面板：大城市/小城市分组（大城市：建工厂/步兵/工兵/骑兵/炮兵；小城市：步兵），费用与人力 × 城市数，一次性加入各城市建造队列；下方汇总建造队列进度
- 选中单位中同时有陆军与海军 → 侧栏只显示海军（潜艇计入海军）

## 城市占领系统
- 城市 HP 归零 → 进入中立（`city.owner = null`）→ 攻击范围内最近的单位所属国获得城市
- 中立城市无属主：城市面板显示「⚖️ 中立」，任何攻击方均可夺取
- **原主夺回**：半血，`occupierFlag` 清除
- **同盟收复敌占城**：自动半血归还原主
- **敌方占领**：半血，设置 `occupierFlag`
- **己方守住**：半血，无旗
- 不改变省份归属/颜色
- 被占城市上方显示小国旗（22×15px，直接调用 flags/ 目录 PNG 贴图 `drawCountryFlag()`），已方城市不显示旗
- 城市 0HP 时无敌军在附近则保持中立 0HP（可被夺回）；`handleCityCapture` 优先寻找攻击范围内最近活师
- 火焰地带（`fireZones`）可对城市造成伤害（`fz.damage * days * 0.5`）
- `unitHitRadius` = 20px（炮弹/子弹命中外扩范围）

## 炮弹追踪与鱼雷
- 非海军/非炮兵单位的子弹**追踪目标**：`tracking: true` + `targetDivId`，每帧跟随目标更新终点
- 命中检测使用带弹道的实际位置 `p.x/p.y`（修复炮兵抛物线打到弧顶不中靶的问题）
- 炮兵抛物线：弧高随射程缩放 `arcHeight = min(0.3, travelDist * 0.5)`，近处目标弹道低平
- 潜艇鱼雷：蓝色 `#44aaff`，弹速 ×0.4，寿命 ×3，可追踪
- 炮兵开火时生成溅射伤害 + 火焰地带（`fireZones`）

## 炮兵行为（索敌与弹道）
- 自动索敌优先最近敌人，无敌人时自动攻击射程内敌军城市/工厂
- **移动中索敌即停止**：炮兵获得目标时停下开火（`state='idle'`，清空 targetX/Y）
- **不自动后撤**：目标贴近时炮兵原地开火（原"维持射程自动后撤"逻辑已移除，不再打断自身移动）
- **散布打偏**：炮兵 20% 概率打偏，落点随机偏移射程的 15%~40%（玩家/AI 通用）
- 弹道弧高随距离缩放，近距目标低平抛物线，远距目标高抛
- **建筑射击落点修正**：炮弹终点=建筑实际坐标（`td` 计算飞行时间），不再强行打满射程导致近处建筑脱靶

## 工程师行为
- 工兵**不攻击**（fireUnits 中跳过），专职工程
- 自动修复己方城市/工厂（射程 0.3° 内，`updateEngineerRepair`）
- 拆除紫圈（旧演示特效）已移除
- 建造费用 70，射速 1.25，伤害 8.4

## AI 行为
### 生产
- 自适应兵力构成，战时增加炮兵/工兵比例
- 国库充裕时多轮生产
- **AI 单位一律通过城市建造队列产出**：`ai_controller.js` 找到己方城市，扣除费用+人力后向 `G.buildQueue` 推入 `{type:'unit', unitType, country, cityId, ...}`，由 `processBuildQueue` 在城市附近生成单位（不凭空产生）
- `processBuildQueue` 不要求 `G.playerCountry`，通过 `q[i].country || G.playerCountry` 兼容玩家队列
- 海军列强通过 `createShip` 直接造舰（海军舰船仍走 `createShip` 路径，但须从节点/港口出发）

### 战略层（`ai_strategy.js`）
- 五大战区：西线/东线/意大利/巴尔干/中东 + 北海/地中海/波罗的海海军战区
- 国家个性：侵略性、经济倾向、外交倾向、兵种偏好
- 战略目标：速攻/总体战/固守/经济/海军/均衡
- 每 50 tick 重新评估战略

### 攻击移动
- 三阶段选择：攻城 → 交火 → 进军
- 城市评分优先：首都(-6)、大城市-工厂(-3+cf×2)、己方边境(-2)、战区目标(-4)
- 西线国家（德/法）优先使用火炮攻城
- AI 会冲向低血量城市抢占，但会评估守军兵力不贸然冲

### 防御
- 边境城市驻防保持 1+ 师
- 突破点防御：检测敌军聚集区域并集中兵力
- 常规防御：空闲部队移向最近敌军

### 外交
- 结盟：优先与有共同敌人的邻居结盟
- 宣战：评估兵力比、边境、列强盟友
- 独立保障、提升好感
- 同盟义务触发自动参战

### 国家个性
| 国家 | 侵略性 | 经济 | 外交 | 炮兵偏好 | 骑兵偏好 | 筑垒 |
|------|--------|------|------|---------|---------|------|
| 德国 | 0.85 | 0.7 | 0.5 | 0.35 | 0.15 | 0.3 |
| 法国 | 0.55 | 0.65 | 0.7 | 0.25 | 0.1 | 0.6 |
| 奥匈 | 0.7 | 0.55 | 0.55 | 0.25 | 0.15 | 0.4 |
| 意大利 | 0.5 | 0.5 | 0.6 | 0.15 | 0.1 | 0.4 |
| 俄国 | 0.65 | 0.4 | 0.45 | 0.15 | 0.2 | 0.3 |
| 土耳其 | 0.45 | 0.4 | 0.5 | 0.1 | 0.15 | 0.4 |
| 英国 | 0.4 | 0.8 | 0.85 | 0.15 | 0.1 | 0.3 |

### 历史行为
- 德国：1914年8月3日自动对比/法/荷兰宣战（仅非玩家）
- 英国：德国入侵比利时后自动参战
- 法国：AI 优先应对德国，不主动打奥匈

## 省份占领
- 基于 `isPointInPolygon` 物理检测
- 城市被占不影响省份颜色（城市上方小国旗替代）
- 投降后剩余领土转移给占领城市最多的国家

## 外交系统
- 宣战、议和（含赔款）、改善关系、同盟、军事通行权
- 互不侵犯条约、独立保障、贸易协定、拉拢阵营
- 默认同盟：德国←→奥匈
- 战争分数驱动 AI 求和
- **外交点数**（🏛️）：大城市每年 +1.5/座，上限 200；宣战 5、同盟 10、保障 10、通行权 3、互不侵犯 5
- AI 外交行为（宣战/同盟/保障）**不消耗**外交点数
- `G.relations[source][target]` 二维好感度结构，AI 和玩家共用同一格式

## 操作
- **左键**：选中单位/省份/城市 | **侧栏单位行左键**：仅选中该单位
- **Shift+左键**：多选
- **双击**：选中同类型己方单位
- **右键敌军/工厂/城市**：集火标记 | **右键空地**：行军
- **中键拖拽**：平移 | **滚轮**：缩放（面板/列表内为列表滚动）
- **R**：重置视角 | **Esc**：取消选择/关闭面板
- **Ctrl+数字键**：保存编队 | **数字键**：选中
- **Ctrl+P**：驻守 | **Ctrl+Shift+R**：取消巡逻
- 右键自动过滤敌方单位（不能指挥敌方）

## 核心机制

### 游戏循环
每帧：`updateGame(dt)` → `moveUnits(days)` → `fireUnits(days)`（含城市攻击）→ `updateProjectiles(days)` → `render()`

### 战斗系统
- 陆/海单位子弹可追踪目标（非海军/非炮兵），炮兵抛物弹道可溅射
- 溅射伤害、炮兵抛物线（弧高随距离缩放）、海军机动闪避
- 城市也可发射子弹攻击射程内敌军
- 选中敌方单位仅查看范围圈，不能指挥
- 无敌人时自动索敌攻击敌方城市/工厂（炮兵优先远程压制）

### 经济系统
- 维护费 1.5/天/师团、省份收入、人口系统
- 建造工厂 50金/10天、城市升级
- 附属国上缴 20% 收入

### 投降与胜利
- 非列强：首都沦陷 + 70% 领土丧失 → 投降
- 列强永不投降
- 一方阵营全部投降 → 胜利
- 1919年僵局 → 协议和平

### 事件系统
- 奥匈宣战（1914.7.28）：动员/观望
- 意大利参战（1915.5.23）：协约国/同盟国/中立

### 前线部署
- 选中单位 → "⚔️ 前线" → 标记目标 → "✅ 部署"
- 持续推进：目标被占后自动添加新目标

### 驻守系统
- 选中单位 → "🛡️ 驻守" 或 Ctrl+P
- 巡逻，遇敌追击 (3天)，超时返回

### UI 组件
- 顶部栏：日期、速度、国库/收支/人口
- 底部四标签：军事/经济/外交/海军
- 右侧单位栏、省份信息面板、训练栏
- 城市面板（右侧）：HP、冷却条、工厂、生产按钮（上方）→ 建造队列（下方）
- **分隔线/装饰线为纯细线**（分隔线中央菱形装饰与顶部装饰线菱形已移除）
- **单选单位详情**：选中单个单位显示伤害/射速/生命/简介；射程与移速按「步兵=1」换算显示（如炮兵射程 3.31×步兵）；海军舰船使用品级加成后的实际属性（navyDmg/navyFr/navyRng/navySpd/navyMvr）并显示机动值；潜艇显示下潜状态
- 新闻横幅、游戏日志、坐标/缩放指示器
- 存档系统（最多 20 槽）

## 联机模式

### 架构
- **Host 权威模型**：房主运行完整游戏模拟，客户端只渲染
- **WebSocket 通信**：`server/server.js` 中继服务器，`js/multiplayer.js` 客户端
- 启动方式：`npm run server`（端口 1914），通过 `index.html` 的「联机模式」按钮连接

### 房间系统
- 2-8 人房间，玩家在房间内选择国家、添加 AI
- 可选国家限制为 8 个列强（GERMANY/FRANCE/UK/AUSTRIA_HUNGARY/ITALY/RUSSIA/TURKEY/SPAIN）
- 房主可添加/移除 AI，其余玩家可加入房间
- 开始游戏时自动将未准备玩家移除，并将未被选中的列强全部设为 AI

### 状态同步
- Host 每 2.5s 发送完整快照（`STATE_FULL`），每 200ms 发送增量位置（`STATE_DELTA`）
- Client 接收后应用状态，不运行本地模拟

### 速度系统
- 联机：1x/2x/4x/8x/16x 离散按钮，仅房主可调倍速
- 单机：2x/4x/8x/16x/32x/64x/128x 离散按钮
- 两套系统完全独立，互不影响

### 消息类型
- 房间：CREATE_ROOM / JOIN_ROOM / LEAVE_ROOM / ROOM_LIST / ROOM_UPDATE / ROOM_CLOSED
- 席位：SELECT_COUNTRY / ADD_AI / REMOVE_AI / PLAYER_READY
- 游戏：GAME_START / GAME_SPEED / STATE_FULL / STATE_DELTA / PLAYER_ACTION
- 聊天：CHAT（附带发送者名称）
- 系统：PING/PONG / ERROR

## 待办/可改进方向
- 更多历史事件
- 科技树系统
- 音效
- game_core.js 模块化拆分（当前 ~3600 行）
- AI 训练反制（玩家战术适应）
- 潜艇经验/升级系统
- 深水炸弹反潜机制
- 更多单位介绍文案（desc 字段扩展）
- 联机：客户端延迟补偿、断线重连、观战模式
- 联机：P2P 直连优化（当前为中继转发）
- 排查"加入集团军弹窗偶发空白"：VM 隔离测试渲染正常，需真机控制台验证 `getJoinableGroups`/`getAvailableCommanders` 返回值（"全部师已在同一集团军"分支属预期不弹窗）

## 一战指挥系统（单机）

### 文件结构
```
js/command/
├── commanderData.js      # 全部 22 国总司令 + 指挥官数据（姓名/光环/可指挥上限/攻/血/移速/后勤/评星）；8 列强各有多名总司令与指挥官池，其余 14 小国（塞尔维亚/保加利亚/罗马尼亚/希腊/黑山/比利时/荷兰/卢森堡/瑞典/挪威/丹麦/瑞士/葡萄牙/阿尔巴尼亚）各 1 名唯一总司令（卢森堡女大公、阿尔巴尼亚亲王无光环；葡萄牙塔马尼尼双光环 攻击+6%/后勤-8%）；光环支持 {stat,value} 或数组 [{stat,value},...]（getAuraList 归一化，显示用 cmdAuraText）
├── commanderState.js     # G.commanderState 状态结构（chiefs/chiefPools/cmdPools/groups/groupCounter）
├── commanderSystem.js    # 核心逻辑（编成/解散/换将/师团脱离/加成计算/总司令光环/池管理）
└── commanderUI.js        # 底部快捷栏、集团军详情面板、指挥官选择弹窗、总司令顶栏显示
```

### 机制
- **两级指挥**：总司令（全局光环，开局 1 位，只加 1 项 ≤8%）+ 集团军指挥官（局部加成 ≤25%）
- 指挥官是纯"属性挂件"：不生成战场实体、不死人、无消耗
- **编成/加入集团军**：选中本国陆军 → 侧栏"⚔️ 编入集团军" → 合并弹窗（可加入的现有集团军列表在前 + 分隔线 + 后备指挥官在后，行高 62/字号放大）→ 加入（`addDivisionToGroup` 批量编入全部选中师）或编成新集团军；**1 个师即可编成**（`canFormGroup >= 1`）；已在集团军中的师也可点击"编入集团军"移入其他集团军（不再拦截）
- 可随时更换指挥官 / 删除集团军 / 师团单独脱离（脱离后失去加成）；**集团军不因成员少自动解散**——1 个师、0 个师（空集团军）都保留，可后续再让部队加入；成员全灭集团军仍显示
- **编成上限 6 个集团军**：超出时无法编成并日志提醒"请先删除部分集团军"；后备池弹窗头部显示当前数量 X/6（满员时红色警告）；管理面板提供"🗑️ 删除"（立即生效，无确认）与"解散"（需确认）两个删除入口，指挥官均返回可用池
- **编成空集团军**：点击底部快捷栏"后备指挥官池入口"或空位卡片 → 弹窗中点击任一指挥官即编成空集团军（0 个师），后续经侧栏"编入集团军"让部队加入
- **现任总司令不可担任集团军指挥官**（编成/更换列表均不可选，`getAvailableCommanders` 排除；光环常驻；旧存档中曾指派的总司令解散后回归）
- **任命总司令**（`setChief`）：国别侧栏（点击本国领土）"更换总司令"弹窗从后备总司令中任命；旧总司令回后备池
- 国别侧栏显示本国/他国总司令姓名与光环（所有有总司令的国家，含小国），本国附"更换总司令"按钮（联机隐藏）
- 总司令不可被指派为集团军指挥官（现任不可选、光环常驻；旧存档回归逻辑兼容）
- **加成挂钩**（game_core.js）：攻击×在 fireUnits 炮弹伤害、血量=受伤减免（updateProjectiles/fireZones）、移速×在 moveUnits、后勤=师团维护费减免（updateEconomy，1.5金/天/师）
- 单位战死自动从集团军移除成员（removeDivision → cleanupDivisionGroup，**集团军保留**）
- 存档/读档：commanderState 随 G 序列化，读档后 pruneBrokenGroups 仅清理失效师团引用（不因成员少解散）
- 联机模式不可用（避免状态不同步）
- **id 约定**：师团 id 自 1 计数（`divIdCounter: 1`）且数组会 splice → 一律用 `G.divisions.find(x => x.id === id)`，禁止数组索引
- **集团军统一指挥**：点击集团军卡片只切换 `G.selectedArmyGroupId` 并清空单位选择（打开管理面板）；右键行动时若无手动选单位，则以集团军全部存活成员（`cmdIds`）统一集火/行军/破阵（联机客户端分支保持原逻辑）

### UI
- 底部中央快捷栏（钢铁雄心风格）：集团军卡片（指挥官名/师数/评星）+ 后备指挥官池入口 + 空位卡片；悬停显示加成提示；**快捷栏空白区点击不再穿透到背景城市**（`_cmdBarRect` 拦截左键+右键）
- 点击卡片 → 右侧管理面板（属性/上限/总兵力/下属列表/脱离/更换/解散）；**下属列表可滚轮滚动**（`G._cmdPanelScroll`，溢出显示滚动条，切换集团军归零）；选中单位时面板自动隐藏避免与侧栏重叠
- **侧栏单位列表**：多选时最多 8 行可视（行高 25），超长可滚轮滚动（`G._sibScroll` + 滚动条 + "共 N 个（滚轮查看）"提示，切换选中组合归零）；**点击某一行仅选中该单位**（`unit_row_<id>`，清空集团军/城市/省份选择）；面板放大为 300px 宽
- **单兵详情加成显示**：伤害/生命/移速行内绿色 `+N`（含全部加成合计）+ 金色汇总两行叠加——`🎖️ 集团军名加成: 攻击+X% …` 与 `🎖️ 总司令光环(姓名): 血量+X%`（`getBonusBreakdown` 拆分来源）；无集团军时仅光环行
- 顶部状态栏**不显示**总司令信息（仅显示国家/经济/军队/外交点数/日期速度）；总司令姓名与光环只在国别侧栏展示
- 弹窗：编成/更换共用指挥官列表（含滚动条），解散需确认

## 最近更新（2026-08-02）

### 铁路运兵系统（git f7fff58）
- **铁路网络**：`G.railways{}` 存铁路段（key 为 `城市A|城市B` 排序拼接）；段可用条件 = 两端城市归属己方/同盟/有军事通行权（`railwayUsable`）；被摧毁/易主的段不可用
- **运兵流程**：选中陆军（排除海军/飞机）→ 铁路弹窗选目的站 → 部队先**步行接驳**（省份寻路避免穿越敌境，`stage:'walk_to_station'`）→ 到达起点站上车（`railwayPath` BFS 算路径，`stage:'on_train'`）→ 沿段快速移动（速度 = 兵种速度 ×2.5×`railSegmentMult`，山地段 `RAIL_MOUNTAIN_MULT=2.5`、平地段 `RAIL_SPEED_MULT=5`）→ 到站下车转 idle
- **各自就近上车**：`fromCityId` 为 null 时每队独立找最近可用车站（`railNearestStation`）；参考站决定可达列表（`railwayReachableCities` BFS）
- **运费**：`RAIL_TRIP_COST`（步20/工25/骑30/山25/炮40/队），总价一次扣除，不足不发车
- **乘车限制**：乘车中不可开火（fireUnits/auto-target 跳过 on_train）；铁路被切断立即下车（`cancelRailTrip`）；右键/点击移动命令取消运兵
- **弹窗**：drawRailModal 显示目的站列表（里程/ETA/⛰山地段数/他国归属），列表超 12 行滚轮滚动（`m.scroll` + `window._railModalMaxScroll`）
- **山地铁路标记**：铁路段跨山地省份时绿色 ⛰ 标记（`railwayIsMountain` + `ensureRailMtnCache`）
- 铁路日志：上车/到站/中断/取消均有 🚂 日志

### 性能优化：WebGL 单位渲染（GLU，`js/gl_units.js`，方案B混合渲染）
- **架构**：`gameGL` canvas（z-index:2、pointer-events:none）叠加在主 canvas 上；**仅世界层单位/扬尘走 WebGL**，UI/文本/面板仍 Canvas 2D
- **图集**：2048×2048、NEAREST；单位贴图降采样上限 96px（原图最大 1920×1920）；扬尘径向渐变图为 0 号槽；`texImage2D` try/catch，失败（file:// 打开导致 Tainted canvases）→ 禁用 GLU 并 toast 提示用 `node server/server.js` → http://localhost:1914
- **绘制**：instanced 顶点扩展（stride 32：corner/uv/alpha/color），每帧单次 `drawArrays` 画全部单位；朝左翻转 UV；预乘 alpha `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)`，FS 输出 `vec4(c.rgb*color*c.a*vAlpha, c.a*vAlpha)`
- **UI 挖洞**：fragment shader discard 最多 8 个 UI 矩形（y 翻转 `H-r[1]-r[3]`）：顶栏/底栏/左右侧栏/国家侧栏/铁路弹窗/指令弹窗/指挥快捷栏（render() 末尾 `GLU.flush(rects.slice(0,8))`）
- **对象池**：预分配 `unitPool` 16384 对象 + `unitN` 计数器（消除每帧 GC）；`MAX_UNITS=16384`，verts `Float32Array(MAX_UNITS*6*8)`
- 集成：drawDivisions 先 GL 后 2D 回退；`resizeCanvas` 同步 `GLU.resize()`；index.html 4 个脚本 `?v=40`

### 渲染静态缓存（game_ui.js render()）
- **三层离屏缓存**：省份填充、海岸网格、边界+河流+山地三层，均按 `panKey = Math.round(camX*zoom*PPD/8)+','+Math.round(camY*zoom*PPD/8)+','+shapeKey` **8px 量化重建**（拖动中内容与相机同步，消除每帧全量重绘的周期性卡顿）
- `shapeKey = Math.round(zoom*100)+','+w+','+h`（缩放/尺寸变化也触发重建）
- **注意**：所有静态层依赖 `worldToScreen`（相机偏移），必须随 pan 重建——曾只把省份层排除在重建外导致 pan 时版图错位（已修复，见下）

### 缺粮系统改造
- **取消断粮扣血**：`GRAIN_STARVE={speed:0.6, mult:0.6, attritionPerDay:0}`（原每次 `/5` 血循环扣血已移除）
- **负面效果只在口粮归零时才生效**：离开补给半径/城市粮仓见底 → `supplyStatus='low'`（短缺）：口粮照常按天消耗（`rations = max(0, rations-days)`），**无任何负面效果**（`GRAIN_LOW={speed:1, mult:1}`）；口粮耗尽归零 → `supplyStatus='starve'`（断粮）才施加负面效果
- **统一函数**：config.js `grainMultFor(d)` = starve 0.6 / 其他 1；fireUnits 伤害与射速、moveUnits 速度统一走该函数
- **头顶标记**：🚫🌾 仅当 `starve && rations<=0`（口粮归零）时显示（原 starve 即显示+口粮数字）
- **面板显示**：详情面板断粮惩罚行（⚠️ 攻伤/射程/射速/移速 -%）仅 starve 时显示；状态文字 starve→"断粮"、low→"短缺"；血条右侧 "断粮" 标签条件不变

### 海军目标限制
- `isSeaType(type)` = navy|submarine（game_core.js:117）
- **海军/潜艇不能攻击陆军与空军**：fireUnits focusTarget 若为非海目标则清除；两处 auto-target 桶跳过 `isSeaType(d) && !isSeaType(e)`；仍可攻击沿岸城市/工厂/海军节点

### 本次会话修复
- **铁路弹窗滚轮失效**：wheel handler 读 `G._railModalMaxScroll` 而写入处是 `window._railModalMaxScroll`，命名空间不一致 → 恒为 0 滚不动；统一读 `window._railModalMaxScroll`
- **index.html 中文乱码**：title/加载/国家选择界面文本实际是 UTF-8 编码的 GBK mojibake（`閾佷笌鏉冩焺锟?914` 等，行 6/152/161/162/166/168）；PowerShell 替换因 `�` 字符过命令行损坏而失败，改用 node 脚本文件按字节特征修复 → `铁与权柄：1914 · 省份地图`、`✦ 选择你的国家 ✦`、`点击选择国家 · 长按或右键查看详情`、`⚔️ 联机模式`
- **pan 时版图错位**：省份层曾排除在 panKey 重建外（只在 zoom 变时重建）且 blit 固定 0,0 → 拖动视角时色块不跟手；修复：三层统一纳入 8px 量化 panKey 重建

### 已知问题 / 待办
- **（已修复）单位上车后不能移动**：根因 = ai_pathfinding.js:634 用同名函数**覆盖了 game_core.js 的 moveUnits**，railTrip 分支从未执行；且碰撞箱推挤把铁路单位推出车站导致永远到不了站。修复：抽 `moveRailUnit(d, days)`（game_core.js，步行接驳+乘车+省界检查+到达上车），两版 moveUnits 均委托它。headless 验证：步行 430 帧上车 → 1092 帧抵达汉堡下车 ✓
- **碰撞箱规则**：普通单位与步行接驳（walk_to_station）单位照常受碰撞推挤（6c4 单位分离 + 6c5 建筑分离）；**乘车中（on_train）单位完全不受推挤**；步行单位的目标车站不做 6c5 推挤（否则永远到不了站）；moveRailUnit 进站判定半径 0.04°（大于推挤作用范围 0.037°，被推挤单位进圈即上车）
- `images/terrain/terrain_land.png` 缺失 → game_panels.js:153 良性警告（地形底图不显示，省份色块正常）
- git：origin/main=f7fff58（force-push 覆盖旧 9c00c90），旧远端存 `backup-pre-webgl` 分支；本地未跟踪 `-w` 文件、`exportImage.tiff` 状态残留；本次修复（乱码/滚轮/pan/缺粮/铁路）尚未提交
- 本地运行：`node server/server.js` → http://localhost:1914（WebGL 加速需 http 访问，file:// 自动回退 2D）
- 注意：工作区文件可能在会话中受外部编辑器修改（如 ai_pathfinding.js 6c5 段），提交前先 `git diff` 审查