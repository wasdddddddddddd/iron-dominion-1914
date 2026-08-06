# Iron & Dominion 1914（铁与权柄：1914）

> 纯前端 HTML5 Canvas 一战即时战略游戏 | 23国 | 实时战术 | 经济外交海军AI | 联机对战

## 快速开始

```bash
# 直接打开浏览器
open index.html

# 或用 Node 启动联机服务器
node server/server.js
```

## 项目结构

```
根目录
├── index.html            # 入口文件
├── package.json          # 依赖
├── Dockerfile            # Docker 部署
├── DEPLOY.md             # 部署指南
├── mobile.js             # 移动端适配
├── mobile_landscape.js   # 移动端横屏
│
├── js/                   # 核心代码
│   ├── config.js         # 全局配置
│   ├── game_state.js     # 游戏状态定义
│   ├── game_core.js      # 核心逻辑（循环/战斗/移动/AI/事件）
│   ├── game_ui.js        # Canvas 渲染引擎
│   ├── game_panels.js    # UI 面板（单位/侧栏/海军/外交）
│   ├── game_init.js      # 国家选择界面
│   ├── multiplayer.js    # 联机客户端（WebSocket）
│   ├── market.js         # 国际市场
│   ├── tactical.js       # 战术层循环
│   ├── gl_units.js       # GL单位渲染
│   ├── terrain_b64.js    # 地形底图数据
│   ├── data_*.js         # 数据文件（省份/城市/工厂/河流/事件）
│   ├── ai/               # AI 模块
│   │   ├── ai_controller.js   # AI 主控制器
│   │   ├── ai_battle.js       # AI 战斗（4条规则）
│   │   ├── ai_strategy.js     # AI 战略层
│   │   ├── ai_tactics.js      # AI 战术层
│   │   └── ai_pathfinding.js  # AI 寻路
│   ├── navy/             # 海军模块
│   │   ├── navyNode.js        # 海军节点系统
│   │   ├── shipData.js        # 舰船预设
│   │   ├── shipGrades.js      # 舰船等级
│   │   └── shipNaming.js      # 舰船命名
│   └── command/          # 指挥系统
│       ├── commanderData.js
│       ├── commanderState.js
│       └── commanderSystem.js
│
├── server/               # 联机服务器
│   └── server.js         # WebSocket 中继
│
├── src/                  # 资源系统
│   ├── data/resourceData.js
│   └── economy/
│       ├── resourceProduction.js
│       └── resourceNational.js
│
├── ui/                   # UI 样式
│   ├── style.css
│   ├── mobile.css
│   ├── rail.js
│   └── supply.js
│
├── images/               # 图片素材 (132张)
├── flags/                # 旗帜图片 (23张)
├── music/                # 背景音乐 (8首)
├── docs/                 # 设计文档
│   ├── AI战斗系统重构计划书.md
│   ├── HOI4风格前线系统方案书.md
│   └── AI极简重写方案.md
├── tools/                # 开发工具
│   ├── ai_sim.mjs             # AI 模拟器
│   ├── step_test.mjs          # 步骤测试
│   └── test_ai_headless.mjs   # 无头测试
└── UnityProject/         # Unity 渲染层（可选）
```

## 游戏系统

| 系统 | 说明 |
|------|------|
| **战术作战** | 实时移动/开火，炮弹追踪伤害，兵种射程差异化 |
| **经济** | 税收/工厂建设/城市升级/贸易 |
| **外交** | 宣战/同盟/保障独立/外交点数 |
| **海军** | T1-T8舰船建造/升级/海战/港防 |
| **陆军** | 步兵/骑兵/火炮/工兵/山地兵，铁路运输 |
| **攻城** | 城市HP系统，围城/攻城/占领 |
| **史丽芬计划** | 德国AI自动执行（比利时→卢森堡→法国） |
| **联机** | WebSocket多人对战 |
| **指挥系统** | 集团军编成/指挥官特性/加成 |
| **资源** | 粮食/铁矿/石油生产与分配 |
| **AI** | 动态边境驻军→集中攻城→中立占领→支援（ai_battle.js） |

## AI 战斗逻辑（ai_battle.js）

四条硬规则，每 tick 执行：

1. **边境动态驻军** — 兵力优势少守(10%)，劣势多守(25%)，长期无敌→释放
2. **集中攻城** — 全军打最近敌城，2倍优势→2线进攻，3倍→3线
3. **中立占领** — 3.5°内中立城各派1兵，上限2个
4. **卡住换目标** — 10tick不动→绕中立国，30tick→放弃，城市被攻→回防

## 性能优化（2026-08-05）

- AI 全局缓存：一次遍历替代 ~200次 .filter()
- 城市碰撞：空间桶替代 O(C×N) 12万次/帧
- fireUnits 桶缓存：永久缓存城市/工厂/海军节点
- updateProjectiles 复用桶
- 内存分配优化：Set追踪替代中间数组

## 技术栈

- Vanilla JS + HTML5 Canvas
- WebSocket 联机
- Node.js 服务端
- 移动端适配
