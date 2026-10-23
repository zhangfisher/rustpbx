# 快速开始

## 方式一：Docker（推荐）

```bash
mkdir -p rustpbx && cd rustpbx
curl -O https://raw.githubusercontent.com/restsend/rustpbx/main/config.toml.example

docker run -d --name rustpbx --net host \
  -v $(pwd)/config.toml.example:/app/config.toml \
  docker.cnb.cool/miuda.ai/rustpbx:commerce --conf /app/config.toml

# 首次运行：创建管理员账号
docker exec rustpbx /app/rustpbx --conf /app/config.toml \
  --super-username admin --super-password changeme
```

> 也可以使用社区版镜像：`ghcr.io/restsend/rustpbx:latest`。

## 方式二：源码构建

```bash
git clone --recurse-submodules https://github.com/restsend/rustpbx
cd rustpbx
cargo run --release -- --conf config.toml.example
```

交叉编译 Windows 64 位（在 Linux/macOS 上）：

```bash
rustup target add x86_64-pc-windows-gnu
cargo build --release --target x86_64-pc-windows-gnu
# 产物：target/x86_64-pc-windows-gnu/release/rustpbx.exe
```

::: tip 零配置也能跑
不带任何配置直接 `cargo run --release` 也可以——内置默认值：HTTP `0.0.0.0:8080`、SQLite 数据库、SIP UDP `5060`。
:::

## 验证安装

启动后开箱即得：

| 入口 | 地址 |
|---|---|
| Web 控制台 | `http://localhost:8080/console/` |
| SIP Proxy | `udp://localhost:15060` |
| 测试分机 | `bob` / `alice`，密码 `123456` |
| SIP over WebSocket | `ws://localhost:8080/ws`（子协议 `sip`） |
| RWI WebSocket | `ws://localhost:8080/rwi/v1` |

用任意注册分机（如 `bob`）拨打公网探测号码即可验证全链路（SIP + 双向 RTP）：

| 拨打 | 得到 |
|---|---|
| `sip:echo@probe.rustpbx.com` | 回声测试——原样回放你的音频 |
| `sip:ivr@probe.rustpbx.com` | IVR 菜单——按 1 / 2 / * |
| `sip:voicemail@probe.rustpbx.com` | 响铃 5 秒后录制语音留言 |
| `sip:reject` / `busy` / `offline` | 486 / 486 / 480 |

交互式探测页面：[https://probe.rustpbx.com](https://probe.rustpbx.com)

## 最小配置

想用自己的 `config.toml`？这些就够了：

```toml
http_addr = "0.0.0.0:8080"
database_url = "sqlite://rustpbx.sqlite3"

[proxy]
addr = "0.0.0.0"
udp_port = 5060
modules = ["auth", "registrar", "call"]

[[proxy.user_backends]]
type = "memory"
users = [{ username = "1001", password = "password" }]

[console]
base_path = "/console"
```

## 接入第一个 Webhook 路由

编辑配置，把入局呼叫交给你的 HTTP 服务决策：

```toml
[proxy.http_router]
url = "https://your-service.example.com/route"
fallback_to_static = true   # 你的服务不可用时回落到静态路由表
```

你的服务收到 `POST`（JSON 包含 `call_id` / `from` / `to` / `direction` / `headers` / `body`），返回：

```json
{ "action": "forward", "targets": ["sip:1001@internal"], "record": true }
```

支持的动作：`forward` · `reject` · `abort` · `spam` · `not_handled`。详见 [HTTP Router](/interfaces/http-router)。

## 下一步

- 了解整体设计：[系统架构](/guide/architecture)
- 理解 call_id / session_id 等术语：[核心概念](/guide/concepts)
- 配置生产环境：[配置体系总览](/config/overview)
