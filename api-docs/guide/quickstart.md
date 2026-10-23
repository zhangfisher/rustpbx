# 快速开始

RustPBX 提供两种安装方式：Docker（推荐）和源码构建。无论哪种，示例配置都能开箱启动一个完整可用的 PBX。

## 方式一：Docker（推荐）

```bash
mkdir -p rustpbx && cd rustpbx
curl -O https://raw.githubusercontent.com/restsend/rustpbx/main/config.toml.example

docker run -d --name rustpbx --net host \
  -v $(pwd)/config.toml.example:/app/config.toml \
  docker.cnb.cool/miuda.ai/rustpbx:commerce --conf /app/config.toml
```

首次启动后，创建管理员账号（只需一次）：

```bash
docker exec rustpbx /app/rustpbx --conf /app/config.toml \
  --super-username admin --super-password changeme
```

### 选择版本

四个 Docker 镜像对应四个版本（内核相同、预置插件不同），见[项目概览 · 版本](/guide/introduction#版本-editions)。例如运行联络中心版：

```bash
docker run -d --name rustpbx --net host \
  -v $(pwd)/config.toml:/app/config.toml \
  docker.cnb.cool/miuda.ai/rustpbx:cc --conf /app/config.toml
```

::: tip 试用模式
商业版本开箱即运行在试用模式；在配置文件加 `[licenses]` 节可激活正式密钥。详见[插件、控制台与存储](/config/07-addons-admin-storage_zh)。
:::

## 方式二：源码构建

```bash
git clone --recurse-submodules https://github.com/restsend/rustpbx
cd rustpbx
cargo run --release -- --conf config.toml.example
```

交叉编译 Windows 64 位（在 Linux / macOS 上）：

```bash
rustup target add x86_64-pc-windows-gnu
cargo build --release --target x86_64-pc-windows-gnu
# 产物：target/x86_64-pc-windows-gnu/release/rustpbx.exe
```

::: warning 关于子模块
克隆时务必加 `--recurse-submodules`，否则 `frontend/` 子模块为空，Web 控制台页面会缺失。
:::

## 验证安装

示例配置启动后，你会得到：

| 入口 | 值 |
|---|---|
| Web 控制台 | `http://localhost:8080/console/` |
| SIP Proxy | `udp://localhost:15060` |
| 测试分机 | `bob` / `alice`，密码 `123456` |

### 用在线探测服务验证

从任意已注册分机（例如 `bob`）拨打以下号码，无需注册账号即可验证 SIP + 双向 RTP 是否端到端正常：

| 拨打 | 得到 |
|---|---|
| `sip:echo@probe.rustpbx.com` | 接通并回声（你听到自己的声音） |
| `sip:ivr@probe.rustpbx.com` | IVR 菜单 —— 按 1 / 2 / * |
| `sip:voicemail@probe.rustpbx.com` | 响铃 5 秒后进入语音留言录制 |
| `sip:reject` / `busy` / `offline` | 返回 486 / 486 / 480 |

交互式测试页面：[probe.rustpbx.com](https://probe.rustpbx.com)。

**如果你能听到自己的回声，说明信令和媒体都是通的** —— 这是最快的排障信号。

## 最小配置

不想用完整示例？下面是最小可用的 `config.toml`：

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

不写配置文件直接 `cargo run --release` 也可以 —— 内置默认值：HTTP `0.0.0.0:8080`、SQLite、SIP UDP `5060`。

::: tip 部署建议
正式部署时请**显式传 `--conf`** 指定配置文件路径；相对路径按进程工作目录解析。
:::

## 下一步

- 逐项了解配置：[配置总览](/config/)
- 理解进程与模块：[系统架构](/guide/architecture)
- 开发呼叫应用：[呼叫模型与路由](/guide/call-model)
- 对接 CRM / 计费：[API 集成指南](/guide/api-integration)
