# 🚀 Ubuntu 服务器一键部署指南

## 📋 部署说明

本指南提供**完整的Ubuntu服务器一键部署方案**，解决前端无法连接后端API的问题。

---

## 🎯 问题诊断

如果您在服务器部署后遇到以下错误：

```javascript
TypeError: Cannot read properties of undefined (reading 'length')
// 或
Cannot read properties of undefined (reading 'getUserMedia')
```

**原因**：前端在生产环境无法正确访问后端API，导致数据为`undefined`。

---

## ✅ 解决方案

我们提供了**完整的修复方案**，包括：

1. ✅ 前端环境变量配置
2. ✅ Vite preview模式proxy配置
3. ✅ 自动化部署脚本
4. ✅ 依赖自动检测安装

---

## 🚀 一键部署步骤

### 方法1: 快速部署 (推荐)

使用`quick-deploy.sh`脚本，自动完成所有配置：

```bash
# 1. 上传项目到服务器
scp -r ./合约 your-server:/home/your-user/

# 2. SSH登录服务器
ssh your-user@your-server-ip

# 3. 进入项目目录
cd /home/your-user/合约

# 4. 添加执行权限
chmod +x quick-deploy.sh

# 5. 运行一键部署脚本
./quick-deploy.sh
```

**脚本会自动**：
- ✅ 检测并安装 Node.js 18
- ✅ 检测并安装 pm2
- ✅ 安装项目依赖（根目录 + client）
- ✅ 检查并创建 .env 配置
- ✅ 停止旧进程
- ✅ 启动后端服务 (端口 3000, 3001)
- ✅ 构建并启动前端 (端口 5173，内置proxy)
- ✅ 配置开机自启

---

### 方法2: 手动部署

如果需要手动控制每个步骤：

#### 步骤1: 安装Node.js

```bash
# 安装Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node -v
npm -v
```

#### 步骤2: 安装pm2

```bash
sudo npm install -g pm2
```

#### 步骤3: 安装项目依赖

```bash
cd /path/to/合约

# 安装根目录依赖
npm install

# 安装前端依赖
cd client
npm install
cd ..
```

#### 步骤4: 配置环境变量

编辑 `.env` 文件：

```bash
nano .env
```

填写必要配置：

```env
DEEPSEEK_API_KEY=your_actual_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
PORT=3000
WS_PORT=3001
EXCHANGE_NAME=binance
```

#### 步骤5: 启动后端

```bash
pm2 start server/index.js --name ai-server
```

#### 步骤6: 构建并启动前端

```bash
cd client
npm run build
pm2 start npm --name ai-web -- run preview
cd ..
```

#### 步骤7: 保存pm2配置

```bash
pm2 save
pm2 startup  # 配置开机自启
```

---

## 🌐 访问服务

部署完成后，访问：

```
http://your-server-ip:5173
```

**端口说明**：
- `5173` - 前端界面 (Vite preview模式，内置proxy)
- `3000` - 后端API (通过前端proxy访问，无需直接访问)
- `3001` - WebSocket (通过前端proxy访问，无需直接访问)

---

## 🔒 防火墙配置

### Ubuntu UFW

```bash
# 开放5173端口
sudo ufw allow 5173/tcp

# 查看状态
sudo ufw status
```

### 云服务器安全组

如果使用阿里云/腾讯云/AWS等，需在控制台配置：

**入站规则**：
- 协议：TCP
- 端口：5173
- 源：0.0.0.0/0 (或指定IP)

---

## 📊 服务管理

### 常用命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs

# 查看后端日志
pm2 logs ai-server

# 查看前端日志
pm2 logs ai-web

# 重启服务
pm2 restart all

# 停止服务
pm2 stop all

# 删除服务
pm2 delete all

# 实时监控
pm2 monit
```

### 日志文件位置

```
项目目录/logs/
├── server.log         # 后端正常日志
├── server-error.log   # 后端错误日志
├── web.log           # 前端正常日志
└── web-error.log     # 前端错误日志
```

---

## 🐛 故障排除

### 问题1: 前端无法加载

**症状**：浏览器无法访问或白屏

**解决**：

```bash
# 检查前端服务状态
pm2 logs ai-web

# 重新构建前端
cd client
npm run build
pm2 restart ai-web
```

### 问题2: API请求失败

**症状**：控制台显示 "Cannot read properties of undefined"

**解决**：

```bash
# 1. 检查后端是否运行
pm2 status

# 2. 检查后端日志
pm2 logs ai-server

# 3. 检查后端端口
netstat -tunlp | grep 3000
netstat -tunlp | grep 3001

# 4. 重启后端
pm2 restart ai-server
```

### 问题3: WebSocket连接失败

**症状**：界面显示 "Connecting..." 或 WebSocket错误

**解决**：

```bash
# 1. 检查3001端口
netstat -tunlp | grep 3001

# 2. 检查server/index.js中的WebSocket配置
# 3. 重启服务
pm2 restart all
```

### 问题4: 端口已被占用

**症状**：启动失败，显示 "address already in use"

**解决**：

```bash
# 查找占用进程
sudo lsof -i :5173
sudo lsof -i :3000
sudo lsof -i :3001

# 杀死进程 (替换PID)
sudo kill -9 <PID>

# 或使用pm2重启
pm2 delete all
./quick-deploy.sh
```

### 问题5: .env配置未生效

**症状**：服务启动但API Key无效

**解决**：

```bash
# 1. 检查.env文件
cat .env

# 2. 确保没有多余空格
nano .env  # 编辑后保存

# 3. 重启后端
pm2 restart ai-server
```

---

## 📈 性能优化建议

### 1. 增加pm2进程数 (集群模式)

```bash
pm2 start server/index.js --name ai-server -i 2  # 2个进程
```

### 2. 设置内存限制

```bash
pm2 start server/index.js --name ai-server --max-memory-restart 1G
```

### 3. 启用自动重启

```bash
pm2 start server/index.js --name ai-server --watch
```

### 4. 配置日志轮转

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 10
```

---

## 🔐 安全建议

1. **不要暴露后端端口**
   - 只开放5173端口
   - 3000和3001端口仅本地访问

2. **配置HTTPS** (生产环境)
   ```bash
   # 安装证书工具
   sudo apt-get install certbot

   # 获取Let's Encrypt证书
   sudo certbot certonly --standalone -d yourdomain.com
   ```

3. **限制访问IP**
   ```bash
   # UFW限制访问
   sudo ufw delete allow 5173/tcp
   sudo ufw allow from YOUR_IP to any port 5173
   ```

4. **定期更新依赖**
   ```bash
   npm outdated
   npm update
   ```

---

## 📞 获取帮助

如果遇到问题：

1. **查看日志**
   ```bash
   pm2 logs
   tail -f logs/server-error.log
   ```

2. **检查系统资源**
   ```bash
   htop  # CPU/内存使用
   df -h # 磁盘空间
   ```

3. **GitHub Issues**
   - 提交问题时附上错误日志

---

## 🎉 部署完成清单

- [ ] Node.js 已安装
- [ ] pm2 已安装
- [ ] 项目依赖已安装
- [ ] .env 已配置 (DEEPSEEK_API_KEY)
- [ ] 后端服务运行正常 (pm2 status)
- [ ] 前端服务运行正常 (pm2 status)
- [ ] 防火墙已开放5173端口
- [ ] 可以通过浏览器访问界面
- [ ] API请求正常 (无undefined错误)
- [ ] WebSocket连接正常 (显示"已连接")

---

**祝您部署顺利！** 🚀
