// Iron & Dominion 1914 - Config
const PIXELS_PER_DEGREE=100,MIN_ZOOM=0.08,MAX_ZOOM=30.0;
const STRATEGIC_ZOOM=0.8,TACTICAL_ZOOM=1.8;
// 地形底图：省份填充透明度（<1 时透出下方地形纹理；无地形图时自动用 1）
const TERRAIN_FILL_ALPHA=0.65;
// 是否叠加 TIFF 转换的陆地底图（terrain_land.png）；false 时不画，陆地以国家色为主
const TERRAIN_BG_ENABLED=false;
// 山地阴影层强度（hillshade 光影+山地棕调，画在省份上）
const MOUNTAIN_SHADE_ALPHA=1;
// 山脊线层强度（真实山脊线，画在阴影之上）
const MOUNTAIN_RIDGE_ALPHA=1;
// 山地范围层强度（半透明棕色填充 + 深色边界，画在省份上、阴影之下）
const MOUNTAIN_RANGE_ALPHA=1;
// 地形对移动速度的倍率（单位位于该地形格时生效，逐格查询）
const TERRAIN_MOVE={flat:1,mountains:0.55};
// 山地移速倍率（按兵种：山地师-5%、骑兵-60%、炮兵-50%、步兵/工兵-45%）
const MOUNTAIN_MOVE_BY_TYPE={infantry:0.55,engineer:0.55,mountain:0.95,cavalry:0.4,artillery:0.5};
// 炮兵位于山地的射程加成（+20%）
const ARTILLERY_MOUNTAIN_RANGE_BONUS=0.2;
// ===== 粮食（补给）系统 =====
const KM_PER_DEG=111; // 1° 纬度 ≈ 111 km
// 城市粮食参数（cityType → 月产粮/储存上限/补给半径km/补给圈颜色）
const GRAIN_CITY_CFG={
    capital:{ grainPerMonth:40, grainMax:800, supplyRadius:200, color:'#4a90d9' }, // 蓝
    major:  { grainPerMonth:30, grainMax:400, supplyRadius:120, color:'#6ab06a' }, // 绿
    agri:   { grainPerMonth:60, grainMax:300, supplyRadius:80,  color:'#e8a040' }, // 橙
    small:  { grainPerMonth:15, grainMax:150, supplyRadius:50,  color:'#9aa0a8' }, // 灰
};
// 部队月耗粮（海军/潜艇海上补给走海军节点，不消耗城市粮食）
const UNIT_GRAIN_PER_MONTH={ infantry:30, engineer:30, cavalry:50, artillery:40, mountain:30, airplane:20 };
// 小城市粮食升级：费用/工期（天）/产量提升
const GRAIN_UPGRADE_COST=100, GRAIN_UPGRADE_DAYS=30;
// 农业城市列表（黑土平原产粮区，如基辅、匈牙利平原）
const AGRICULTURAL_CITY_IDS=['kiev','odessa','budapest','kassa','brasso'];
// 部队口粮上限（天）
const GRAIN_RATIONS_MAX=30;
// 口粮渐进恢复量（天/游戏天）：补给圈内缓慢恢复，不瞬间补满
const GRAIN_RATIONS_RECOVER_DAY=5;
// 断粮惩罚：移速倍率(与全属性-40%一致) / 口粮耗尽后每天固定扣兵力点
const GRAIN_STARVE={speed:0.6, attritionPerDay:5};
// 短缺惩罚：移速倍率
const GRAIN_LOW={speed:0.8};
// ===== 铁路运兵系统 =====
// 运兵速度倍率：平原铁路段 ×5；穿过山地的铁路段 ×2.5（山地是"慢速走廊"，不被铁路架空）
const RAIL_SPEED_MULT=5, RAIL_MOUNTAIN_MULT=2.5;
// 步行接驳：部队距离起点站小于该值（度）视为"已进站"（上车/下车判定）
const RAIL_STATION_RADIUS=0.02;
// 铁路运兵费用（金币/每支部队，按兵种）
const RAIL_TRIP_COST={ infantry:20, engineer:25, cavalry:30, mountain:25, artillery:40 };
const MAP_CENTER_LON=10,MAP_CENTER_LAT=50;
const OCEAN_COLOR_TOP="#1a2a3a",OCEAN_COLOR_BOTTOM="#1a2535";
const COUNTRY_COLORS = {"ALBANIA":"#E05555","TURKEY":"#5B9E6B","AUSTRIA_HUNGARY":"#E8D18C","BULGARIA":"#3CB88B","BELGIUM":"#8BB8D8","DENMARK":"#D44040","GERMANY":"#6B8FA0","RUSSIA":"#4A8C3F","FRANCE":"#3B6FD4","FINLAND":"#8BB5D0","NETHERLANDS":"#FF6B35","MONTENEGRO":"#E05555","LUXEMBOURG":"#5BBFD4","ROMANIA":"#D4C56B","NORWAY":"#5B8FBF","PORTUGAL":"#5B9E4B","SWEDEN":"#4A7FB5","SWITZERLAND":"#E63946","SERBIA":"#D44B4B","SPAIN":"#D4A843","GREECE":"#5B8FBF","ITALY":"#3CB043","UK":"#D4343E"};
const COUNTRY_CN = {"ALBANIA":"阿尔巴尼亚","TURKEY":"奥斯曼帝国","AUSTRIA_HUNGARY":"奥匈帝国","BULGARIA":"保加利亚","BELGIUM":"比利时","DENMARK":"丹麦","GERMANY":"德国","RUSSIA":"俄国","FRANCE":"法国","FINLAND":"芬兰","NETHERLANDS":"荷兰","MONTENEGRO":"黑山","LUXEMBOURG":"卢森堡","ROMANIA":"罗马尼亚","NORWAY":"挪威","PORTUGAL":"葡萄牙","SWEDEN":"瑞典","SWITZERLAND":"瑞士","SERBIA":"塞尔维亚","SPAIN":"西班牙","GREECE":"希腊","ITALY":"意大利","UK":"英国"};
// 国名简称（用于单位命名："德意志第1步兵师"）
const COUNTRY_SHORT = {"GERMANY":"德意志","UK":"英国","FRANCE":"法兰西","RUSSIA":"俄罗斯","AUSTRIA_HUNGARY":"奥匈","ITALY":"意大利","TURKEY":"奥斯曼","SPAIN":"西班牙","SERBIA":"塞尔维亚","BELGIUM":"比利时","BULGARIA":"保加利亚","ROMANIA":"罗马尼亚","GREECE":"希腊","ALBANIA":"阿尔巴尼亚","DENMARK":"丹麦","NETHERLANDS":"荷兰","MONTENEGRO":"黑山","LUXEMBOURG":"卢森堡","NORWAY":"挪威","PORTUGAL":"葡萄牙","SWEDEN":"瑞典","SWITZERLAND":"瑞士","FINLAND":"芬兰"};
// 兵种全称（用于单位命名）
const UNIT_FULL_NAME = {"infantry":"步兵师","engineer":"工兵师","cavalry":"骑兵师","mountain":"山地师","artillery":"炮兵师","airplane":"空军","navy":"海军","submarine":"潜艇"};
const UNIT_SHORT = {"infantry":"步","engineer":"工","cavalry":"骑","mountain":"山","artillery":"炮","airplane":"空","navy":"海","submarine":"潜"};
const TERRAIN_CN={"flat": "平原", "hills": "丘陵", "mountains": "山地", "urban": "都市"};
const BORDER_COLOR="rgba(180,140,80,0.2)",BORDER_WIDTH=1.0;
const PROVINCE_BORDER_COLOR="rgba(180,140,80,0.12)",PROVINCE_BORDER_WIDTH=0.5;
const CITY_DOT_RADIUS=3,CAPITAL_DOT_RADIUS=5;
const CITY_DOT_COLOR="#d4c0a0",CAPITAL_DOT_COLOR="#c8a830";
const CITY_NAME_COLOR="#d4c0a0",PORT_NAME_COLOR="#6a8aaa";
const CITY_NAME_FONT="11px \"Segoe UI\",sans-serif";
const CAPITAL_NAME_FONT="bold 12px \"Segoe UI\",sans-serif";
const ECONOMY_INTERVAL=30000,FACTORY_COST=50,FACTORY_BUILD_TIME=10,MAINTENANCE_COST=1.5;
const ZOOM_SPEED=0.35,PAN_SPEED=1,TOP_BAR_HEIGHT=40,BOTTOM_BAR_HEIGHT=48,BOTTOM_TAB_BAR_HEIGHT=36,TAB_PANEL_HEIGHT=350;
// 列强：不可被吞并或附属
const GREAT_POWERS = ['UK','FRANCE','GERMANY','AUSTRIA_HUNGARY','ITALY','RUSSIA'];
function isGreatPower(c) { return GREAT_POWERS.includes(c); }
// 附属国体系: VASSAL_OF[vassalCountry] = suzerainCountry
// 宗主国可在附属国领土自由行军；附属国20%收入上交宗主国
const VASSAL_OF = { FINLAND: 'RUSSIA' };
