# Web 控制台

RustPBX 内置完整的 Web 管理控制台，无需单独部署前端。技术栈：服务端 minijinja 模板 + Alpine.js + Tailwind CSS 4 + Chart.js（非 SPA，构建产物入库，运行时无需 Node）。

## 访问

- 地址：`http://<host>:8080/console/`（`[console] base_path` 可改）；
- 首次启动用 CLI 创建超管：`rustpbx --conf config.toml --super-username admin --super-password changeme`；
- 登录后建议立即修改密码，商业版可启用 TOTP 双因子（「账户安全」页）。

## 功能一览

| 页面 | 功能 |
|---|---|
| **仪表盘** | 交易压力、呼叫方向、活跃通话实时预览 |
| **分机** | CRUD、WebRTC 标记、独立 SIP 密码、批量导入 |
| **路由** | 规则 CRUD / 克隆 / 启停、改写、匹配测试 |
| **SIP 中继 · DID** | 中继 CRUD、认证密码、依赖查询、健康状态 |
| **通话记录** | CDR 列表与详情、录音播放 / 下载、SipFlow 信令阶梯图、媒体质量（丢包 / jitter）、CDR JSON、CSV 导出 |
| **实时通话** | 活跃呼叫列表、通话内命令（监听 / 强插 / 转接 / 挂断）、userdata |
| **诊断** | 对话查看、中继 OPTIONS 测试、路由评估、Locator 查询、**内嵌 JsSIP 话机**（注册 / 拨号 / DTMF / ICE 探测） |
| **错误码** | SIP 错误码字典 |
| **指标** | 运行指标页 + Prometheus 端点信息 |
| **报表** | 通话 / 中继 / 路由 / 语音信箱 / Locator 报表、中继热力图、挂机原因分布、导出 |
| **插件** | 插件状态、启用开关、许可证验证 |
| **通知** | 未读计数、标记已读 |
| **设置** | 平台 / 代理 / 存储 / 安全 / RWI / 集群配置、**在线日志**（最近 / 实时跟随 / 多节点）、用户与角色管理 |
| **安全封禁** | 当前封禁列表、手动解封 |

插件还会注入自己的页面：队列（`/queues`）、转写（`/transcript`）、ACME（`/acme`）、归档等，侧栏自动追加。

## 权限（RBAC）

用户 → 角色 → 权限集（`resource:action`）。控制台「设置 → 用户 / 角色」管理；页面与 API 共用同一套权限检查。常用权限：`system:read/write`、`extensions:*`、`trunks:*`、`routes:*`、`cdr:read`、`sipflow:read`、`callcontrol:command`、`ami:access`。

## 多语言

内置中文与英文（`locales/zh.toml`、`locales/en.toml`），插件自带独立翻译文件。语言检测优先级：`locale` cookie → `Accept-Language` → 配置默认。顶栏可切换。

## 在线日志

「设置 → 日志」提供（仅超管）：

- **最近日志**：读取日志文件尾部；
- **实时跟随**：SSE 流式跟随日志写入；
- **多节点**：集群部署时可查看任一节点日志（经 AMI 代理转发）。

日志级别可在同页在线调整（EnvFilter 热替换，立即生效，无需重启）。

## 与 REST API 的关系

控制台页面调用的就是 `/api` 下的同源 REST API——你在控制台能做的一切，都能通过 REST API / RWI 编程完成。API Token 在「设置」里生成。

## WebRTC 话机

控制台「诊断」页内嵌 JsSIP 话机（注册、拨号、DTMF、ICE 探测）；另有独立整机页面 `/static/phone.html`。详见 [WebRTC 与软电话](/features/webrtc)。
