// ============================================================
//  Iron & Dominion 1914 — 联机中继服务器
//  职责：房间管理、AI席位管理、消息转发
//  启动：npm run server  或  node server/server.js
// ============================================================

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 1914;
const HEARTBEAT = 15000;
const CLEANUP = 60000;
const ROOT = path.resolve(__dirname, '..');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const players = [...clients.values()].filter(c => c.roomId).length;
        res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, players }));
        return;
    }
    // 静态文件服务
    let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    filePath = path.join(ROOT, filePath);
    // 安全检查：防止路径穿越
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not Found'); return; }
        const ext = path.extname(filePath);
        const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
        // 图片文件添加 CORS 头，避免 canvas getImageData 跨域污染
        if (['.jpg','.jpeg','.png','.gif','.webp','.svg'].includes(ext)) {
            headers['Access-Control-Allow-Origin'] = '*';
            headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
        }
        res.writeHead(200, headers);
        res.end(data);
    });
});

const wss = new WebSocket.Server({ server });

// ===== 数据结构 =====
const rooms = new Map();       // roomId → Room
const clients = new Map();     // ws → ClientInfo
let cidCounter = 0;

// ===== 消息类型枚举 =====
const M = {
    // 房间
    CREATE_ROOM:    'create_room',
    JOIN_ROOM:      'join_room',
    LEAVE_ROOM:     'leave_room',
    ROOM_LIST:      'room_list',
    ROOM_UPDATE:    'room_update',
    ROOM_CLOSED:    'room_closed',
    // 席位
    SELECT_COUNTRY: 'select_country',
    ADD_AI:         'add_ai',
    REMOVE_AI:      'remove_ai',
    PLAYER_READY:   'player_ready',
    // 游戏
    GAME_START:     'game_start',
    GAME_SPEED:     'game_speed',
    STATE_FULL:     'state_full',
    STATE_DELTA:    'state_delta',
    PLAYER_ACTION:  'player_action',
    CHAT:           'chat',
    // 系统
    ERROR:          'error',
    PING:           'ping',
    PONG:           'pong',
};

// ===== 连接 =====
wss.on('connection', (ws, req) => {
    const cid = ++cidCounter;
    const info = { id: cid, roomId: null, name: null, country: null };
    clients.set(ws, info);
    console.log(`[+] #${cid} ${req.socket.remoteAddress}`);

    ws.isAlive = true;
    ws.on('pong', () => ws.isAlive = true);

    // 发送当前房间列表
    sendRoomList(ws);

    ws.on('message', raw => {
        try { handle(ws, info, JSON.parse(raw.toString())); }
        catch(e) { send(ws, M.ERROR, '无效消息'); }
    });

    ws.on('close', () => { disconnect(ws, info); clients.delete(ws); });
    ws.on('error', e => console.error(`[!] #${cid}: ${e.message}`));
});

// ===== 消息路由 =====
function handle(ws, info, msg) {
    const { type, payload } = msg;
    switch (type) {
        case M.PING: send(ws, M.PONG); break;
        case M.ROOM_LIST:  sendRoomList(ws); break;
        case M.CREATE_ROOM: createRoom(ws, info, payload); break;
        case M.JOIN_ROOM:   joinRoom(ws, info, payload); break;
        case M.LEAVE_ROOM:  leaveRoom(ws, info); break;
        case M.SELECT_COUNTRY: selectCountry(ws, info, payload); break;
        case M.ADD_AI:      addAI(ws, info, payload); break;
        case M.REMOVE_AI:   removeAI(ws, info, payload); break;
        case M.PLAYER_READY: setReady(ws, info, payload); break;
        case M.GAME_START:  startGame(ws, info); break;
        case M.GAME_SPEED:  if (isHost(info)) broadcast(info.roomId, msg, ws); break;
        case M.STATE_FULL: case M.STATE_DELTA:
            if (isHost(info)) broadcast(info.roomId, msg, ws); break;
        case M.PLAYER_ACTION: forwardToHost(info, msg); break;
        case M.CHAT: broadcast(info.roomId, { type: M.CHAT, payload: msg.payload, senderName: info.name }); break;
        default: if (info.roomId) broadcast(info.roomId, msg, ws);
    }
}

// ===== 房间管理 =====
function createRoom(ws, info, p) {
    if (info.roomId) return send(ws, M.ERROR, '已在房间中');
    const roomId = genId();
    const room = {
        id: roomId, name: p.name || `房间 ${roomId}`,
        password: p.password || null,
        host: info.id, maxPlayers: Math.min(8, Math.max(2, p.maxPlayers || 4)),
        seats: [], // { id, name, country, isAI, ready }
        createdAt: Date.now(), started: false,
    };
    // 房主占一个席位
    room.seats.push({ id: info.id, name: p.playerName || '房主', country: null, isAI: false, ready: false });
    rooms.set(roomId, room);
    info.roomId = roomId; info.name = p.playerName || '房主';
    send(ws, M.CREATE_ROOM, { roomId, room: sanitize(room), yourId: info.id });
    broadcastRoomList();
    console.log(`[房] ${room.name} (${roomId}) by ${info.name}`);
}

function joinRoom(ws, info, p) {
    if (info.roomId) return send(ws, M.ERROR, '已在房间中');
    const room = rooms.get(p.roomId);
    if (!room) return send(ws, M.ERROR, '房间不存在');
    if (room.started) return send(ws, M.ERROR, '游戏已开始');
    if (room.password && room.password !== p.password) return send(ws, M.ERROR, '密码错误');
    const humanCount = room.seats.filter(s => !s.isAI).length;
    if (humanCount >= room.maxPlayers) return send(ws, M.ERROR, '房间已满');

    const name = p.playerName || `玩家${info.id}`;
    room.seats.push({ id: info.id, name, country: null, isAI: false, ready: false });
    info.roomId = room.id; info.name = name;
    send(ws, M.JOIN_ROOM, { roomId: room.id, room: sanitize(room), yourId: info.id });
    broadcast(room.id, { type: M.ROOM_UPDATE, payload: sanitize(room) });
    broadcastRoomList();
    console.log(`[+] ${name} → ${room.name}`);
}

function leaveRoom(ws, info) {
    if (!info.roomId) return;
    const room = rooms.get(info.roomId);
    if (!room) { info.roomId = null; return; }
    if (room.host === info.id) {
        broadcast(room.id, M.ROOM_CLOSED, '房主已离开');
        rooms.delete(room.id);
        console.log(`[房] ${room.name} 关闭`);
    } else {
        room.seats = room.seats.filter(s => s.id !== info.id);
        broadcast(room.id, M.ROOM_UPDATE, sanitize(room));
    }
    info.roomId = null; info.name = null; info.country = null;
    broadcastRoomList();
}

function disconnect(ws, info) {
    if (!info.roomId) return;
    const room = rooms.get(info.roomId);
    if (!room) return;
    if (room.host === info.id) {
        broadcast(room.id, M.ROOM_CLOSED, '房主断开连接');
        rooms.delete(room.id);
        console.log(`[房] ${room.name} 房主断线`);
    } else {
        room.seats = room.seats.filter(s => s.id !== info.id);
        broadcast(room.id, M.ROOM_UPDATE, sanitize(room));
    }
    broadcastRoomList();
}

// ===== 席位管理 =====
function selectCountry(ws, info, p) {
    const room = rooms.get(info.roomId);
    if (!room) return;
    // 检查国家是否已被选
    if (p.country && room.seats.some(s => s.id !== info.id && s.country === p.country)) {
        return send(ws, M.ERROR, '该国家已被选择');
    }
    const seat = room.seats.find(s => s.id === info.id);
    if (seat) { seat.country = p.country; info.country = p.country; }
    broadcast(room.id, M.ROOM_UPDATE, sanitize(room));
}

function addAI(ws, info, p) {
    const room = rooms.get(info.roomId);
    if (!room || room.host !== info.id) return send(ws, M.ERROR, '仅房主可添加AI');
    if (room.started) return send(ws, M.ERROR, '游戏已开始');
    const total = room.seats.length;
    if (total >= room.maxPlayers) return send(ws, M.ERROR, '房间已满');
    const PLAYABLE = ['GERMANY','FRANCE','UK','AUSTRIA_HUNGARY','ITALY','RUSSIA','TURKEY','SPAIN'];
    if (p.country && !PLAYABLE.includes(p.country)) {
        return send(ws, M.ERROR, '只能选择八大列强之一');
    }
    if (p.country && room.seats.some(s => s.country === p.country)) {
        return send(ws, M.ERROR, '该国家已被选择');
    }
    const aiId = 'ai_' + (room._aiCounter = (room._aiCounter || 0) + 1);
    room.seats.push({ id: aiId, name: p.name || `AI-${aiId}`, country: p.country || null, isAI: true, ready: true });
    broadcast(room.id, M.ROOM_UPDATE, sanitize(room));
}

function removeAI(ws, info, p) {
    const room = rooms.get(info.roomId);
    if (!room || room.host !== info.id) return send(ws, M.ERROR, '仅房主可移除AI');
    room.seats = room.seats.filter(s => s.id !== p.aiId);
    broadcast(room.id, M.ROOM_UPDATE, sanitize(room));
}

function setReady(ws, info, p) {
    const room = rooms.get(info.roomId);
    if (!room) return;
    const seat = room.seats.find(s => s.id === info.id);
    if (seat) seat.ready = p.ready !== false;
    broadcast(room.id, M.ROOM_UPDATE, sanitize(room));
}

function startGame(ws, info) {
    const room = rooms.get(info.roomId);
    if (!room || room.host !== info.id) return send(ws, M.ERROR, '仅房主可开始');
    if (room.started) return send(ws, M.ERROR, '游戏已开始');
    // 所有人类玩家必须选国家
    const humans = room.seats.filter(s => !s.isAI);
    if (humans.some(s => !s.country)) return send(ws, M.ERROR, '所有玩家需选择国家');
    // 将未准备的人类玩家移除（他们的席位留给AI）
    const unreadyHumans = humans.filter(s => !s.ready);
    for (let uh of unreadyHumans) {
        room.seats = room.seats.filter(s => s.id !== uh.id);
    }
    // 自动填充剩余席位：8个可选列强中未被选中的全部设为AI
    const PLAYABLE = ['GERMANY','FRANCE','UK','AUSTRIA_HUNGARY','ITALY','RUSSIA','TURKEY','SPAIN'];
    const takenCountries = room.seats.map(s => s.country).filter(Boolean);
    let aiCounter = room._aiCounter || 0;
    for (let pc of PLAYABLE) {
        if (takenCountries.includes(pc)) continue;
        if (room.seats.length >= 8) break;
        aiCounter++;
        room.seats.push({ id: 'ai_' + aiCounter, name: 'AI-' + (aiCounter), country: pc, isAI: true, ready: true });
    }
    room._aiCounter = aiCounter;
    room.started = true;
    // 构建游戏开始负载
    const gameSeats = room.seats.map(s => ({ id: s.id, name: s.name, country: s.country, isAI: s.isAI }));
    broadcast(room.id, M.GAME_START, { seats: gameSeats, hostId: room.host, speed: 4 });
    broadcastRoomList();
    console.log(`[▶] ${room.name} 游戏开始 (${room.seats.length} 席位)`);
}

// ===== 消息转发 =====
function forwardToHost(info, msg) {
    if (!info.roomId) return;
    const room = rooms.get(info.roomId);
    if (!room) return;
    for (let [ws, ci] of clients) {
        if (ci.id === room.host && ci.roomId === room.id) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: msg.type, payload: msg.payload, senderId: info.id, senderName: info.name }));
            }
            return;
        }
    }
}

function broadcast(roomId, typeOrMsg, payload) {
    let msg;
    if (typeof typeOrMsg === 'string') msg = { type: typeOrMsg, payload };
    else msg = typeOrMsg;
    const raw = JSON.stringify(msg);
    for (let [ws, ci] of clients) {
        if (ci.roomId === roomId && ws.readyState === WebSocket.OPEN) ws.send(raw);
    }
}

function broadcastRoomList() {
    const list = [];
    for (let [id, room] of rooms) {
        if (!room.started) list.push({
            id, name: room.name,
            players: room.seats.filter(s => !s.isAI).length,
            maxPlayers: room.maxPlayers,
            hasPassword: !!room.password,
        });
    }
    const raw = JSON.stringify({ type: M.ROOM_LIST, payload: list });
    for (let [ws, ci] of clients) {
        if (!ci.roomId && ws.readyState === WebSocket.OPEN) ws.send(raw);
    }
}

function sendRoomList(ws) {
    const list = [];
    for (let [id, room] of rooms) {
        if (!room.started) list.push({
            id, name: room.name,
            players: room.seats.filter(s => !s.isAI).length,
            maxPlayers: room.maxPlayers,
            hasPassword: !!room.password,
        });
    }
    send(ws, M.ROOM_LIST, list);
}

// ===== 工具 =====
function send(ws, type, payload) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, payload }));
}

function isHost(info) { const r = rooms.get(info.roomId); return r && r.host === info.id; }

function sanitize(room) {
    return {
        id: room.id, name: room.name, hostId: room.host,
        maxPlayers: room.maxPlayers, started: room.started,
        hasPassword: !!room.password,
        seats: room.seats.map(s => ({ id: s.id, name: s.name, country: s.country, isAI: s.isAI, ready: s.ready })),
    };
}

function genId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

// ===== 定时任务 =====
setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false; ws.ping();
    });
}, HEARTBEAT);

setInterval(() => {
    const now = Date.now(), oneHour = 3600000;
    for (let [id, room] of rooms) {
        if (!room.started && now - room.createdAt > oneHour) {
            broadcast(id, M.ROOM_CLOSED, '房间已过期');
            rooms.delete(id);
        }
    }
    broadcastRoomList();
}, CLEANUP);

server.listen(PORT, () => {
    console.log('╔══════════════════════════════╗');
    console.log('║  铁与权柄：1914 — 联机服务器 ║');
    console.log(`║  端口: ${PORT}                  ║`);
    console.log('╚══════════════════════════════╝');
});