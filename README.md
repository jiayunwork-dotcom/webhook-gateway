# Webhook Gateway - 多租户 WebHook 事件分发平台

面向多租户 SaaS 场景的 WebHook 事件分发平台。让各个业务系统能把事件可靠、安全地推送给下游订阅方。

## 功能特性

### 租户体系
- 每个租户注册后获取一对 API 密钥（公钥发布事件，私钥签名验证）
- 每个租户可创建最多 **20 个应用**，每个应用最多 **50 个接收端点**
- 租户之间数据完全隔离

### 事件模型
- 三段式事件命名：`domain.entity.action`（如 `order.payment.completed`）
- 支持租户自定义事件类型，也可使用平台预置通用类型
- 订阅支持通配符匹配（如 `order.*` 匹配 order 域下所有事件）
- 事件体 JSON 格式，单事件最大 **256KB**

### 签名与安全
- 使用 HMAC-SHA256 对 `timestamp + requestBody` 签名
- 签名值放在请求头 `X-Webhook-Signature`
- 时间戳 5 分钟内有效，防重放攻击
- 密钥轮换支持 **72 小时双签过渡期**，新旧密钥同时签名

### 投递引擎
- **超时阈值**：30 秒
- **失败响应**：非 2xx 视为失败
- **指数退避重试**：10s → 30s → 2min → 10min → 1h → 6h，最多 6 次
- **死信队列**：重试耗尽后入库，支持查看/单条重发/批量重发/批量丢弃
- **速率限制**：每个端点独立限速（默认每秒 50 次），超出排队而非丢弃
- **顺序保证**：同一(租户, 应用, 端点)组合按发布顺序投递

### 端点健康管理
- **连续 5 次**投递失败 → 标记不健康并暂停
- 暂停后每 **10 分钟**发送探测请求（空 payload POST）
- **连续 3 次**探测成功 → 自动恢复，积压事件按顺序补发
- 暂停期间新事件继续入队，不丢弃

### 管理面板
- 登录 / 注册租户账号
- 事件流量概览（每小时投递量 / 成功率 / 平均响应时间）
- 端点健康状态 + 最近 **50 条投递日志**（请求头/体/响应码/体/耗时）
- 手动触发测试投递，实时展示结果
- 告警规则配置（失败率超阈值时站内通知）

### 指标统计
- 实时统计租户/应用/端点维度的：
  - 投递成功率 / 失败率
  - 平均延迟
  - 队列深度
  - 死信数量
- 按分钟/小时/天聚合，前端图表展示趋势

## 技术栈

| 组件 | 技术 |
|------|------|
| 前端 | Svelte 4 + TypeScript + Vite 5 |
| 后端 | NestJS 10 + Node.js 20 + TypeScript |
| 数据库 | PostgreSQL 16 (TypeORM) |
| 队列/缓存 | Redis 7 (ioredis) |
| 定时任务 | @nestjs/schedule |
| 容器 | Docker Compose + Alpine 镜像 |
| 前端分发 | Nginx Alpine |

## 项目结构

```
webhook-gateway/
├── backend/                 # NestJS 后端
│   ├── src/
│   │   ├── auth/            # 认证（JWT + API Key）
│   │   ├── apps/            # 应用管理
│   │   ├── endpoints/       # 端点管理
│   │   ├── events/          # 事件发布
│   │   ├── signature/       # HMAC 签名服务
│   │   ├── delivery/        # 投递引擎（核心）
│   │   ├── metrics/         # 指标统计聚合
│   │   ├── alerts/          # 告警规则与告警记录
│   │   ├── logs/            # 投递日志 + 死信队列 API
│   │   ├── entities/        # TypeORM 数据库实体
│   │   ├── redis/           # Redis 服务封装
│   │   ├── config/          # 配置模块
│   │   ├── database/        # 数据库配置
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── Dockerfile           # node:20-alpine 多阶段构建
│   └── package.json
├── frontend/                # Svelte 前端
│   ├── src/
│   │   ├── pages/           # 路由页面（9个）
│   │   ├── components/      # 通用组件
│   │   ├── lib/             # API 封装 + 全局 Store
│   │   ├── App.svelte       # 主布局（侧边栏 + 顶栏）
│   │   └── main.ts
│   ├── nginx.conf           # 前端 + API 反向代理
│   ├── Dockerfile           # nginx:alpine
│   └── package.json
├── docker-compose.yml       # 4 容器编排
├── .env.example
└── README.md
```

## 快速启动

### 一、使用 Docker Compose（推荐）

#### 1. 准备环境变量

```bash
cp .env.example .env
# 建议修改 .env 中的默认密码，特别是 JWT_SECRET
```

#### 2. 一键启动所有服务

```bash
docker compose up -d --build
```

首次启动会构建前后端镜像（需要几分钟），然后依次启动：
- `postgres:16-alpine` → `webhook-gateway-postgres` (5432)
- `redis:7-alpine` → `webhook-gateway-redis` (6379)
- backend (NestJS) → `webhook-gateway-backend` (3000)
- frontend (Nginx) → `webhook-gateway-frontend` (8080)

#### 3. 等待服务就绪

```bash
docker compose logs -f backend
# 看到 "Webhook Gateway running on http://0.0.0.0:3000" 即启动完成
# 或者 curl http://localhost:3000/health
```

#### 4. 访问管理面板

浏览器打开：**http://localhost:8080**

- 点击「立即注册」创建租户账号（输入名称 / 邮箱 / 密码）
- 登录后即可使用全部功能

---

### 二、本地开发模式（不用 Docker）

#### 前置依赖
- Node.js ≥ 20
- PostgreSQL ≥ 16
- Redis ≥ 7

#### 1. 启动基础设施

```bash
# 方式 A：单独起 Postgres + Redis
docker run -d --name pg16 \
  -e POSTGRES_USER=webhook \
  -e POSTGRES_PASSWORD=webhook_secret_2024 \
  -e POSTGRES_DB=webhook_gateway \
  -p 5432:5432 postgres:16-alpine

docker run -d --name redis7 \
  redis:7-alpine redis-server --requirepass redis_secret_2024 \
  -p 6379:6379
```

#### 2. 启动后端

```bash
cd backend
cp .env.example .env   # 确认 DB/Redis 配置指向本地
npm install
npm run start:dev      # NestJS watch 模式 → http://localhost:3000
```

API 文档：http://localhost:3000/api/docs （Swagger）

#### 3. 启动前端

```bash
cd frontend
npm install
npm run dev            # Vite dev server → http://localhost:5173
# Vite 已配置 /api 代理到 localhost:3000
```

---

## 核心 API 示例

### 1. 注册租户

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "示例租户",
    "email": "demo@example.com",
    "password": "demo123456"
  }'
```

返回值中包含：
- `accessToken`：JWT Token，用于管理后台 API
- `apiKeys.publicKey`：公钥（发布事件用）
- `apiKeys.privateKey`：私钥（接收端验证签名用，务必保存）

### 2. 创建应用

```bash
export TOKEN=<上面返回的 accessToken>

curl -X POST http://localhost:3000/api/apps \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"订单系统","description":"电商订单相关事件"}'
```

### 3. 创建接收端点

```bash
export APP_ID=<上一步返回的应用 id>

curl -X POST http://localhost:3000/api/endpoints/app/$APP_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "订单通知接收",
    "url": "https://your-domain.com/webhook/orders",
    "subscribedEvents": ["order.*", "payment.refunded"],
    "rateLimitPerSecond": 50
  }'
```

### 4. 使用 API Key 发布事件

```bash
export PUB_KEY=<注册时返回的公钥 pk_xxx>

curl -X POST http://localhost:3000/api/v1/events/publish \
  -H "X-API-Key: $PUB_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "appId": "'$APP_ID'",
    "eventType": "order.payment.completed",
    "eventSource": "order-service",
    "payload": {
      "orderId": "O20240601001",
      "amount": 299.00,
      "channel": "alipay",
      "userId": "U123456"
    }
  }'
```

平台会自动：
1. 校验事件格式与大小（≤256KB）
2. 匹配所有订阅了 `order.*` 或 `order.payment.completed` 的端点
3. 为每个端点生成独立投递任务，按限速出队
4. 用私钥做 HMAC-SHA256 签名后 POST 到端点 URL

### 5. 接收端验证签名（Node.js 示例）

```javascript
import crypto from 'crypto';

function verify(req, signingSecret) {
  const ts = parseInt(req.headers['x-webhook-timestamp'], 10);
  const sig = req.headers['x-webhook-signature'];
  const oldSig = req.headers['x-webhook-signature-transition'];

  // 防重放：时间差 > 5 分钟拒绝
  if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) return false;

  const message = `${ts}.${JSON.stringify(req.body)}`;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', signingSecret)
    .update(message)
    .digest('hex');

  const ok1 = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  const ok2 = oldSig ? crypto.timingSafeEqual(Buffer.from(oldSig), Buffer.from(expected)) : false;
  return ok1 || ok2;  // 双签模式下任意一把通过即有效
}
```

---

## 投递请求头说明

| 请求头 | 示例 | 说明 |
|--------|------|------|
| `X-Webhook-Timestamp` | `1717233600000` | 签名时间戳，毫秒 |
| `X-Webhook-Signature` | `sha256=abc123...` | HMAC-SHA256 签名 |
| `X-Webhook-Signature-Transition` | `sha256=def456...` | 密钥过渡期存在（旧密钥签名） |
| `X-Webhook-API-Key` | `pk_xxx` | 租户公钥 |
| `X-Webhook-Event-Id` | `evt_171723...` | 唯一事件 ID，可用于去重 |
| `X-Webhook-Event-Type` | `order.payment.completed` | 事件类型 |
| `X-Webhook-Attempt` | `2` | 第几次尝试（1-6） |
| `X-Webhook-Delivery-Id` | `<eventId>-<epId>-<n>` | 本次投递唯一 ID |
| `X-Webhook-Probe` | `true` | 仅端点探测请求存在 |

---

## 重试与退避策略

```
第1次重试 →  延迟 10 秒
第2次重试 →  延迟 30 秒
第3次重试 →  延迟 2 分钟
第4次重试 →  延迟 10 分钟
第5次重试 →  延迟 1 小时
第6次重试 →  延迟 6 小时
全部失败 →  进入死信队列
```

死信队列支持：
- 单条/批量查看详情
- 单条/批量重发（生成新事件，重新入投递队列）
- 单条/批量丢弃（逻辑删除，保留记录）

---

## 配置参数（docker-compose.yml environment）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `TRANSITION_PERIOD_HOURS` | 72 | 密钥双签过渡期（小时） |
| `DELIVERY_TIMEOUT_MS` | 30000 | 单投递 HTTP 超时（毫秒） |
| `MAX_RETRY_COUNT` | 6 | 最大重试次数 |
| `UNHEALTHY_THRESHOLD` | 5 | 端点不健康连续失败阈值 |
| `PROBE_INTERVAL_MS` | 600000 | 探测间隔（毫秒，10分钟） |
| `PROBE_SUCCESS_THRESHOLD` | 3 | 恢复健康所需连续探测成功数 |
| `DEFAULT_RATE_LIMIT` | 50 | 新端点默认限速（次/秒） |
| `MAX_APPS_PER_TENANT` | 20 | 每租户最大应用数 |
| `MAX_ENDPOINTS_PER_APP` | 50 | 每应用最大端点数 |
| `MAX_EVENT_SIZE_BYTES` | 262144 | 单事件最大字节（256KB） |
| `JWT_SECRET` | - | **生产环境必须修改** |

---

## 常见问题

**Q: 不同端点之间会互相阻塞吗？**
不会。每个端点有独立队列和速率限制，投递引擎按端点并行处理。

**Q: 同一个端点如何保证顺序？**
每个端点队列按事件的 sequenceNumber 排列，前一个事件完成（成功或彻底失败）后才取下一个。

**Q: 端点不健康期间的新事件会丢吗？**
不会。事件依然入队，只是暂停消费。端点恢复后按原顺序补发。

**Q: 生产环境需要额外做什么？**
1. 修改 `.env` 中所有默认密码/密钥
2. 为 postgres 和 redis 挂持久化卷（compose 中已配置）
3. 前端配置 HTTPS 证书
4. 按需备份 PostgreSQL

**Q: 默认预置了哪些事件类型？**
`system.ping.test`、`system.health.check`、`user.created/updated/deleted`、`order.*`、`payment.*`、`product.*`、`inventory.*`、`invoice.*` 等 20+ 通用类型，租户也可在应用中自定义。

---

## License

MIT
