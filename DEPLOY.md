# 部署指南 — 铁与权柄：1914

一个 Node.js 服务同时提供「静态网页 + 联机 WebSocket 中继」，端口 `process.env.PORT || 1914`。
单机模式无需任何部署（直接打开 index.html 即可）；部署后联机也可用。

## 快速选择

| 方案 | 难度 | 费用 | 说明 |
|------|------|------|------|
| Render | 低 | 免费额度 | 推荐，支持 WebSocket + 健康检查 |
| Railway | 低 | 试用额度 | 支持 WebSocket |
| Fly.io | 中 | 免费额度 | 需要 flyctl 命令行 |
| 自己的 VPS | 中 | 服务器费用 | 完全可控，可长期稳定运行 |

> 注意：GitHub Pages / Netlify / Vercel 等**纯静态托管**只能玩单机，联机 WebSocket 中继无法运行（除非把服务器单独部署在别处，再在联机大厅里手动填服务器地址——大厅已有「服务器地址」输入框）。

---

## 方案一：Render（推荐）

1. 注册 [render.com](https://render.com)（GitHub 账号直接登录）。
2. 把本项目推送到自己的 GitHub 仓库（见文末「先上传到 GitHub」）。
3. Render 控制台 → **New** → **Web Service** → 选择该仓库。
4. 关键配置：
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. 点击 **Create Web Service**，等待几分钟即可。
6. 访问 `https://<你的服务名>.onrender.com` 开玩，联机模式自动连接同一域名（wss 自动切换）。

可选：在 Health Check Path 填 `/health`，Render 会自动轮询服务状态。

---

## 方案二：Railway

1. 注册 [railway.app](https://railway.app)，用 GitHub 登录。
2. **New Project** → **Deploy from GitHub repo** → 选本项目。
3. 默认即可运行（自动识别 `npm start`）。
4. 打开 **Settings** → **Networking**，点 **Generate Domain** 生成公网域名。
5. 访问生成的域名（HTTPS，联机自动 wss）。

---

## 方案三：Fly.io

1. 安装 [flyctl](https://fly.io/docs/flyctl/install/) 并 `fly auth login`。
2. 项目根目录新建 `fly.toml`：

```toml
app = "iron-dominion-1914"   # 改个唯一名字
[build]
  builder = "heroku/buildpacks:20"
[env]
  PORT = "8080"
[[services]]
  internal_port = 8080
  protocol = "tcp"
  auto_stop_machines = false
  [[services.ports]]
    handlers = ["http", "ws"]
    port = 80
    [[services.ports.tls]]
      handlers = ["http", "ws"]
      port = 443
```

3. 执行：

```bash
fly launch   # 选择已有配置（Do not overwrite）
fly deploy
```

4. 访问 `https://iron-dominion-1914.fly.dev`。

---

## 方案四：自己的 VPS（Ubuntu 示例）

```bash
# 1. 安装 Node.js 20+（推荐用 nvm 或 nodesource 源）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 上传项目（任选其一）
#    a) git clone 你的仓库
git clone https://github.com/<你的用户名>/iron-dominion-1914.git
cd iron-dominion-1914
#    b) 或本地压缩包 scp 上传后解压

# 3. 安装依赖并启动
npm install --omit=dev
npm start          # 或 pm2 常驻（推荐）

# 4. 用 pm2 常驻运行
sudo npm i -g pm2
pm2 start server/server.js --name iron1914
pm2 save && pm2 startup   # 开机自启

# 5. 可选：nginx 反代 80 端口（自动支持 ws）
sudo tee /etc/nginx/sites-available/iron1914 <<'EOF'
server {
    listen 80;
    server_name yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:1914;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/iron1914 /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

防火墙记得放行端口（`sudo ufw allow 1914` 或 80/443）。

---

## 先上传到 GitHub

```bash
cd "项目目录"
git init                      # 若还不是 git 仓库
git add .
git commit -m "initial deploy"
git branch -M main
git remote add origin https://github.com/<你的用户名>/iron-dominion-1914.git
git push -u origin main
```

---

## 部署后验证清单

1. 打开公网地址：能看到游戏选国家界面（单机可玩）✅
2. 点「联机模式」→ 创建房间 → 用另一台设备（或无痕窗口）加入房间 → 能互见、能开战 ✅
3. 检查 WebSocket 连接（F12 → Network → WS）：显示 `wss://你的域名/` 且无报错 ✅
4. 服务器日志里没有 404/异常堆积 ✅

## 常见问题

- **联机连不上**：确认部署平台放行了 WebSocket（Render/Fly 按上文配置即支持）；自建服务器检查 nginx 的 `Upgrade` 头。
- **端口冲突**：平台环境变量 `PORT` 已自动注入；自建服务器用 `PORT=3000 npm start` 自定义。
- **免费平台休眠**：Render/Railway 免费实例空闲会休眠，再次访问需等 30~60 秒唤醒；多人游玩时保持常开。
