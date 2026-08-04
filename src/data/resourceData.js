// ============================================================
//  Iron & Dominion 1914 — 城市资源数据（粮食/铁矿）
//  等级 T1~T5：T1=基础产出 … T5=顶级产出
//  数组格式: [粮食当前, 粮食潜力, 铁矿当前, 铁矿潜力]
//  未收录的城市默认 T1/T1（普通城市，无法升级）
// ============================================================

// 粮食等级产出系数
const RES_GRADE_MULT = { 1: 1.0, 2: 1.5, 3: 2.2, 4: 3.2, 5: 4.5 };
// 城市规模系数（首都/大城市/小城市）
const RES_SIZE_MULT = { capital: 1.2, major: 1.0, small: 0.8 };
// 基础月产出：粮食 = 75 × 等级系数 × 规模系数（×5 与部队补给消耗 30/师/月 对齐，替代旧 grainPerMonth 60-120）；
// 铁矿 = 10 × 等级系数
const RES_GRAIN_BASE = 75;
const RES_IRON_BASE = 10;
// 升级费用/耗时（T1→T2 … T4→T5）
const RES_UPGRADE_COST = { 1: 100, 2: 250, 3: 500, 4: 1000 };
const RES_UPGRADE_DAYS = { 1: 15, 2: 30, 3: 45, 4: 60 };

// 港口城市列表（港口可通过海路把资源运抵首都；被敌方海军封锁则中断）
const PORT_CITY_IDS = new Set([
    // 德国
    'hamburg','bremen','kiel','wilhelmshaven','rostock','stettin','danzig','konigsberg',
    // 英国
    'london','liverpool','glasgow','southampton','portsmouth','plymouth','hull','bristol',
    'aberdeen','belfast','cardiff','newcastle','dover','scapa',
    // 法国
    'brest','toulon','marseille','nantes','st_nazaire','bordeaux','cherbourg','dieppe','boulogne','nice','dunkirk',
    // 俄国
    'saint_petersburg','odessa','sevastopol','riga',
    // 奥匈
    'pola','fiume','cattaro','spalato','trieste',
    // 意大利
    'genoa','naples','venice','palermo','taranto','ancona','cagliari','messina','brindisi',
    'bari','livorno','la_spezia','savona','reggio','catania','syracuse',
    // 土耳其
    'istanbul','izmir','adrianople','trebizond',
    // 西班牙
    'barcelona','bilbao','seville','malaga','valencia_sp','san_sebastian',
    // 葡萄牙
    'lisbon','porto','faro',
    // 荷兰
    'amsterdam','rotterdam',
    // 比利时
    'antwerp','ostend','bruges',
    // 丹麦
    'copenhagen','aarhus','aalborg','odense','esbjerg',
    // 瑞典
    'stockholm','gothenburg','malmo',
    // 挪威
    'oslo','bergen','trondheim','stavanger','narvik','tromso',
    // 芬兰
    'helsinkifi','turku','viipuri','vaasa','oulu',
    // 希腊
    'athens','thessaloniki','patras','heraklion','corfu',
    // 保加利亚
    'varna','burgas',
    // 罗马尼亚
    'constanta','galati',
    // 黑山
    'bar_mn',
    // 阿尔巴尼亚
    'durres','valona',
]);

// 各国城市资源数据（按城市 id，格式 [粮cur, 粮pot, 铁cur, 铁pot]）
const RESOURCE_DATA = {
    // ===== 德国 =====
    'berlin':          [2,3, 2,2],
    'essen':           [1,1, 3,5],
    'dortmund':        [1,1, 2,5],
    'duisburg':        [1,1, 2,5],
    'cologne':         [2,2, 2,3],
    'leipzig':         [2,2, 2,3],
    'dresden':         [2,2, 2,3],
    'frankfurt':       [2,2, 1,2],
    'nuremberg':       [1,2, 1,2],
    'munich':          [2,2, 1,1],
    'stuttgart':       [1,2, 1,1],
    'hamburg':         [1,2, 2,3],
    'bremen':          [1,2, 1,2],
    'hannover':        [1,2, 1,1],
    'magdeburg':       [1,2, 1,2],
    'konigsberg':      [2,3, 1,1],
    'danzig':          [2,3, 1,1],
    'posen':           [2,3, 1,1],
    'breslau':         [1,3, 1,2],
    'saarbruecken':    [1,1, 2,4],
    'strasbourg':      [1,2, 2,4],
    'metz':            [1,2, 2,4],
    'krefeld':         [1,1, 1,3],
    'kiel':            [1,1, 1,2],
    'wilhelmshaven':   [1,1, 1,2],
    'rostock':         [1,2, 1,1],
    'stettin':         [1,2, 1,1],
    'mannheim':        [1,2, 1,1],
    'karlsruhe':       [1,2, 1,1],
    'regensburg':      [1,2, 1,1],
    'chemnitz':        [1,1, 1,2],
    'halle':           [1,2, 1,1],
    'erfurt':          [1,2, 1,1],
    // ===== 英国 =====
    'london':          [2,2, 2,3],
    'birmingham':      [1,1, 2,4],
    'manchester':      [1,1, 2,4],
    'liverpool':       [1,1, 2,3],
    'cardiff':         [1,1, 2,4],
    'newcastle':       [1,1, 1,3],
    'glasgow':         [1,1, 2,3],
    'edinburgh':       [1,2, 1,1],
    'dublin':          [1,2, 1,1],
    'belfast':         [1,1, 1,2],
    'norwich':         [2,3, 1,1],
    'hull':            [2,3, 1,1],
    'leeds':           [1,1, 1,3],
    'sheffield':       [1,1, 1,3],
    'nottingham':      [1,1, 1,2],
    'plymouth':        [1,2, 1,1],
    'southampton':     [1,2, 1,1],
    'bristol':         [1,2, 1,1],
    'portsmouth':      [1,2, 1,1],
    'aberdeen':        [1,2, 1,1],
    // ===== 法国 =====
    'paris':           [3,5, 1,1],
    'lyon':            [2,4, 1,1],
    'bordeaux':        [2,4, 1,1],
    'toulouse':        [2,4, 1,1],
    'nantes':          [1,3, 1,1],
    'lille':           [1,1, 1,3],
    'rouen':           [1,3, 1,1],
    'nancy':           [1,2, 2,4],
    'verdun':          [1,2, 2,4],
    'dijon':           [1,3, 1,1],
    'orleans_fr':      [1,3, 1,1],
    'marseille':       [1,3, 1,1],
    'nice':            [1,2, 1,1],
    'toulon':          [1,2, 1,1],
    'brest':           [1,2, 1,1],
    'st_etienne':      [1,1, 1,2],
    'grenoble_fr':     [1,2, 1,1],
    'montpellier':     [1,2, 1,1],
    'amiens':          [1,2, 1,1],
    'reims':           [1,2, 1,1],
    'tours':           [1,3, 1,1],
    // ===== 俄国 =====
    'saint_petersburg':[1,2, 1,2],
    'moscow':          [1,2, 1,3],
    'kiev':            [2,5, 1,1],
    'kharkov':         [2,4, 2,4],
    'odessa':          [2,4, 1,1],
    'ekaterinoslav':   [2,4, 2,4],
    'lugansk':         [1,1, 2,5],
    'ekaterinburg':    [1,1, 2,4],
    'perm':            [1,1, 1,3],
    'kazan':           [1,3, 1,1],
    'samara':          [1,3, 1,1],
    'saratov':         [1,3, 1,1],
    'tsaritsyn':       [1,3, 1,1],
    'minsk':           [1,3, 1,1],
    'vitebsk':         [1,3, 1,1],
    'warsaw':          [1,3, 1,1],
    'riga':            [1,2, 1,1],
    'tula':            [1,1, 1,2],
    'nizhny':          [1,2, 1,1],
    'voronezh':        [1,3, 1,1],
    'rostov':          [1,3, 1,1],
    // ===== 奥匈 =====
    'vienna':          [1,2, 1,2],
    'budapest':        [2,4, 1,1],
    'prague':          [1,2, 2,4],
    'brunn':           [1,1, 1,3],
    'szeged':          [2,4, 1,1],
    'debrecen':        [2,4, 1,1],
    'kassa':           [1,3, 1,1],
    'krakow':          [1,2, 1,2],
    'lemberg':         [1,3, 1,1],
    'trieste':         [1,2, 1,1],
    'zagreb':          [1,3, 1,1],
    'sarajevo':        [1,2, 1,1],
    'bratislava':      [1,2, 1,1],
    'olmuetz':         [1,2, 1,1],
    'pecs':            [1,3, 1,1],
    // ===== 意大利 =====
    'rome':            [1,2, 1,1],
    'milan':           [1,2, 1,2],
    'turin':           [1,2, 1,2],
    'genoa':           [1,1, 1,1],
    'naples':          [1,3, 1,1],
    'palermo':         [1,3, 1,1],
    'florence':        [1,2, 1,1],
    'bologna':         [1,3, 1,1],
    'venice':          [1,2, 1,1],
    'pisa':            [1,2, 1,1],
    'ancona':          [1,2, 1,1],
    'catania':         [1,2, 1,1],
    // ===== 奥斯曼 =====
    'istanbul':        [1,2, 1,1],
    'adrianople':      [1,2, 1,1],
    // ===== 西班牙 =====
    'madrid':          [1,2, 1,1],
    'barcelona':       [1,2, 1,2],
    'bilbao':          [1,1, 1,3],
    'seville':         [1,2, 1,1],
    'valencia_sp':     [1,2, 1,1],
    // ===== 葡萄牙 =====
    'lisbon':          [1,2, 1,1],
    'porto':           [1,2, 1,1],
    // ===== 比利时 =====
    'brussels':        [1,2, 1,1],
    'antwerp':         [1,2, 1,2],
    'liege':           [1,1, 1,3],
    // ===== 荷兰 =====
    'amsterdam':       [1,2, 1,1],
    'rotterdam':       [1,2, 1,1],
    'thehague':        [1,2, 1,1],
    // ===== 丹麦 =====
    'copenhagen':      [1,2, 1,1],
    'aarhus':          [1,2, 1,1],
    // ===== 瑞典 =====
    'stockholm':       [1,2, 1,3],
    'kiruna':          [1,1, 2,5],
    'gothenburg':      [1,2, 1,1],
    // ===== 挪威 =====
    'oslo':            [1,2, 1,1],
    'bergen':          [1,2, 1,1],
    // ===== 瑞士 =====
    'bern':            [1,2, 1,1],
    'zurich':          [1,2, 1,1],
    'geneva':          [1,2, 1,1],
    'basel':           [1,2, 1,1],
    // ===== 塞尔维亚 =====
    'belgrade':        [1,3, 1,1],
    'nis':             [1,3, 1,1],
    // ===== 保加利亚 =====
    'sofia':           [1,3, 1,1],
    'plovdiv':         [1,3, 1,1],
    'varna':           [1,2, 1,1],
    // ===== 罗马尼亚 =====
    'bucharest':       [2,4, 1,1],
    'iasi':            [1,3, 1,1],
    'cluj':            [1,3, 1,1],
    'brasov':          [1,2, 1,1],
    'constanta':       [1,3, 1,1],
    // ===== 希腊 =====
    'athens':          [1,3, 1,1],
    'thessaloniki':    [1,3, 1,1],
    // ===== 黑山 =====
    'podgorica':       [1,2, 1,1],
    'cetinje':         [1,2, 1,1],
    'bar_mn':          [1,2, 1,1],
    // ===== 阿尔巴尼亚 =====
    'tirana':          [1,2, 1,1],
    'durres':          [1,2, 1,1],
    'valona':          [1,2, 1,1],
    // ===== 芬兰 =====
    'helsinkifi':      [1,2, 1,1],
    'turku':           [1,2, 1,1],
    'viipuri':         [1,2, 1,1],
    'vaasa':           [1,2, 1,1],
    'oulu':            [1,2, 1,1],
    // ===== 补充主要城市 =====
    'aachen':          [1,2, 1,2],
    'sevastopol':      [1,1, 1,3],
    'brasso':          [1,2, 1,1],
    'zaragoza':        [1,2, 1,1],
    'izmir':           [2,3, 1,1],
    'ankara':          [1,2, 1,1],
    'trebizond':       [1,2, 1,1],
    'charleroi':       [1,1, 1,2],
    'malmo':           [1,2, 1,1],
    // ===== 卢森堡 =====
    'luxembourg':      [1,2, 1,1],
    // ===== 1914 增补（用户数据，粮/铁潜力） =====
    // 德国
    'potsdam':         [1,2, 1,1],
    // 英国
    'coventry':        [1,1, 1,2],
    // 法国
    'valenciennes':    [1,1, 1,3],
    'dunkirk':         [1,1, 1,2],
    // 俄国
    'zaporozhye':      [1,3, 1,1],
    'kherson':         [1,3, 1,1],
    'poltava':         [1,3, 1,1],
    'chernigov':       [1,3, 1,1],
    'zhitomir':        [1,3, 1,1],
    'vinnitsa':        [1,3, 1,1],
    'chernovtsy':      [1,2, 1,1],
    'ivano_frankovsk': [1,2, 1,1],
    'orel':            [1,2, 1,1],
    'kursk':           [1,3, 1,1],
    'bryansk':         [1,2, 1,2],
    'ryazan':          [1,2, 1,1],
    'tambov':          [1,3, 1,1],
    'mogilev':         [1,3, 1,1],
    'gomel':           [1,3, 1,1],
    'kaunas':          [1,3, 1,1],
    // 奥匈
    'linz':            [1,1, 1,2],
    'graz':            [1,1, 1,2],
    'fiume':           [1,2, 1,1],
    'ostrava':         [1,1, 1,3],
    // 意大利
    'bari':            [1,2, 1,1],
    'cagliari':        [1,2, 1,1],
    // 比利时
    'ghent':           [1,2, 1,1],
    'bruges':          [1,2, 1,1],
    // 荷兰
    'utrecht':         [1,2, 1,1],
    'groningen':       [1,2, 1,1],
    // 瑞典
    'uppsala':         [1,2, 1,1],
    // 挪威
    'trondheim':       [1,2, 1,1],
    'stavanger':       [1,2, 1,1],
    // 丹麦
    'esbjerg':         [1,2, 1,1],
    'aalborg':         [1,2, 1,1],
    // 瑞士
    'lausanne':        [1,2, 1,1],
    // 西班牙
    'malaga':          [1,2, 1,1],
    // 葡萄牙
    'coimbra':         [1,2, 1,1],
    // 罗马尼亚
    'craiova':         [1,3, 1,1],
    'galati':          [1,3, 1,1],
    // 保加利亚
    'ruse':            [1,3, 1,1],
    'stara_zagora':    [1,3, 1,1],
    // 塞尔维亚
    'kragujevac':      [1,3, 1,1],
    // 希腊
    'patras':          [1,3, 1,1],
    'larissa':         [1,3, 1,1],
    // 土耳其
    'janina':          [1,2, 1,1],
};
