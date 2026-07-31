// ============================================================
//  Iron & Dominion 1914 — 联机客户端模块
//  负责：WebSocket连接、房间大厅、状态同步、操作转发
// ============================================================

window.MP = (function() {
    'use strict';

    // ─── 内部状态 ─────────────────────────────────
    let ws = null;
    let serverUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.host || 'localhost:1914');
    let mode = null;          // 'host' | 'client'
    let myId = null;
    let roomId = null;
    let roomData = null;
    let gameSeats = [];       // 开局席位列表
    let connected = false;
    let lastFullSync = 0;
    const FULL_SYNC_INTERVAL = 2500;  // Host每2.5秒发一次完整快照
    const DELTA_INTERVAL = 200;        // Host每200ms发一次增量位置
    let lastDeltaTime = 0;
    let pendingActions = [];

    // 八大可选列强
    const PLAYABLE = ['GERMANY','FRANCE','UK','AUSTRIA_HUNGARY','ITALY','RUSSIA','TURKEY','SPAIN'];
    const PLAYABLE_CN = {
        GERMANY:'德意志帝国', FRANCE:'法兰西共和国', UK:'大不列颠',
        AUSTRIA_HUNGARY:'奥匈帝国', ITALY:'意大利王国', RUSSIA:'俄罗斯帝国',
        TURKEY:'奥斯曼帝国', SPAIN:'西班牙王国',
    };

    // ─── 消息类型 ─────────────────────────────────
    const M = {
        CREATE_ROOM:'create_room', JOIN_ROOM:'join_room', LEAVE_ROOM:'leave_room',
        ROOM_LIST:'room_list', ROOM_UPDATE:'room_update', ROOM_CLOSED:'room_closed',
        SELECT_COUNTRY:'select_country', ADD_AI:'add_ai', REMOVE_AI:'remove_ai',
        PLAYER_READY:'player_ready', GAME_START:'game_start', GAME_SPEED:'game_speed',
        STATE_FULL:'state_full', STATE_DELTA:'state_delta', PLAYER_ACTION:'player_action',
        CHAT:'chat', ERROR:'error', PING:'ping', PONG:'pong',
    };

    // ─── 连接管理 ─────────────────────────────────
    let wsEpoch = 0;
    function connect(url) {
        if (url) serverUrl = url;
        const epoch = ++wsEpoch;
        if (ws) {
            // 解除旧连接的处理器，防止其 onclose 干扰新连接状态
            ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
            try { ws.close(); } catch(e) {}
            ws = null;
        }
        return new Promise((resolve, reject) => {
            ws = new WebSocket(serverUrl);
            ws.onopen = () => {
                if (epoch !== wsEpoch) return;
                connected = true;
                pingLoop();
                resolve();
            };
            ws.onerror = () => {
                if (epoch !== wsEpoch) return;
                reject(new Error('连接失败'));
            };
            ws.onmessage = e => {
                try { onMessage(JSON.parse(e.data)); }
                catch(ex) { console.warn('[MP] 消息解析失败:', ex); }
            };
            ws.onclose = () => {
                if (epoch !== wsEpoch) return;
                connected = false;
                if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
                if (mode === 'host') addGameLog('与服务器断开连接');
                mode = null; roomId = null; roomData = null;
                // 刷新面板，避免显示与真实状态不一致
                const panel = document.getElementById('mpConnectPanel');
                if (panel && panel.style.display !== 'none') renderConnectionPanel();
            };
        });
    }

    function disconnect() {
        if (ws) { send(M.LEAVE_ROOM); ws.close(); }
        connected = false; mode = null; roomId = null;
    }

    function send(type, payload) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, payload }));
        }
    }

    let pingTimer = null;
    function pingLoop() {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:M.PING})); }, 8000);
    }

    // ─── 消息处理 ─────────────────────────────────
    function onMessage(msg) {
        switch (msg.type) {
            case M.PONG: break;
            case M.ERROR:
                showToast(msg.payload);
                break;
            case M.CREATE_ROOM:
                mode = 'host'; roomId = msg.payload.roomId; roomData = msg.payload.room;
                myId = msg.payload.yourId;
                showRoomLobby();
                break;
            case M.JOIN_ROOM:
                mode = 'client'; roomId = msg.payload.roomId; roomData = msg.payload.room;
                myId = msg.payload.yourId;
                showRoomLobby();
                break;
            case M.ROOM_UPDATE:
                roomData = msg.payload;
                myId = findMySeatId();
                updateRoomLobby();
                break;
            case M.ROOM_LIST:
                updateRoomList(msg.payload);
                break;
            case M.ROOM_CLOSED:
                showToast(msg.payload);
                mode = null; roomId = null; roomData = null;
                hideRoomLobby();
                hideConnectionPanel();
                break;
            case M.GAME_START:
                gameSeats = msg.payload.seats;
                startMultiplayerGame(msg.payload);
                break;
            case M.GAME_SPEED:
                if (mode === 'client' && G.speed !== undefined) {
                    G.speed = msg.payload;
                }
                break;
            case M.STATE_FULL:
                if (mode === 'client') applyFullState(msg.payload);
                break;
            case M.STATE_DELTA:
                if (mode === 'client') applyDelta(msg.payload);
                break;
            case M.PLAYER_ACTION:
                if (mode === 'host') handleRemoteAction(msg);
                break;
            case M.CHAT:
                addChatMessage(msg.senderName || '系统', msg.payload);
                break;
        }
    }

    function findMySeatId() {
        if (!roomData || !roomData.seats) return null;
        const seat = roomData.seats.find(s => s.id === myId);
        return seat ? seat.id : null;
    }

    // ─── 房间大厅 ─────────────────────────────────
    function showRoomLobby() {
        if (!roomData) return;
        const panel = getOrCreateEl('mpRoomLobby');
        panel.style.display = 'flex';
        renderRoomLobby();
        hideConnectionPanel();
    }

    function hideRoomLobby() {
        const panel = document.getElementById('mpRoomLobby');
        if (panel) panel.style.display = 'none';
        const chat = document.getElementById('mpChat');
        if (chat) chat.innerHTML = '';
    }

    function updateRoomLobby() {
        if (!roomData) return;
        const panel = document.getElementById('mpRoomLobby');
        if (panel && panel.style.display !== 'none') renderRoomLobby();
    }

    function renderRoomLobby() {
        const panel = getOrCreateRoomLobby();
        const isHost = mode === 'host';
        const humans = roomData.seats.filter(s => !s.isAI);
        const allHaveCountry = humans.every(s => s.country);

        let html = '<div class="ui-ornament-top" style="width:160px;height:1px;background:linear-gradient(90deg,transparent,rgba(200,168,48,0.3),transparent);margin:0 auto 16px;"></div>';
        html += '<div class="mp-lobby-header">';
        html += `<span class="mp-lobby-title">${esc(roomData.name)}</span>`;
        html += `<span class="mp-lobby-code">房间号: ${roomData.id}</span>`;
        if (isHost) {
            html += `<span class="mp-lobby-addr">服务器地址: ${esc(serverUrl)}</span>`;
        }
        html += '</div>';

        html += '<div class="mp-seats">';
        for (let i = 0; i < roomData.maxPlayers; i++) {
            const seat = roomData.seats[i];
            if (seat) {
                html += renderSeat(seat, i, isHost);
            } else {
                html += renderEmptySlot(i, isHost);
            }
        }
        html += '</div>';

        html += '<div class="mp-lobby-actions">';
        html += `<button class="mp-btn mp-btn-ready" onclick="MP.setReady(${!getMySeat()?.ready})">${getMySeat()?.ready ? '✓ 已准备' : '准备'}</button>`;
        if (isHost) {
            html += `<button class="mp-btn mp-btn-start" ${allHaveCountry ? '' : 'disabled'} onclick="MP.startGame()" title="${allHaveCountry ? '' : '所有玩家需选择国家'}">开始游戏</button>`;
        }
        html += `<button class="mp-btn mp-btn-leave" onclick="MP.leaveRoom()">离开</button>`;
        html += '</div>';

        html += '<div class="mp-chat-area">';
        html += '<div class="mp-chat-msgs" id="mpChatMsgs"></div>';
        html += '<div class="mp-chat-input"><input id="mpChatInput" placeholder="输入消息..." onkeydown="if(event.key===\'Enter\')MP.sendChat()"><button onclick="MP.sendChat()">发送</button></div>';
        html += '</div>';

        panel.innerHTML = html;
    }

    function renderSeat(seat, idx, isHost) {
        const isMe = seat.id === myId;
        const tag = seat.isAI ? '🤖 AI' : (isMe ? '👤 你' : '👤 玩家');
        const color = COUNTRY_COLORS[seat.country] || '#888';
        const name = PLAYABLE_CN[seat.country] || COUNTRY_CN[seat.country] || '未选择';

        let html = `<div class="mp-seat ${seat.isAI ? 'mp-seat-ai' : ''} ${isMe ? 'mp-seat-me' : ''}">`;
        html += `<div class="mp-seat-num">#${idx + 1}</div>`;
        html += `<div class="mp-seat-tag">${tag}</div>`;
        html += `<div class="mp-seat-name">${esc(seat.name)}</div>`;

        if (seat.isAI) {
            html += `<div class="mp-seat-country" style="color:${color}">${name}</div>`;
            if (isHost) {
                html += `<button class="mp-btn-sm mp-btn-danger" onclick="MP.removeAI('${seat.id}')">移除</button>`;
            }
        } else if (isMe) {
            html += `<select class="mp-country-select" onchange="MP.selectCountry(this.value)" style="color:${color}">`;
            html += `<option value="">-- 选择国家 --</option>`;
            for (let code of PLAYABLE) {
                const taken = roomData.seats.some(s => s.id !== seat.id && s.country === code);
                html += `<option value="${code}" ${seat.country === code ? 'selected' : ''} ${taken ? 'disabled' : ''}>${PLAYABLE_CN[code] || COUNTRY_CN[code] || code}${taken ? ' (已选)' : ''}</option>`;
            }
            html += '</select>';
        } else {
            html += `<div class="mp-seat-country" style="color:${color}">${name}</div>`;
        }

        html += `<div class="mp-seat-ready">${seat.ready ? '✅' : (seat.isAI ? '✅' : '⏳')}</div>`;
        html += '</div>';
        return html;
    }

    function renderEmptySlot(idx, isHost) {
        let html = `<div class="mp-seat mp-seat-empty">`;
        html += `<div class="mp-seat-num">#${idx + 1}</div>`;
        html += `<div class="mp-seat-tag">空位</div>`;
        if (isHost) {
            html += `<button class="mp-btn-sm" onclick="MP.addAI(${idx})">+ 添加AI</button>`;
        } else {
            html += '<div class="mp-seat-wait">等待玩家...</div>';
        }
        html += '</div>';
        return html;
    }

    function getMySeat() {
        if (!roomData || !roomData.seats) return null;
        return roomData.seats.find(s => s.id === myId);
    }

    function createRoom(name, password, maxPlayers, playerName) {
        send(M.CREATE_ROOM, { name, password, maxPlayers, playerName });
    }

    function joinRoom(roomId, password, playerName) {
        send(M.JOIN_ROOM, { roomId, password, playerName });
    }

    function leaveRoom() {
        send(M.LEAVE_ROOM);
        hideRoomLobby();
        showConnectionPanel();
        mode = null; roomId = null; roomData = null;
    }

    function selectCountry(country) {
        send(M.SELECT_COUNTRY, { country: country || null });
    }

    function showAddAI(slotIdx) {
        showAddAIModal();
    }

    function showAddAIModal() {
        // 移除旧弹窗
        const old = document.getElementById('mpAddAIModal');
        if (old) old.remove();

        const taken = roomData.seats.map(s => s.country).filter(Boolean);
        const available = PLAYABLE.filter(c => !taken.includes(c));

        if (available.length === 0) {
            showToast('所有列强已被选择');
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'mpAddAIModal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:400;background:rgba(5,3,0,0.8);display:flex;align-items:center;justify-content:center;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        let html = '<div style="background:linear-gradient(180deg,rgba(30,20,10,0.98),rgba(20,14,8,0.98));border:2px solid rgba(200,168,48,0.35);border-radius:4px;padding:24px;max-width:420px;width:90vw;color:#d4c0a0;font-family:Georgia,serif;box-shadow:0 0 40px rgba(0,0,0,0.5);">';
        html += '<h3 style="margin:0 0 6px;color:#e8d080;letter-spacing:2px;font-size:18px;">添加AI指挥官</h3>';
        html += '<p style="margin:0 0 16px;font-size:11px;color:rgba(200,180,150,0.4);letter-spacing:1px;">选择由AI参谋部控制的列强</p>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';

        for (let code of available) {
            const color = COUNTRY_COLORS[code] || '#888';
            const name = PLAYABLE_CN[code] || code;
            html += `<button class="mp-ai-country-btn" data-country="${code}" style="`;
            html += `background:linear-gradient(180deg,rgba(40,28,14,0.5),rgba(28,18,8,0.6));border:1px solid rgba(180,140,80,0.25);border-left:3px solid ${color};border-radius:2px;`;
            html += `padding:10px;color:#d4c0a0;cursor:pointer;font-size:13px;text-align:center;transition:all 0.25s;`;
            html += `" onmouseenter="this.style.background='linear-gradient(180deg,rgba(60,40,18,0.6),rgba(40,24,10,0.7))';this.style.borderColor='${color}'" onmouseleave="this.style.background='linear-gradient(180deg,rgba(40,28,14,0.5),rgba(28,18,8,0.6))';this.style.borderColor='rgba(180,140,80,0.25)'">`;
            html += `<div style="color:${color};font-weight:bold;letter-spacing:1px;">${name}</div>`;
            html += `<div style="font-size:10px;color:rgba(200,180,150,0.3);">${code}</div>`;
            html += '</button>';
        }

        html += '</div>';
        html += '<button style="margin-top:16px;width:100%;padding:8px;background:linear-gradient(180deg,rgba(40,30,15,0.5),rgba(30,20,10,0.6));border:1px solid rgba(180,140,80,0.2);border-radius:2px;color:rgba(200,180,150,0.4);cursor:pointer;font-size:12px;letter-spacing:1px;transition:all 0.2s;" onmouseenter="this.style.borderColor=\'rgba(200,168,48,0.4)\';this.style.color=\'rgba(200,180,150,0.6)\'" onmouseleave="this.style.borderColor=\'rgba(180,140,80,0.2)\';this.style.color=\'rgba(200,180,150,0.4)\'" onclick="document.getElementById(\'mpAddAIModal\').remove()">取消</button>';
        html += '</div>';

        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        // 绑定事件
        setTimeout(() => {
            const btns = overlay.querySelectorAll('.mp-ai-country-btn');
            btns.forEach(btn => {
                btn.onclick = () => {
                    const code = btn.getAttribute('data-country');
                    const name = 'AI-' + (PLAYABLE_CN[code] || code);
                    send(M.ADD_AI, { country: code, name });
                    overlay.remove();
                };
            });
        }, 50);
    }

    function removeAI(aiId) {
        send(M.REMOVE_AI, { aiId });
    }

    function setReady(ready) {
        send(M.PLAYER_READY, { ready });
    }

    function startGame() {
        send(M.GAME_START);
    }

    function sendChat() {
        const input = document.getElementById('mpChatInput');
        if (!input || !input.value.trim()) return;
        send(M.CHAT, input.value.trim());
        input.value = '';
    }

    function addChatMessage(sender, text) {
        const msgs = document.getElementById('mpChatMsgs');
        if (!msgs) return;
        const div = document.createElement('div');
        div.className = 'mp-chat-msg';
        div.innerHTML = `<b>${esc(sender)}:</b> ${esc(text)}`;
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    }

    // ─── 连接面板 ─────────────────────────────────
    function showConnectionPanel() {
        const panel = getOrCreateEl('mpConnectPanel');
        panel.style.display = 'flex';
        renderConnectionPanel();
        detectLocalIPs();
        // 请求房间列表
        if (connected) send(M.ROOM_LIST);
        // 隐藏单机选择界面
        const cs = document.getElementById('countrySelect');
        if (cs) cs.style.display = 'none';
    }

    function hideConnectionPanel() {
        const panel = document.getElementById('mpConnectPanel');
        if (panel) panel.style.display = 'none';
    }

    function renderConnectionPanel() {
        const panel = getOrCreateConnectionPanel();
        let html = '<div class="mp-connect-header">';
        html += '<div class="ui-ornament-top" style="width:160px;height:1px;background:linear-gradient(90deg,transparent,rgba(200,168,48,0.3),transparent);margin:0 auto 16px;"></div>';
        html += '<h2>铁与权柄：1914</h2>';
        html += '<p style="font-size:11px;color:rgba(200,180,150,0.35);letter-spacing:3px;margin-top:2px;">联 机 模 式</p>';
        html += `<div class="mp-status ${connected ? 'mp-status-ok' : 'mp-status-err'}">${connected ? '● 已连接至指挥部' : '○ 未连接'}</div>`;
        html += '</div>';

        // 本机IP显示（方便房主分享）
        html += '<div class="mp-ip-info">';
        html += '<div class="mp-section-label">本机地址（分享给其他玩家）</div>';
        html += '<div class="mp-ip-list" id="mpIpList">正在检测...</div>';
        html += '</div>';

        html += '<div class="mp-connect-form">';
        html += `<input id="mpServerUrl" value="${esc(serverUrl)}" placeholder="服务器地址">`;
        html += `<input id="mpPlayerName" placeholder="你的昵称" maxlength="12">`;
        html += '<div class="mp-connect-btns">';
        html += `<button class="mp-btn mp-btn-connect" onclick="MP.doConnect()">${connected ? '重新连接' : '连接服务器'}</button>`;
        html += '</div>';
        html += '</div>';

        // 输入房间号加入
        html += '<div class="mp-join-by-code">';
        html += '<div class="mp-section-label">通过房间号加入</div>';
        html += '<div class="mp-join-code-row">';
        html += '<input id="mpRoomCode" placeholder="输入房间号" maxlength="8">';
        html += '<button class="mp-btn mp-btn-join-code" onclick="MP.doJoinByCode()">加入</button>';
        html += '</div>';
        html += '</div>';

        html += '<div class="mp-create-room">';
        html += '<input id="mpRoomName" placeholder="房间名称" maxlength="20">';
        html += '<input id="mpRoomPassword" placeholder="密码 (可选)" maxlength="10">';
        html += '<select id="mpMaxPlayers">';
        for (let i = 2; i <= 8; i++) html += `<option value="${i}" ${i===4?'selected':''}>${i}人</option>`;
        html += '</select>';
        html += '<button class="mp-btn mp-btn-create" onclick="MP.doCreateRoom()">创建房间</button>';
        html += '</div>';

        html += '<div class="mp-room-list" id="mpRoomList">';
        html += '<div class="mp-room-list-title">可用房间</div>';
        html += '<div class="mp-room-list-empty">正在加载...</div>';
        html += '</div>';

        html += '<button class="mp-btn mp-btn-back" onclick="MP.goBack()">返回单机</button>';
        panel.innerHTML = html;
    }

    function updateRoomList(rooms) {
        const list = document.getElementById('mpRoomList');
        if (!list) return;
        if (!rooms || rooms.length === 0) {
            list.innerHTML = '<div class="mp-room-list-title">可用房间</div><div class="mp-room-list-empty">暂无房间，创建一个吧！</div>';
            return;
        }
        let html = '<div class="mp-room-list-title">可用房间 (点击加入)</div>';
        for (let r of rooms) {
            html += `<div class="mp-room-item">`;
            html += `<span class="mp-room-name">${esc(r.name)} ${r.hasPassword ? '🔒' : ''}</span>`;
            html += `<span class="mp-room-info">${r.players}/${r.maxPlayers}人</span>`;
            html += `<span class="mp-room-code">${r.id}</span>`;
            html += `<button class="mp-btn-sm mp-btn-join" onclick="event.stopPropagation();MP.doJoinRoom('${r.id}')">加入</button>`;
            html += '</div>';
        }
        list.innerHTML = html;
    }

    function doConnect() {
        const url = document.getElementById('mpServerUrl')?.value || serverUrl;
        serverUrl = url;
        connect(url).then(() => {
            showToast('已连接到服务器');
            renderConnectionPanel();
        }).catch(() => {
            showToast('连接失败，请检查服务器地址');
        });
    }

    // 检测本机IP地址（WebRTC方式）
    function detectLocalIPs() {
        const el = document.getElementById('mpIpList');
        if (!el) return;
        const ips = new Set();
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pc.createDataChannel('');
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
        pc.onicecandidate = (e) => {
            if (!e.candidate) {
                pc.close();
                renderIPs();
                return;
            }
            const addr = e.candidate.address;
            if (addr && !addr.includes(':') && addr !== '0.0.0.0') {
                ips.add(addr);
            }
        };
        // 超时
        setTimeout(() => { pc.close(); renderIPs(); }, 3000);
        function renderIPs() {
            if (ips.size === 0) {
                el.innerHTML = '<span class="mp-ip-addr">无法检测，请查看系统网络设置</span>';
            } else {
                let html = '';
                for (let ip of ips) {
                    html += `<span class="mp-ip-addr" onclick="navigator.clipboard.writeText('${ip}').then(()=>MP.showToast('已复制: ${ip}'))">${ip}</span>`;
                }
                html += '<span class="mp-ip-hint">（点击复制）</span>';
                el.innerHTML = html;
            }
        }
    }

    function isOpen() { return !!ws && ws.readyState === WebSocket.OPEN; }

    function doCreateRoom() {
        if (!isOpen()) return showToast('请先连接服务器');
        const name = document.getElementById('mpRoomName')?.value || '';
        const password = document.getElementById('mpRoomPassword')?.value || '';
        const maxPlayers = parseInt(document.getElementById('mpMaxPlayers')?.value || '4');
        const playerName = document.getElementById('mpPlayerName')?.value || '';
        if (!name.trim()) return showToast('请输入房间名称');
        createRoom(name, password, maxPlayers, playerName);
    }

    function doJoinRoom(roomId) {
        if (!isOpen()) return showToast('请先连接服务器');
        const playerName = document.getElementById('mpPlayerName')?.value || '';
        const room = (typeof roomListCache !== 'undefined' && roomListCache) ? roomListCache.find(r => r.id === roomId) : null;
        let password = '';
        if (room && room.hasPassword) {
            password = prompt('请输入房间密码:') || '';
        }
        joinRoom(roomId, password, playerName);
    }

    function doJoinByCode() {
        if (!isOpen()) return showToast('请先连接服务器');
        const code = document.getElementById('mpRoomCode')?.value || '';
        if (!code.trim()) return showToast('请输入房间号');
        const playerName = document.getElementById('mpPlayerName')?.value || '';
        const room = (typeof roomListCache !== 'undefined' && roomListCache) ? roomListCache.find(r => r.id === code.trim()) : null;
        let password = '';
        if (room && room.hasPassword) {
            password = prompt('请输入房间密码:') || '';
        }
        joinRoom(code.trim(), password, playerName);
    }

    function goBack() {
        disconnect();
        hideConnectionPanel();
        hideRoomLobby();
        mode = null;
        const cs = document.getElementById('countrySelect');
        if (cs) cs.style.display = 'flex';
    }

    let roomListCache = [];
    // 覆盖updateRoomList以缓存
    const _updateRoomList = updateRoomList;
    updateRoomList = function(rooms) {
        roomListCache = rooms || [];
        _updateRoomList(rooms);
    };

    // ─── 游戏开始 ─────────────────────────────────
    function startMultiplayerGame(payload) {
        hideRoomLobby();
        hideConnectionPanel();
        const cs = document.getElementById('countrySelect');
        if (cs) cs.style.display = 'none';

        // 确定本机玩家国家
        const mySeat = payload.seats.find(s => s.id === myId);
        const myCountry = mySeat ? mySeat.country : null;
        const aiCountries = payload.seats.filter(s => s.isAI).map(s => s.country);

        // 初始化游戏（使用现有的游戏初始化，但传入联机参数）
        if (mode === 'host') {
            // Host: 正常跑游戏，AI控制非玩家国家
            G.playerCountry = myCountry;
            G.multiplayerMode = 'host';
            G.multiplayerSeats = payload.seats;
            G.multiplayerHumanCountries = payload.seats.filter(s => !s.isAI).map(s => s.country);
            G.speed = payload.speed || 4;
            // 触发游戏初始化
            if (typeof initGame === 'function') {
                initGame(myCountry, true);
            }
        } else {
            // Client: 不跑模拟，只渲染
            G.playerCountry = myCountry;
            G.multiplayerMode = 'client';
            G.multiplayerSeats = payload.seats;
            G.multiplayerHumanCountries = payload.seats.filter(s => !s.isAI).map(s => s.country);
            G.speed = payload.speed || 4;
            if (typeof initGame === 'function') {
                initGame(myCountry, false);
            }
        }
        addGameLog('联机游戏开始！模式: ' + (mode === 'host' ? '房主' : '客户端'));
    }

    // ─── 状态序列化 (Host) ─────────────────────────────────
    function serializeState() {
        const s = {
            date: G.date ? G.date.getTime() : Date.now(),
            tick: G.tick || 0,
            speed: G.speed || 4,
            paused: G.paused || false,
            divisions: [],
            cities: {},
            provinceOwners: { ...G.provinceOwners },
            countries: {},
            atWar: G.atWar ? JSON.parse(JSON.stringify(G.atWar)) : {},
            warAnnounced: G.warAnnounced ? JSON.parse(JSON.stringify(G.warAnnounced)) : {},
            alliances: G.alliances ? JSON.parse(JSON.stringify(G.alliances)) : {},
            surrendered: G.surrendered ? { ...G.surrendered } : {},
            projectiles: [],
            fireZones: [],
            gravestones: (G.gravestones || []).slice(-30),
            navyGraves: (G.navyGraves || []).slice(-30),
            newsBanner: G.newsBanner || null,
            newsTimer: G.newsTimer || 0,
            frontlineGroups: G.frontlineGroups ? G.frontlineGroups.map(g => ({
                id: g.id, start: g.start, end: g.end, colorIdx: g.colorIdx
            })) : [],
            frontlines: G.frontlines ? { ...G.frontlines } : {},
        };

        // 师团
        for (let d of G.divisions) {
            s.divisions.push({
                id: d.id, name: d.name, type: d.type, country: d.country,
                rx: d.rx, ry: d.ry, state: d.state, targetX: d.targetX, targetY: d.targetY,
                strength: d.strength, fireCooldown: d.fireCooldown, maxFireCd: d.maxFireCd,
                focusTarget: d.focusTarget, focusCity: d.focusCity, focusFactory: d.focusFactory,
                province: d.province, shipId: d.shipId,
                navySpd: d.navySpd, navyRng: d.navyRng, navyFr: d.navyFr, navyDmg: d.navyDmg, navyMvr: d.navyMvr,
                formationGroup: d.formationGroup, formationRole: d.formationRole, formationIndex: d.formationIndex,
                garrisonCityId: d.garrisonCityId, garrisonCityLon: d.garrisonCityLon, garrisonCityLat: d.garrisonCityLat,
                exp: d.exp,
            });
        }

        // 城市
        for (let cid in G.cities) {
            let c = G.cities[cid];
            s.cities[cid] = {
                owner: c.owner, hp: c.hp, maxHp: c.maxHp,
                occupierFlag: c.occupierFlag || null,
                originalOwner: c.originalOwner || null,
                originalMaxHp: c.originalMaxHp || null,
            };
        }

        // 国家
        for (let [code, data] of Object.entries(G.countries)) {
            s.countries[code] = {
                treasury: data.treasury, income: data.income, expenses: data.expenses,
                divCount: data.divCount, manpower: data.manpower, maxManpower: data.maxManpower,
            };
        }

        // 投射物 (精简)
        for (let p of (G.projectiles || []).slice(-30)) {
            s.projectiles.push({
                x: p.x, y: p.y, type: p.type, life: p.life, lifeMax: p.lifeMax,
                startX: p.startX, startY: p.startY, endX: p.endX, endY: p.endY,
                arcUp: p.arcUp, arcHeight: p.arcHeight, splash: p.splash,
                baseDamage: p.baseDamage, shooterCountry: p.shooterCountry,
                targetType: p.targetType,
            });
        }

        // 火焰区
        for (let fz of (G.fireZones || []).slice(-20)) {
            s.fireZones.push({ x: fz.x, y: fz.y, radius: fz.radius, life: fz.life, lifeMax: fz.lifeMax, damage: fz.damage, shooterCountry: fz.shooterCountry });
        }

        return s;
    }

    function serializeDelta() {
        // 增量：只发送单位位置变化
        const delta = { tick: G.tick, units: [] };
        for (let d of G.divisions) {
            delta.units.push({
                id: d.id, rx: d.rx, ry: d.ry, state: d.state,
                targetX: d.targetX, targetY: d.targetY,
                strength: d.strength, fireCooldown: d.fireCooldown, maxFireCd: d.maxFireCd,
                focusTarget: d.focusTarget, focusCity: d.focusCity, focusFactory: d.focusFactory,
                hitFlash: d.hitFlash,
            });
        }
        return delta;
    }

    function sendFullSync() {
        if (mode !== 'host') return;
        const now = Date.now();
        if (now - lastFullSync < FULL_SYNC_INTERVAL) return;
        lastFullSync = now;
        const state = serializeState();
        send(M.STATE_FULL, state);
    }

    function sendDeltaSync() {
        if (mode !== 'host') return;
        const now = Date.now();
        if (now - lastDeltaTime < DELTA_INTERVAL) return;
        lastDeltaTime = now;
        send(M.STATE_DELTA, serializeDelta());
    }

    // ─── 状态应用 (Client) ─────────────────────────────────
    function applyFullState(state) {
        if (!state || mode !== 'client') return;

        // 日期
        if (state.date && G.date) G.date.setTime(state.date);
        if (state.tick !== undefined) G.tick = state.tick;
        if (state.speed !== undefined) G.speed = state.speed;
        if (state.paused !== undefined) G.paused = state.paused;

        // 城市
        if (state.cities) {
            for (let cid in state.cities) {
                if (G.cities[cid]) {
                    Object.assign(G.cities[cid], state.cities[cid]);
                }
            }
        }

        // 省份归属
        if (state.provinceOwners) {
            G.provinceOwners = state.provinceOwners;
            // 同步 PROVINCES 数组中的 c 字段
            for (let p of PROVINCES) {
                if (state.provinceOwners[p.id] !== undefined) {
                    p.c = state.provinceOwners[p.id];
                }
            }
            // 同步 provinceData
            for (let pid in G.provinceData) {
                if (state.provinceOwners[pid] !== undefined) {
                    G.provinceData[pid].country = state.provinceOwners[pid];
                }
            }
        }

        // 国家
        if (state.countries) {
            for (let [code, data] of Object.entries(state.countries)) {
                if (G.countries[code]) Object.assign(G.countries[code], data);
            }
        }

        // 外交
        if (state.atWar) G.atWar = state.atWar;
        if (state.warAnnounced) G.warAnnounced = state.warAnnounced;
        if (state.alliances) G.alliances = state.alliances;
        if (state.surrendered) G.surrendered = state.surrendered;

        // 师团 — 完全替换
        if (state.divisions) {
            const oldMap = {};
            for (let d of G.divisions) oldMap[d.id] = d;
            G.divisions = [];
            for (let sd of state.divisions) {
                const old = oldMap[sd.id];
                G.divisions.push({
                    ...sd,
                    // 保留客户端特有的渲染属性
                    hitFlash: old ? old.hitFlash : 0,
                });
            }
        }

        // 投射物
        if (state.projectiles) G.projectiles = state.projectiles;

        // 火焰
        if (state.fireZones) G.fireZones = state.fireZones;

        // 墓碑
        if (state.gravestones) G.gravestones = state.gravestones;
        if (state.navyGraves) G.navyGraves = state.navyGraves;

        // 前线
        if (state.frontlineGroups) G.frontlineGroups = state.frontlineGroups;
        if (state.frontlines) G.frontlines = state.frontlines;

        // 新闻
        if (state.newsBanner) { G.newsBanner = state.newsBanner; G.newsTimer = state.newsTimer; }
    }

    function applyDelta(delta) {
        if (!delta || mode !== 'client') return;
        if (delta.tick !== undefined) G.tick = delta.tick;

        if (delta.units) {
            const unitMap = {};
            for (let d of G.divisions) unitMap[d.id] = d;

            for (let ud of delta.units) {
                const d = unitMap[ud.id];
                if (d) {
                    d.rx = ud.rx; d.ry = ud.ry;
                    d.state = ud.state;
                    d.targetX = ud.targetX; d.targetY = ud.targetY;
                    d.strength = ud.strength;
                    d.fireCooldown = ud.fireCooldown;
                    d.maxFireCd = ud.maxFireCd;
                    d.focusTarget = ud.focusTarget;
                    d.focusCity = ud.focusCity;
                    d.focusFactory = ud.focusFactory;
                    if (ud.hitFlash !== undefined) d.hitFlash = ud.hitFlash;
                }
            }
        }
    }

    // ─── 玩家操作转发 ─────────────────────────────────
    function handleRemoteAction(msg) {
        if (mode !== 'host') return;
        const action = msg.payload;
        const senderId = msg.senderId;
        const senderName = msg.senderName;
        // 找到发送者的国家
        const seat = (G.multiplayerSeats || []).find(s => s.id === senderId);
        const country = seat ? seat.country : null;
        if (!country) return;

        // 处理不同类型的操作
        switch (action.type) {
            case 'move':
                handleRemoteMove(country, action);
                break;
            case 'focus':
                handleRemoteFocus(country, action);
                break;
            case 'focus_factory':
                handleRemoteFocusFactory(country, action);
                break;
            case 'focus_city':
                handleRemoteFocusCity(country, action);
                break;
            case 'declare_war':
                if (typeof declareWar === 'function') declareWar(country, action.target);
                break;
            case 'build':
                handleRemoteBuild(country, action);
                break;
            case 'garrison':
                handleRemoteGarrison(country, action);
                break;
            case 'frontline':
                handleRemoteFrontline(country, action);
                break;
            case 'navy_build':
                handleRemoteNavyBuild(country, action);
                break;
            case 'upgrade_navy_node':
                handleRemoteNavyUpgrade(country, action);
                break;
            case 'upgrade_city':
                handleRemoteCityUpgrade(country, action);
                break;
            case 'alliance':
                if (typeof formAlliance === 'function') formAlliance(country, action.target);
                break;
        }
    }

    function handleRemoteMove(country, action) {
        for (let divId of (action.unitIds || [])) {
            const d = G.divisions.find(x => x.id === divId && x.country === country);
            if (!d) continue;
            d.state = 'moving';
            d.targetX = action.x;
            d.targetY = action.y;
            // 清除阵型
            if (d.formationGroup) {
                d.formationGroup = null; d.formationRole = null; d.formationIndex = null;
            }
            // 清除集火
            d.focusTarget = null; d.focusCity = null; d.focusFactory = null;
        }
    }

    function handleRemoteFocus(country, action) {
        for (let divId of (action.unitIds || [])) {
            const d = G.divisions.find(x => x.id === divId && x.country === country);
            if (!d) continue;
            d.focusTarget = action.targetUnitId;
            d.focusFactory = null; d.focusCity = null;
            d.state = 'idle'; d.targetX = null; d.targetY = null;
        }
    }

    function handleRemoteFocusFactory(country, action) {
        for (let divId of (action.unitIds || [])) {
            const d = G.divisions.find(x => x.id === divId && x.country === country);
            if (!d) continue;
            d.focusFactory = action.factoryId;
            d.focusTarget = null; d.focusCity = null;
        }
    }

    function handleRemoteFocusCity(country, action) {
        for (let divId of (action.unitIds || [])) {
            const d = G.divisions.find(x => x.id === divId && x.country === country);
            if (!d) continue;
            d.focusCity = action.cityId;
            d.focusTarget = null; d.focusFactory = null;
        }
    }

    function handleRemoteBuild(country, action) {
        if (!G.buildQueue) G.buildQueue = [];
        G.buildQueue.push({
            type: action.buildType,
            province: action.province,
            days: action.totalDays,
            totalDays: action.totalDays,
            cityId: action.cityId,
            cityLon: action.cityLon,
            cityLat: action.cityLat,
            unitType: action.unitType,
            cityName: action.cityName,
        });
    }

    function handleRemoteGarrison(country, action) {
        for (let divId of (action.unitIds || [])) {
            const d = G.divisions.find(x => x.id === divId && x.country === country);
            if (!d) continue;
            d.state = 'moving';
            // 移动到城市
            const city = G.cities[action.cityId];
            if (city) {
                d.targetX = city.lon;
                d.targetY = city.lat;
                d.garrisonCityId = action.cityId;
                d.garrisonCityLon = city.lon;
                d.garrisonCityLat = city.lat;
            }
        }
    }

    function handleRemoteFrontline(country, action) {
        if (!G.frontlines) G.frontlines = {};
        if (!G.frontlineGroups) G.frontlineGroups = [];
        const grpId = 'fg_' + (G.frontlineGroups.length + 1);
        const grp = {
            id: grpId,
            start: action.start,
            end: action.end,
            colorIdx: G.frontlineGroups.length,
        };
        G.frontlineGroups.push(grp);
        for (let divId of (action.unitIds || [])) {
            G.frontlines[divId] = grpId;
        }
    }

    function handleRemoteNavyBuild(country, action) {
        if (!G.navyBuildQueue) G.navyBuildQueue = [];
        G.navyBuildQueue.push({
            nodeId: action.nodeId,
            days: action.totalDays,
            totalDays: action.totalDays,
        });
    }

    function handleRemoteNavyUpgrade(country, action) {
        const node = G.navyNodes && G.navyNodes[action.nodeId];
        if (node && node.country === country) {
            node.upgradeTimer = action.upgradeTimer;
            node.upgradeProgress = 0;
        }
    }

    function handleRemoteCityUpgrade(country, action) {
        if (!G.buildQueue) G.buildQueue = [];
        G.buildQueue.push({
            type: 'upgrade_city',
            province: action.province,
            days: 40, totalDays: 40,
            cityId: action.cityId,
            cityLon: action.cityLon,
            cityLat: action.cityLat,
            cityName: action.cityName,
        });
    }

    // ─── 发送操作 ─────────────────────────────────
    function sendAction(action) {
        if (mode === 'client') {
            send(M.PLAYER_ACTION, action);
        }
        // Host直接执行（本地操作在game_core中已处理）
    }

    function sendSpeed(speed) {
        if (mode === 'host') {
            send(M.GAME_SPEED, speed);
        }
    }

    // ─── 帧更新 (Host: 发送同步) ─────────────────────────────────
    function onFrame() {
        if (mode === 'host') {
            sendDeltaSync();
            sendFullSync();
        }
    }

    // ─── UI 工具 ─────────────────────────────────
    function showToast(msg) {
        const existing = document.getElementById('mpToast');
        if (existing) existing.remove();
        const div = document.createElement('div');
        div.id = 'mpToast';
        div.textContent = msg;
        div.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:rgba(30,20,10,0.94);color:#d4c0a0;padding:10px 24px;border-radius:2px;z-index:999;font-family:Georgia,serif;font-size:14px;border:1px solid rgba(200,168,48,0.4);pointer-events:none;transition:opacity 0.5s;letter-spacing:1px;box-shadow:0 4px 16px rgba(0,0,0,0.5);';
        document.body.appendChild(div);
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 500); }, 2500);
    }

    function getOrCreateEl(id) {
        let el = document.getElementById(id);
        if (el) return el;
        el = document.createElement('div');
        el.id = id;
        el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:300;display:none;';
        document.body.appendChild(el);
        return el;
    }

    function getOrCreateRoomLobby() {
        let panel = document.getElementById('mpRoomLobby');
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = 'mpRoomLobby';
        panel.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:300;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(10,15,26,0.96);color:#e8d8b0;font-family:Georgia,serif;overflow-y:auto;padding:20px;';
        document.body.appendChild(panel);
        return panel;
    }

    function getOrCreateConnectionPanel() {
        let panel = document.getElementById('mpConnectPanel');
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = 'mpConnectPanel';
        panel.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:300;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(10,15,26,0.96);color:#e8d8b0;font-family:Georgia,serif;overflow-y:auto;padding:20px;';
        document.body.appendChild(panel);
        return panel;
    }

    function esc(s) {
        if (!s) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ─── 公开 API ─────────────────────────────────
    return {
        connect, disconnect, send,
        showConnectionPanel, hideConnectionPanel,
        showRoomLobby, hideRoomLobby,
        createRoom, joinRoom, leaveRoom,
        selectCountry, addAI: showAddAI, removeAI, setReady, startGame,
        sendChat, doConnect, doCreateRoom, doJoinRoom, doJoinByCode, goBack,
        sendAction, sendSpeed,
        serializeState, serializeDelta, sendFullSync, sendDeltaSync,
        applyFullState, applyDelta, onFrame,
        showToast, addChatMessage,
        get mode() { return mode; },
        get roomId() { return roomId; },
        get connected() { return connected; },
        get myId() { return myId; },
    };
})();