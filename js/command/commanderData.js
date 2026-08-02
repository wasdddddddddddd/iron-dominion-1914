// 一战指挥系统 — 指挥官数据（总司令 + 集团军指挥官）
// 字段: id(唯一) name(姓名) aura(总司令光环 {stat,value} | null) cap(可指挥上限)
//       atk(攻击%) hp(血量%) spd(移速%) logi(后勤%) stars(评星)
// 注意: 总司令列表第一位开局担任总司令，其余进入后备指挥官池

const COMMANDER_DATA = {

    GERMANY: {
        chiefs: [
            { id: 'GE_CHIEF_HINDENBURG', name: '保罗·冯·兴登堡', aura: { stat: 'hp', value: 0.08 }, cap: 16, atk: 0.05, hp: 0.20, spd: 0.05, logi: 0.40, stars: 5 },
            { id: 'GE_CHIEF_LUDENDORFF', name: '埃里希·鲁登道夫', aura: { stat: 'atk', value: 0.08 }, cap: 12, atk: 0.25, hp: 0.05, spd: 0.10, logi: 0.40, stars: 5 },
            { id: 'GE_CHIEF_FALKENHAYN', name: '埃里希·冯·法尔肯海因', aura: { stat: 'logi', value: 0.35 }, cap: 16, atk: 0.10, hp: 0.05, spd: 0.05, logi: 0.35, stars: 4 },
            { id: 'GE_CHIEF_MOLTKE', name: '赫尔穆特·冯·毛奇', aura: { stat: 'atk', value: 0.02 }, cap: 8, atk: 0, hp: 0, spd: 0, logi: 0, stars: 1 },
        ],
        commanders: [
            { id: 'GE_CMD_MACKENSEN', name: '奥古斯特·冯·马肯森', cap: 16, atk: 0.20, hp: 0.05, spd: 0.15, logi: 0.40, stars: 5 },
            { id: 'GE_CMD_HUTIER', name: '奥斯卡·冯·胡蒂尔', cap: 16, atk: 0.18, hp: 0.05, spd: 0.10, logi: 0.35, stars: 4 },
            { id: 'GE_CMD_KLUCK', name: '亚历山大·冯·克卢克', cap: 12, atk: 0.15, hp: 0.05, spd: 0.10, logi: 0, stars: 4 },
            { id: 'GE_CMD_EICHHORN', name: '赫尔曼·冯·艾希霍恩', cap: 20, atk: 0.05, hp: 0.15, spd: 0.05, logi: 0.35, stars: 4 },
            { id: 'GE_CMD_BUELOW', name: '卡尔·冯·比洛', cap: 12, atk: 0.10, hp: 0.10, spd: 0.05, logi: 0, stars: 3 },
            { id: 'GE_CMD_CROWNPRINCE', name: '威廉皇储', cap: 12, atk: 0.10, hp: 0.05, spd: 0, logi: 0.30, stars: 3 },
            { id: 'GE_CMD_HAUSEN', name: '马克斯·冯·豪森', cap: 12, atk: 0.05, hp: 0.08, spd: 0, logi: 0.25, stars: 2 },
            { id: 'GE_CMD_ALBRECHT', name: '阿尔布雷希特公爵', cap: 12, atk: 0, hp: 0.10, spd: 0, logi: 0.25, stars: 2 },
            { id: 'GE_CMD_FBELOW', name: '弗里茨·冯·贝洛', cap: 12, atk: 0.05, hp: 0.05, spd: 0, logi: 0.25, stars: 2 },
            { id: 'GE_CMD_STRANTZ', name: '阿布雷希特·冯·斯特兰茨', cap: 12, atk: 0, hp: 0.05, spd: 0, logi: 0, stars: 1 },
        ],
    },

    UK: {
        chiefs: [
            { id: 'UK_CHIEF_HAIG', name: '道格拉斯·黑格', aura: { stat: 'atk', value: 0.08 }, cap: 16, atk: 0.15, hp: 0.10, spd: 0.05, logi: 0.40, stars: 5 },
            { id: 'UK_CHIEF_KITCHENER', name: '赫伯特·基钦纳', aura: { stat: 'logi', value: 0.40 }, cap: 16, atk: 0.05, hp: 0.20, spd: 0, logi: 0.40, stars: 5 },
            { id: 'UK_CHIEF_FRENCH', name: '约翰·弗伦奇', aura: { stat: 'hp', value: 0.05 }, cap: 12, atk: 0.05, hp: 0.05, spd: 0.05, logi: 0, stars: 2 },
        ],
        commanders: [
            { id: 'UK_CMD_PLUMER', name: '赫伯特·普卢默', cap: 16, atk: 0.05, hp: 0.25, spd: 0.05, logi: 0.40, stars: 5 },
            { id: 'UK_CMD_ALLENBY', name: '埃德蒙·艾伦比', cap: 16, atk: 0.20, hp: 0.10, spd: 0.15, logi: 0.40, stars: 5 },
            { id: 'UK_CMD_ROBERTSON', name: '威廉·罗伯逊', cap: 20, atk: 0, hp: 0.15, spd: 0.05, logi: 0.35, stars: 4 },
            { id: 'UK_CMD_RAWLINSON', name: '亨利·罗林森', cap: 12, atk: 0.12, hp: 0.05, spd: 0.08, logi: 0.30, stars: 3 },
            { id: 'UK_CMD_BEATTY', name: '戴维·贝蒂', cap: 12, atk: 0.15, hp: 0, spd: 0.10, logi: 0, stars: 4 },
            { id: 'UK_CMD_JELLICOE', name: '约翰·杰利科', cap: 12, atk: 0.05, hp: 0.15, spd: 0, logi: 0.30, stars: 3 },
            { id: 'UK_CMD_BIRDWOOD', name: '赫伯特·伯德伍德', cap: 12, atk: 0.05, hp: 0.10, spd: 0.08, logi: 0, stars: 2 },
            { id: 'UK_CMD_MUNRO', name: '查尔斯·门罗', cap: 12, atk: 0, hp: 0.10, spd: 0.05, logi: 0.25, stars: 2 },
            { id: 'UK_CMD_SMITHDORRIEN', name: '霍勒斯·史密斯-多里恩', cap: 8, atk: 0.05, hp: 0.05, spd: 0.05, logi: 0, stars: 2 },
            { id: 'UK_CMD_CONGREVE', name: '威廉·康格里夫', cap: 8, atk: 0.08, hp: 0, spd: 0.05, logi: 0.25, stars: 2 },
        ],
    },

    FRANCE: {
        chiefs: [
            { id: 'FR_CHIEF_FOCH', name: '费迪南·福煦', aura: { stat: 'atk', value: 0.08 }, cap: 16, atk: 0.20, hp: 0.10, spd: 0.05, logi: 0.40, stars: 5 },
            { id: 'FR_CHIEF_PETAIN', name: '菲利普·贝当', aura: { stat: 'hp', value: 0.08 }, cap: 12, atk: 0, hp: 0.25, spd: 0.05, logi: 0.40, stars: 5 },
            { id: 'FR_CHIEF_JOFFRE', name: '约瑟夫·霞飞', aura: { stat: 'hp', value: 0.05 }, cap: 20, atk: 0.05, hp: 0.15, spd: 0.05, logi: 0.35, stars: 4 },
            { id: 'FR_CHIEF_NIVELLE', name: '罗伯特·尼维尔', aura: { stat: 'atk', value: 0.02 }, cap: 12, atk: 0, hp: 0, spd: 0, logi: 0, stars: 1 },
        ],
        commanders: [
            { id: 'FR_CMD_GALLIENI', name: '约瑟夫·加利埃尼', cap: 16, atk: 0.15, hp: 0.20, spd: 0.10, logi: 0.40, stars: 5 },
            { id: 'FR_CMD_FRANCHET', name: '弗朗谢·德斯佩雷', cap: 16, atk: 0.15, hp: 0.05, spd: 0.10, logi: 0.35, stars: 4 },
            { id: 'FR_CMD_GOURAUD', name: '约瑟夫·古罗', cap: 12, atk: 0.05, hp: 0.12, spd: 0.05, logi: 0.30, stars: 3 },
            { id: 'FR_CMD_BERTHELOT', name: '亨利·贝尔特洛', cap: 12, atk: 0.10, hp: 0.05, spd: 0, logi: 0.30, stars: 3 },
            { id: 'FR_CMD_AMBRU', name: '乔治·安布鲁', cap: 12, atk: 0.10, hp: 0.05, spd: 0, logi: 0.30, stars: 3 },
            { id: 'FR_CMD_MANGIN', name: '乔治·曼金', cap: 12, atk: 0.05, hp: 0.08, spd: 0, logi: 0.25, stars: 2 },
            { id: 'FR_CMD_DUBAIL', name: '奥古斯丁·迪巴伊', cap: 12, atk: 0, hp: 0.08, spd: 0.05, logi: 0, stars: 2 },
            { id: 'FR_CMD_CASTELNAU', name: '诺埃尔·德卡斯托', cap: 12, atk: 0.05, hp: 0.05, spd: 0, logi: 0, stars: 2 },
            { id: 'FR_CMD_MAUDHUY', name: '路易·德·莫德', cap: 8, atk: 0, hp: 0.05, spd: 0.05, logi: 0, stars: 2 },
        ],
    },

    RUSSIA: {
        chiefs: [
            { id: 'RU_CHIEF_ALEKSEYEV', name: '米哈伊尔·阿列克谢耶夫', aura: { stat: 'logi', value: 0.35 }, cap: 16, atk: 0.05, hp: 0.15, spd: 0.05, logi: 0.35, stars: 4 },
            { id: 'RU_CHIEF_GRANDDUKE', name: '尼古拉大公', aura: { stat: 'hp', value: 0.05 }, cap: 12, atk: 0.10, hp: 0.15, spd: 0.05, logi: 0, stars: 4 },
        ],
        commanders: [
            { id: 'RU_CMD_BRUSILOV', name: '阿列克谢·布鲁西洛夫', cap: 16, atk: 0.25, hp: 0.05, spd: 0.15, logi: 0.40, stars: 5 },
            { id: 'RU_CMD_KORNILOV', name: '拉夫尔·科尔尼洛夫', cap: 12, atk: 0.15, hp: 0.10, spd: 0.10, logi: 0, stars: 4 },
            { id: 'RU_CMD_DENIKIN', name: '安东·邓尼金', cap: 12, atk: 0.15, hp: 0.05, spd: 0.08, logi: 0.35, stars: 4 },
            { id: 'RU_CMD_YUDENICH', name: '尼古拉·尤登尼奇', cap: 12, atk: 0.10, hp: 0.12, spd: 0.10, logi: 0.35, stars: 4 },
            { id: 'RU_CMD_RUZSKY', name: '尼古拉·鲁兹斯基', cap: 12, atk: 0, hp: 0.10, spd: 0.05, logi: 0.25, stars: 2 },
            { id: 'RU_CMD_IVANOV', name: '阿列克谢·伊万诺夫', cap: 12, atk: 0, hp: 0.10, spd: 0.05, logi: 0.25, stars: 2 },
            { id: 'RU_CMD_PLEHVE', name: '帕维尔·普列韦', cap: 12, atk: 0.05, hp: 0.05, spd: 0, logi: 0.25, stars: 2 },
            { id: 'RU_CMD_DRAGOMIROV', name: '米哈伊尔·德拉戈米罗夫', cap: 12, atk: 0.05, hp: 0.05, spd: 0, logi: 0.25, stars: 2 },
        ],
    },

    AUSTRIA_HUNGARY: {
        chiefs: [
            { id: 'AH_CHIEF_KARL', name: '卡尔一世', aura: { stat: 'hp', value: 0.05 }, cap: 8, atk: 0, hp: 0.05, spd: 0, logi: 0.25, stars: 2 },
            { id: 'AH_CHIEF_CONRAD', name: '康拉德·冯·赫岑多夫', aura: { stat: 'atk', value: 0.02 }, cap: 12, atk: 0, hp: 0, spd: 0, logi: 0, stars: 1 },
        ],
        commanders: [
            { id: 'AH_CMD_BOROEVIC', name: '斯韦托扎尔·博罗耶维奇', cap: 16, atk: 0.05, hp: 0.20, spd: 0.05, logi: 0.40, stars: 5 },
            { id: 'AH_CMD_DANKL', name: '维克托·丹克尔', cap: 12, atk: 0.05, hp: 0.08, spd: 0.05, logi: 0.30, stars: 3 },
            { id: 'AH_CMD_AUFFENBERG', name: '莫里茨·冯·奥芬贝格', cap: 12, atk: 0.08, hp: 0.05, spd: 0, logi: 0.30, stars: 3 },
            { id: 'AH_CMD_KOVESS', name: '赫尔曼·科韦斯', cap: 12, atk: 0.08, hp: 0.05, spd: 0.05, logi: 0, stars: 3 },
            { id: 'AH_CMD_ETIENNE', name: '鲁道夫·冯·艾蒂安', cap: 12, atk: 0.05, hp: 0.05, spd: 0, logi: 0.25, stars: 2 },
            { id: 'AH_CMD_PFLANZER', name: '维克多·冯·普夫兰泽-巴洛', cap: 12, atk: 0.08, hp: 0, spd: 0.05, logi: 0.25, stars: 2 },
            { id: 'AH_CMD_HALMAYER', name: '约瑟夫·哈尔迈尔', cap: 8, atk: 0.05, hp: 0, spd: 0.05, logi: 0.25, stars: 2 },
        ],
    },

    ITALY: {
        chiefs: [
            { id: 'IT_CHIEF_DIAZ', name: '阿曼多·迪亚兹', aura: { stat: 'atk', value: 0.08 }, cap: 12, atk: 0.15, hp: 0.10, spd: 0.08, logi: 0.40, stars: 5 },
            { id: 'IT_CHIEF_CADORNA', name: '路易吉·卡多尔纳', aura: null, cap: 8, atk: 0, hp: 0, spd: 0, logi: 0, stars: 1 },
        ],
        commanders: [
            { id: 'IT_CMD_ORFILA', name: '埃马努埃莱·奥菲拉', cap: 12, atk: 0.08, hp: 0.08, spd: 0.05, logi: 0, stars: 3 },
            { id: 'IT_CMD_MARIATO', name: '安吉洛·马里亚托', cap: 12, atk: 0.08, hp: 0, spd: 0.05, logi: 0.25, stars: 2 },
            { id: 'IT_CMD_BATISTA', name: '罗伯托·巴蒂斯塔', cap: 8, atk: 0.08, hp: 0.05, spd: 0.05, logi: 0, stars: 2 },
        ],
    },

    SPAIN: {
        chiefs: [
            { id: 'SP_CHIEF_PRIMODERIVERA', name: '何塞·普里莫·德里维拉', aura: { stat: 'atk', value: 0.05 }, cap: 12, atk: 0.08, hp: 0.05, spd: 0.05, logi: 0.30, stars: 3 },
        ],
        commanders: [
            { id: 'SP_CMD_MIGUELPRIMO', name: '米格尔·普里莫·德·里维拉', cap: 12, atk: 0.10, hp: 0.05, spd: 0.08, logi: 0.30, stars: 3 },
            { id: 'SP_CMD_MOLA', name: '何塞·莫拉', cap: 12, atk: 0.05, hp: 0.10, spd: 0.05, logi: 0.30, stars: 3 },
            { id: 'SP_CMD_TOLEDO', name: '卡洛斯·托莱多', cap: 12, atk: 0.05, hp: 0.10, spd: 0.05, logi: 0, stars: 2 },
        ],
    },

    TURKEY: {
        chiefs: [
            { id: 'TU_CHIEF_SANDERS', name: '利曼·冯·桑德斯', aura: { stat: 'hp', value: 0.08 }, cap: 16, atk: 0.10, hp: 0.15, spd: 0.05, logi: 0.40, stars: 5 },
            { id: 'TU_CHIEF_ENVER', name: '恩维尔帕夏', aura: { stat: 'atk', value: 0.05 }, cap: 12, atk: 0.05, hp: 0.05, spd: 0.05, logi: 0, stars: 2 },
        ],
        commanders: [
            { id: 'TU_CMD_KEMAL', name: '穆斯塔法·凯末尔', cap: 16, atk: 0.25, hp: 0.20, spd: 0.15, logi: 0.40, stars: 5 },
            { id: 'TU_CMD_FAVZI', name: '费夫齐·帕夏', cap: 12, atk: 0.10, hp: 0.10, spd: 0.05, logi: 0, stars: 4 },
            { id: 'TU_CMD_NURI', name: '努尔·帕夏', cap: 12, atk: 0.05, hp: 0.08, spd: 0.08, logi: 0, stars: 3 },
            { id: 'TU_CMD_ALIRIZA', name: '阿里·里扎·帕夏', cap: 12, atk: 0, hp: 0.08, spd: 0.05, logi: 0.25, stars: 2 },
            { id: 'TU_CMD_HASAN', name: '哈桑·伊泽特·帕夏', cap: 12, atk: 0, hp: 0.08, spd: 0.05, logi: 0.25, stars: 2 },
        ],
    },

    SERBIA: {
        chiefs: [
            { id: 'SR_CHIEF_PUTNIK', name: '拉多米尔·普特尼克', aura: { stat: 'hp', value: 0.08 }, cap: 12, atk: 0.05, hp: 0.12, spd: 0.05, logi: 0.35, stars: 4 },
        ],
        commanders: [],
    },

    BULGARIA: {
        chiefs: [
            { id: 'BG_CHIEF_JIKOV', name: '尼古拉·日科夫', aura: { stat: 'atk', value: 0.08 }, cap: 12, atk: 0.10, hp: 0.05, spd: 0.05, logi: 0, stars: 4 },
        ],
        commanders: [],
    },

    ROMANIA: {
        chiefs: [
            { id: 'RO_CHIEF_PREZAN', name: '康斯坦丁·普雷赞', aura: { stat: 'hp', value: 0.06 }, cap: 12, atk: 0.05, hp: 0.10, spd: 0, logi: 0.30, stars: 3 },
        ],
        commanders: [],
    },

    GREECE: {
        chiefs: [
            { id: 'GR_CHIEF_CONSTANTINE1', name: '康斯坦丁一世（国王）', aura: { stat: 'spd', value: 0.05 }, cap: 12, atk: 0, hp: 0.08, spd: 0.05, logi: 0, stars: 2 },
        ],
        commanders: [],
    },

    MONTENEGRO: {
        chiefs: [
            { id: 'MO_CHIEF_NIKOLAI1', name: '尼古拉一世（国王）', aura: { stat: 'spd', value: 0.05 }, cap: 12, atk: 0.05, hp: 0, spd: 0.05, logi: 0, stars: 2 },
        ],
        commanders: [],
    },

    BELGIUM: {
        chiefs: [
            { id: 'BE_CHIEF_ALBERT1', name: '阿尔贝一世（国王）', aura: { stat: 'hp', value: 0.08 }, cap: 12, atk: 0.05, hp: 0.15, spd: 0, logi: 0.35, stars: 4 },
        ],
        commanders: [],
    },

    NETHERLANDS: {
        chiefs: [
            { id: 'NL_CHIEF_SNYDERS', name: '科内利斯·斯奈德斯', aura: { stat: 'hp', value: 0.05 }, cap: 12, atk: 0, hp: 0.08, spd: 0, logi: 0.25, stars: 2 },
        ],
        commanders: [],
    },

    LUXEMBOURG: {
        chiefs: [
            { id: 'LX_CHIEF_MARIEADELAIDE', name: '玛丽·阿黛拉伊德（女大公）', aura: null, cap: 8, atk: 0, hp: 0, spd: 0, logi: 0, stars: 1 },
        ],
        commanders: [],
    },

    SWEDEN: {
        chiefs: [
            { id: 'SW_CHIEF_GUSTAV5', name: '古斯塔夫五世（国王）', aura: { stat: 'hp', value: 0.03 }, cap: 12, atk: 0, hp: 0.05, spd: 0, logi: 0, stars: 2 },
        ],
        commanders: [],
    },

    NORWAY: {
        chiefs: [
            { id: 'NO_CHIEF_HAAKON7', name: '哈康七世（国王）', aura: { stat: 'hp', value: 0.03 }, cap: 12, atk: 0, hp: 0.05, spd: 0, logi: 0, stars: 2 },
        ],
        commanders: [],
    },

    DENMARK: {
        chiefs: [
            { id: 'DN_CHIEF_CHRISTIAN10', name: '克里斯蒂安十世（国王）', aura: { stat: 'spd', value: 0.03 }, cap: 12, atk: 0, hp: 0.05, spd: 0.03, logi: 0, stars: 2 },
        ],
        commanders: [],
    },

    SWITZERLAND: {
        chiefs: [
            { id: 'CH_CHIEF_WILLE', name: '乌尔里希·维勒', aura: { stat: 'hp', value: 0.05 }, cap: 12, atk: 0, hp: 0.10, spd: 0, logi: 0.25, stars: 2 },
        ],
        commanders: [],
    },

    PORTUGAL: {
        chiefs: [
            { id: 'PT_CHIEF_TAMAGNINI', name: '费尔南多·塔马尼尼', aura: [{ stat: 'atk', value: 0.06 }, { stat: 'logi', value: -0.08 }], cap: 12, atk: 0.12, hp: 0.05, spd: 0.05, logi: 0, stars: 4 },
        ],
        commanders: [],
    },

    ALBANIA: {
        chiefs: [
            { id: 'AL_CHIEF_VID', name: '威廉·冯·维德（亲王）', aura: null, cap: 8, atk: 0, hp: 0, spd: 0, logi: 0, stars: 1 },
        ],
        commanders: [],
    },
};
