// ============================================================
//  Iron & Dominion 1914 — 工厂分布（按城市等级均匀分布）
//  首都：3个工厂
//  较大城市：2个工厂
//  其余城市：0个工厂
// ============================================================
const CITY_FACTORIES = {
    // ===== 德国 =====
    'berlin': 3, 'hamburg': 2, 'munich': 2, 'cologne': 2, 'frankfurt': 2,
    'leipzig': 2, 'dresden': 2, 'nuremberg': 2, 'breslau': 2, 'danzig': 2, 'konigsberg': 2,
    'bremen': 2, 'hannover': 2, 'aachen': 2, 'rostock': 2, 'kiel': 2, 'strasbourg': 2,
    // ===== 法国 =====
    'paris': 3, 'lyon': 2, 'marseille': 2, 'bordeaux': 2, 'lille': 2,
    'toulouse': 2, 'nice': 2, 'nantes': 2,
    'reims': 2, 'verdun': 2, 'amiens': 2, 'orleans_fr': 2,
    // ===== 英国 =====
    'london': 3, 'manchester': 2, 'birmingham': 2, 'glasgow': 2, 'liverpool': 2,
    'edinburgh': 2, 'bristol': 2, 'leeds': 2, 'dublin': 2,
    // ===== 意大利 =====
    'rome': 3, 'milan': 2, 'naples': 2, 'turin': 2, 'genoa': 2,
    'venice': 2, 'florence': 2, 'palermo': 2, 'trieste': 2,
    // ===== 俄国 =====
    'moscow': 3, 'saint_petersburg': 2, 'kiev': 2, 'odessa': 2, 'warsaw': 2,
    'minsk': 2, 'riga': 2,
    'rostov': 2, 'sevastopol': 2,
    // ===== 奥匈帝国 =====
    'vienna': 3, 'budapest': 2, 'prague': 2, 'krakow': 2, 'zagreb': 2,
    'bratislava': 2, 'lemberg': 2, 'kassa': 2, 'brasso': 2,
    // ===== 土耳其 =====
    'istanbul': 3, 'ankara': 2, 'izmir': 2,
    // ===== 西班牙 =====
    'madrid': 3, 'barcelona': 2, 'seville': 2, 'bilbao': 2, 'valencia_sp': 2,
    'zaragoza': 2,
    // ===== 荷兰 =====
    'amsterdam': 3, 'rotterdam': 2, 'thehague': 2,
    // ===== 比利时 =====
    'brussels': 3, 'antwerp': 2, 'liege': 2, 'charleroi': 2,
    // ===== 瑞典 =====
    'stockholm': 3, 'gothenburg': 2, 'malmo': 2,
    // ===== 挪威 =====
    'oslo': 3, 'bergen': 2,
    // ===== 丹麦 =====
    'copenhagen': 3, 'aarhus': 2,
    // ===== 罗马尼亚 =====
    'bucharest': 3, 'brasov': 2, 'cluj': 2, 'iasi': 2, 'constanta': 2,
    // ===== 保加利亚 =====
    'sofia': 3, 'plovdiv': 2, 'varna': 2,
    // ===== 塞尔维亚 =====
    'belgrade': 3, 'nis': 2,
    // ===== 希腊 =====
    'athens': 3, 'thessaloniki': 2,
    // ===== 葡萄牙 =====
    'lisbon': 3, 'porto': 2,
    // ===== 芬兰 =====
    'helsinkifi': 3, 'turku': 2,
    // ===== 瑞士 =====
    'zurich': 2, 'basel': 2,
    // ===== 黑山 =====
    'cetinje': 2,
    // ===== 阿尔巴尼亚 =====
    'durres': 2,
    // ===== 卢森堡 =====
    'luxembourg': 2,
};
