# 名词解释

本页汇总文档中出现的关键名词，按主题分组，每个名词一个子章节。首次接触的朋友可先通读一遍，
再回到具体接口页面查阅。

<!-- sorbetowa:start-marker -->

## SIP 领域

### SIP (Session Initiation Protocol)

会话发起协议，VoIP 领域最核心的信令协议，用于建立、修改和终止多媒体会话（通常是语音通话）。
RustPBX 本身是一个用 Rust 实现的 SIP PBX（程控交换机）：终端通过 SIP REGISTER 注册，
通话通过 SIP INVITE 建立。常见的 SIP 方法还有 `ACK`、`BYE`、`CANCEL`、`OPTIONS`、`REFER`、`NOTIFY`。

相关：[诊断](/api/diagnostics)（SIP 对话转储、OPTIONS 探活）、[SipFlow](/api/sipflow)。

### PBX

Private Branch Exchange，程控电话交换机。企业内部的"小总机"：内线分机之间互相拨打免费，
呼入电话由总机/IVR 接听后转接，呼出电话经中继汇入运营商网络。RustPBX 即一个软件化的 PBX。

### 分机 (Extension)

话机 / 软电话在 PBX 上的账号，形如 `1001`。分机通过 SIP REGISTER 注册到 RustPBX 后即可拨打与接听。
REST 侧通过 [分机接口](/api/extensions) 管理（创建、修改、口令揭示、CSV 批量导入），
分机可归属部门、可配置呼叫转移与语音信箱开关。

### 中继 (Trunk) / SIP 中继

PBX 与**上游运营商、网关或其他 PBX** 之间的对接线路。本机分机互相呼叫走内部路由，
打到外网（如固话、手机号）时经由中继送出；反之运营商来的入站电话也经中继进入后再路由到分机。
RustPBX 中一条中继对应一个对端 SIP 地址（`sip_server`），带鉴权用户名/口令、
方向（入站/出站/双向）、传输（UDP/TCP/TLS/WS/WSS）、并发上限（`max_concurrent`）、
每秒呼叫数（`max_cps`）、DID 号段等属性，见 [SIP 中继](/api/sip-trunk)。

### 注册 / Locator / AOR

终端（话机）用 SIP REGISTER 告诉 PBX"我当前在哪个 IP:端口"，这个过程叫**注册**。
RustPBX 的注册位置数据库称为 **Locator**，条目以 **AOR**（Address of Record，
如 `sip:1001@pbx.local`）为键，记录目标地址、过期时间（`expires`）、传输协议与
User-Agent 等。[诊断接口](/api/diagnostics) 可查询（`locator/lookup`，
`total > 0` 即在线）与清理绑定。

### Invite / Dialog / Leg / Session

- **INVITE**：发起一路呼叫的 SIP 方法，是呼叫建立流程的起点。
- **Dialog（对话）**：由 Call-ID、from-tag、to-tag 三元组标识的一次 SIP 会话，
  一路通话在信令层对应一个 dialog。
- **Leg（腿）**：一路呼叫中的一个分支/参与方。转接、队列分发后会产生多条腿，
  每条腿对应自己的 CDR 记录（`all_legs=true` 可在 CDR 查询中看到子腿）。
- **Session（逻辑会话）**：RustPBX 中一路通话的唯一标识 `session_id`，
  把同一逻辑通话的多条腿（主 CDR + 子腿）聚合在一起，[通话控制](/api/call-control)、
  [录音产物清单](/api/recording) 都以它寻址。

### Call-ID

SIP 报文头中的全局唯一标识，用来把同一通呼叫的所有 SIP 消息归到一处。
文档中写作 `call_id`：SipFlow 按 `call_id` 归档信令、CDR 的 `{id}` 参数
也接受 Call-ID 作为寻址方式之一。

### RTP / SDP / WebRTC

- **RTP**（Real-time Transport Protocol）：承载实际语音/视频媒体数据的传输协议，
  与 SIP 信令分离——SIP 负责"打电话"，RTP 负责"传声音"。
- **SDP**（Session Description Protocol）：在 SIP 报文里描述"我能编解码什么、
  我的媒体地址端口是多少"的协商格式；通话命令中的 `sdp` 字段即应答用的 SDP。
- **WebRTC**：浏览器原生的实时音视频协议栈，通过 WSS 接入 RustPBX 时即走 WebRTC
  （DTLS-SRTP 加密媒体），Locator 中的 `supports_webrtc` 标记终端是否属于此类。

### DTMF

双音多频，即按键音（`0-9`、`*`、`#`）。拨 IVR 菜单、输密码都靠它。
可通过 [通话命令](/api/call-control) 的 `send_dtmf` 主动向对端发送按键。

## 产品与功能

### SipFlow

RustPBX 的**信令/媒体归档流水线**（独立 crate `rustpbx-sipflow` + 二进制 `sipflow`：
按通话归档 SIP 报文与 RTP 媒体，可按需合成阶梯图与 WAV。数据按时间分桶
（`sipflow.db` / `data.raw`），后端由 `[sipflow]` 配置段决定（`none` / `local` / 对象存储等）。
注意它查询以 **`call_id`** 寻址：

| 能力 | 接口 |
| :--- | :--- |
| 信令阶梯图（SIP 消息时间轴 + RTP 流） | `GET /api/sipflow/flow/{call_id}` |
| 按时间窗从 RTP 合成 WAV 媒体 | `GET /api/sipflow/media/{call_id}` |
| 读写归档配置 | `GET` / `PUT /api/sipflow/settings` |

SipFlow 与 [录音](/api/recording) 可组合：`[recording].type=sipflow` 时不产独立录音文件，
媒体入 SipFlow 归档；反之只要配置了 `[sipflow]`，CDR 的 `sip-flow` 阶梯图
（`GET /api/call-records/{id}/sip-flow`）就直接读它。未配置后端时回退到本地 JSONL。

详见 [SipFlow 信令与媒体](/api/sipflow)。

### CDR (Call Detail Record)

通话详细记录：一路通话结束后落库的"账单级"记录，含主叫、被叫、方向、起止时间、
时长、挂断原因、中继/路由归属、录音与转写链接等。REST 路径为 `/api/call-records`，
支持列表查询、CSV 导出（上限 5 万行）、打标签/写备注、删除，
详见 [通话记录 CDR](/api/call-records)。

### Routing (路由) / 路由栈

**路由**决定一路呼叫"往哪走"：按 `direction`（入站/出站/内部）+ `match` 正则匹配
（如被叫 `^00(\d+)$`）命中规则后，经 `rewrite` 改写号码，再按 `action` 执行目标动作
（送到中继 / 队列 / 语音信箱 / IVR），中继多条时用 `select` 策略选择
（`roundrobin` 轮询、`weight` 权重、`hash` 哈希）。见 [路由](/api/routing)。

**路由栈**是多来源规则的**优先级总表**：路由可能来自数据库规则、配置文件与插件贡献方，
栈上可调整贡献方顺序、启停与求值模式（`evalMode`），见
[路由栈](/api/routing#路由栈多来源优先级)。

修改路由后不会立即生效，会进入"待重载"状态（见下方**热重载**）。

### Queue (呼叫队列)

呼叫中心的**排队**能力：坐席忙时来电进入队列等待，按策略拨叫坐席。常见配置（`spec`）：

- `strategy.mode`：`sequential`（轮询）/ `parallel`（并行振铃）
- `hold`：等待音乐（`audio_file`、`loop_playback`）
- `voice_prompts`：排队位置、转接、下班等各种提示音
- `fallback`：等待超时/失败后的转移目标与 SIP 失败码

路由的 `action.target_type` 取 `queue` 即可把呼叫送进队列。
接口见 [呼叫队列](/api/queues)。

### Presence (状态呈现)

分机/坐席的**在线状态**，供控制台、坐席软电话与业务系统同步。状态值如
`idle`、`busy`、`ringing`、`wrapup`（话后整理）、`dnd`（免打扰）、`away`、`offline`，
可带备注（`note`）与活动标签（`activity`）。按分机读写，见 [Presence](/api/presence)。

::: info 集群语义
状态归属注册节点：写请求要落到该分机**注册所在节点**，否则会被属主节点拒绝。
:::

### IVR (Interactive Voice Response)

交互式语音应答，即"欢迎致电请按 1"的自动菜单。接听后来电按 DTMF 按键进入不同分支，
路由的 `action.target_type` 可取 `ivr`；`[proxy].ivr_fallback` 配置兜底 IVR。

### 语音信箱 (Voicemail)

无人接听/下班时间的留言信箱，每个分机一个信箱（可经 `voicemail_disabled` 关闭）。
路由的 `action.target_type` 可直接把呼叫送到语音信箱，
[报表](/api/reports) 提供信箱趋势统计。

### 录音 (Recording) 与转写

通话录音由 `[recording]` 配置段管理（`type`：`disabled` / `local` / `http` / `s3` / `sipflow`），
产物为 WAV（A/B 双轨或混合，可按 `stream`、`segment` 选择播放），
见 [录音播放与下载](/api/recording)。通话中的**实时转写**需配置
`[proxy.transcript.remote]` 流式 ASR，通过通话命令 `start_transcription` /
`stop_transcription` 控制（引用计数管理，见 [通话控制](/api/call-control)）。

### Loopback 与外呼 (Originate)

- **Loopback**：让打出的呼叫**绕回本 PBX**再走一遍路由/IVR，常用于模拟外线行为测试
  拨号计划。
- **Originate（外呼发起）**：不经人手主动发起一路呼叫（如点击外呼、机器人外呼），
  经 AMI 的 `POST /ami/v1/outbound/dial` 提交，以 **SSE** 流式返回振铃、接听、
  挂断等进度事件；请求体支持 `on_answer`（接听后继续执行拨号计划 / 桥接 / 入队 /
  调应用 / Webhook）与 `on_failure` 回调，需启用 `[outbound]`，
  见 [外呼 SSE 与集群](/api/ami-cluster)。

### RWI (Real-time Web Interface)

RustPBX 的**实时事件通道**：WebSocket 承载通话事件（振铃、接听、DTMF、
`call_userdata_updated` 等）与命令下发（`answer`、`attach_call`、`originate`、
`sip.message` 等），并可经 RWI Webhook 转发给业务系统。相关配置在 `[rwi]`
（连接数上限、令牌 scopes、上下文应答策略）与设置页，
出站事件概览见[出站 Webhook 概览](/apiguide/webhooks)。

### AMI (Admin Management Interface)

RustPBX 的**运维级低层接口**，默认前缀 `/ami/v1`，与业务用的 Console REST `/api`
相互独立。鉴权靠 IP 白名单 `[ami].allows`（默认仅本机）、集群对端或超管会话。
覆盖健康检查、SIP 对话转储、配置热重载、优雅停机、封禁管理、外呼 SSE 与集群操作，
见 [AMI API 总览](/api/ami)。

### 热重载 / 待重载 (Hot Reload / Pending Reloads)

修改路由、中继、队列、ACL 等配置后**无需重启进程**即可生效的机制——但改动先登记为
"待重载"，要通过 `POST /ami/v1/reload/{trunks,routes,acl,app,queues,ivr}`
（或控制台按钮）触发才真正应用。集成方可在批量改配置后轮询
`GET /api/pending-reloads` 直至清空，见 [热重载与运维](/api/ami-ops)。

### 出站 Webhook

RustPBX **主动回调你服务**的事件出口，与入站 REST 相对：HTTP Router 动态路由、
User Backend 鉴权、Locator 注册事件、CDR 推送、录音上传、RWI 事件流。
总览与配置段见 [出站 Webhook 概览](/apiguide/webhooks)。

## 接口与认证

### Console REST API

业务资源的入站 HTTP 接口组，默认前缀 `/api`（`[console].api_prefix`）：分机、中继、
路由、CDR、录音、队列、诊断、报表、设置与用户体系的增删改查，以及通话控制命令。
面向 CRM、计费、AI 集成方，详见[接口分类一览](/apiguide/categories)。

### Token / Scope / 权限点

- **API Token**：`config.toml` 里 `[[console.api_tokens]]` 声明的静态令牌，
  请求带 `Authorization: Bearer <token>` 使用。
- **Scope**：令牌的粗粒度授权范围（如 `call.control`、`recording`、`extensions`），
  留空 = 超级管理员全量权限（启动时有告警）。
- **权限点**：`resource:action` 形式的细粒度权限，如 `cdr:read`、`callcontrol:command`、
  `extensions:delete`，由角色（Role）授予用户，超级用户直接放行。

三者关系与完整权限点表见 [认证与权限](/apiguide/authentication)。

### Session Cookie 与 CSRF

控制台登录后使用会话 Cookie 认证；**Cookie 认证的写操作**还需携带 CSRF 头，
Bearer Token 请求则跳过 CSRF 校验。见 [认证与权限](/apiguide/authentication)。

### ListQuery 与分页

所有列表类接口统一使用 **POST + JSON 请求体**（`ListQuery`）：
`page`、`per_page`（夹取到 `[per_page_min, per_page_max]`，默认 5–100）、
`filters`、`sort`；响应为 `{ page, per_page, total_pages, total_items, items }`，
见 [通用约定](/apiguide/conventions)。

### 仪表盘与报表

- **仪表盘**：控制台首页的实时指标 JSON（最近窗口呼叫量、接通率 ASR、平均通话时长 ACD、
  当前并发占用），`GET /api/dashboard/data`。
- **报表**：按时间桶（`hour`/`day`/`week`）聚合的历史统计，
  `GET /api/reports/v2/{call,trunk,route,voicemail,locator}` + CSV 导出，
  见 [报表](/api/reports)。

### 集群 (Cluster)

多节点部署：节点配置于 `[cluster].peers`，活动通话、会话 user_data、Presence 等
在节点间复制，响应中的 `node` 字段标识数据来源（`local` 或对端节点地址）。
集群对端可直接访问 AMI。集群操作属 commerce 构建能力，
见 [外呼 SSE 与集群](/api/ami-cluster)。

### 插件 (Addon)

运行时可启停的功能扩展，`POST /api/addons/toggle` 把插件 id 写入/移出
`config.toml` 的 `[proxy].addons` 数组（需 `system:write`），
见 [通知与其他](/api/misc#插件管理)。