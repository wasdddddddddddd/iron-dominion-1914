// Iron & Dominion 1914 - Config
const PIXELS_PER_DEGREE=100,MIN_ZOOM=0.08,MAX_ZOOM=30.0;
const STRATEGIC_ZOOM=0.8,TACTICAL_ZOOM=1.8;
// 地形底图：省份填充透明度（<1 时透出下方地形纹理；无地形图时自动用 1）
const TERRAIN_FILL_ALPHA=0.8;
// 山地阴影层强度（hillshade，画在省份下）
const MOUNTAIN_SHADE_ALPHA=1;
// 山脊线层强度（真实山脊线，画在省份上）
const MOUNTAIN_RIDGE_ALPHA=1;
const MAP_CENTER_LON=10,MAP_CENTER_LAT=50;
const OCEAN_COLOR_TOP="#1a2a3a",OCEAN_COLOR_BOTTOM="#1a2535";
const COUNTRY_COLORS = {"ALBANIA":"#E05555","TURKEY":"#5B9E6B","AUSTRIA_HUNGARY":"#E8D18C","BULGARIA":"#3CB88B","BELGIUM":"#8BB8D8","DENMARK":"#D44040","GERMANY":"#6B8FA0","RUSSIA":"#4A8C3F","FRANCE":"#3B6FD4","FINLAND":"#8BB5D0","NETHERLANDS":"#FF6B35","MONTENEGRO":"#E05555","LUXEMBOURG":"#5BBFD4","ROMANIA":"#D4C56B","NORWAY":"#5B8FBF","PORTUGAL":"#5B9E4B","SWEDEN":"#4A7FB5","SWITZERLAND":"#E63946","SERBIA":"#D44B4B","SPAIN":"#D4A843","GREECE":"#5B8FBF","ITALY":"#3CB043","UK":"#D4343E"};
const COUNTRY_CN = {"ALBANIA":"阿尔巴尼亚","TURKEY":"奥斯曼帝国","AUSTRIA_HUNGARY":"奥匈帝国","BULGARIA":"保加利亚","BELGIUM":"比利时","DENMARK":"丹麦","GERMANY":"德国","RUSSIA":"俄国","FRANCE":"法国","FINLAND":"芬兰","NETHERLANDS":"荷兰","MONTENEGRO":"黑山","LUXEMBOURG":"卢森堡","ROMANIA":"罗马尼亚","NORWAY":"挪威","PORTUGAL":"葡萄牙","SWEDEN":"瑞典","SWITZERLAND":"瑞士","SERBIA":"塞尔维亚","SPAIN":"西班牙","GREECE":"希腊","ITALY":"意大利","UK":"英国"};
// 国名简称（用于单位命名："德意志第1步兵师"）
const COUNTRY_SHORT = {"GERMANY":"德意志","UK":"英国","FRANCE":"法兰西","RUSSIA":"俄罗斯","AUSTRIA_HUNGARY":"奥匈","ITALY":"意大利","TURKEY":"奥斯曼","SPAIN":"西班牙","SERBIA":"塞尔维亚","BELGIUM":"比利时","BULGARIA":"保加利亚","ROMANIA":"罗马尼亚","GREECE":"希腊","ALBANIA":"阿尔巴尼亚","DENMARK":"丹麦","NETHERLANDS":"荷兰","MONTENEGRO":"黑山","LUXEMBOURG":"卢森堡","NORWAY":"挪威","PORTUGAL":"葡萄牙","SWEDEN":"瑞典","SWITZERLAND":"瑞士","FINLAND":"芬兰"};
// 兵种全称（用于单位命名）
const UNIT_FULL_NAME = {"infantry":"步兵师","engineer":"工兵师","cavalry":"骑兵师","artillery":"炮兵师","navy":"海军","submarine":"潜艇"};
// 兵种简称（用于快捷栏显示）
const UNIT_SHORT = {"infantry":"步","engineer":"工","cavalry":"骑","artillery":"炮","navy":"海","submarine":"潜"};
const TERRAIN_CN={"flat": "平原", "hills": "丘陵", "mountains": "山地", "urban": "都市"};
const BORDER_COLOR="rgba(180,140,80,0.2)",BORDER_WIDTH=1.0;
const PROVINCE_BORDER_COLOR="rgba(180,140,80,0.12)",PROVINCE_BORDER_WIDTH=0.5;
const CITY_DOT_RADIUS=3,CAPITAL_DOT_RADIUS=5;
const CITY_DOT_COLOR="#d4c0a0",CAPITAL_DOT_COLOR="#c8a830";
const CITY_NAME_COLOR="#d4c0a0",PORT_NAME_COLOR="#6a8aaa";
const CITY_NAME_FONT="11px \"Segoe UI\",sans-serif";
const CAPITAL_NAME_FONT="bold 12px \"Segoe UI\",sans-serif";
const ECONOMY_INTERVAL=30000,FACTORY_COST=50,FACTORY_BUILD_TIME=10,MAINTENANCE_COST=1.5;
const ZOOM_SPEED=0.15,PAN_SPEED=1,TOP_BAR_HEIGHT=40,BOTTOM_BAR_HEIGHT=48,BOTTOM_TAB_BAR_HEIGHT=36,TAB_PANEL_HEIGHT=350;
// 列强：不可被吞并或附属
const GREAT_POWERS = ['UK','FRANCE','GERMANY','AUSTRIA_HUNGARY','ITALY','RUSSIA'];
function isGreatPower(c) { return GREAT_POWERS.includes(c); }
// 附属国体系: VASSAL_OF[vassalCountry] = suzerainCountry
// 宗主国可在附属国领土自由行军；附属国20%收入上交宗主国
const VASSAL_OF = { FINLAND: 'RUSSIA' };
