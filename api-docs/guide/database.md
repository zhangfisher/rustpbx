# 数据库表结构

## 概述

RustPBX 的数据分布在四类存储里，主库中的表在进程启动时由 sea-orm 自动建表 / 迁移（全部带 `IF NOT EXISTS` 与列存在性检查，可重复执行）：

| 存储 | 配置项 | 默认值 | 存放内容 |
|---|---|---|---|
| **主库（控制台库）** | `database_url` | `sqlite://rustpbx.sqlite3` | 用户、部门、分机、中继、路由、CDR、RBAC、集群、队列等核心表 |
| **Locator 库** | `[proxy].locator` `type = "database"` | 未启用（默认内存 Locator） | `rustpbx_locations` SIP 注册位置 |
| **SipFlow 本地缓冲库** | `[sipflow]` 本地后端 | 存储根目录下按天分桶的 `sipflow.db` | `call_meta` / `sip_msgs` / `media_msgs` |
| **外部 / 自定义表** | `[proxy.user_backends]`、`[callrecord]` | 不启用 | 业务方已有的用户表、自定义 CDR 表 |

主库支持 **SQLite / PostgreSQL / MySQL**，通过 `database_url` 切换；连接池由 `[database_pool]` 控制。时间类列统一存 UTC；少数列（封禁、Locator 过期时间）存 Unix 秒级时间戳。

::: tip 类型写法
下表类型按逻辑类型给出：`BIGINT`（含自增主键）、`VARCHAR(n)`、`TEXT`、`INT`、`DOUBLE`、`BOOLEAN`、`JSON`、`TIMESTAMP`（`timestamp with time zone`）。SQLite 会把 `VARCHAR(n)` 处理成 TEXT 亲和性且不强制长度，PostgreSQL / MySQL 才会严格执行长度限制。
:::

## 主库表一览

| 表名 | 用途 |
|---|---|
| `rustpbx_users` | 控制台用户账号（登录、MFA、会话纪元） |
| `rustpbx_departments` | 部门 / 组织单元 |
| `rustpbx_extensions` | 分机（号码、SIP 密码、呼叫转移、语音邮箱开关） |
| `rustpbx_extension_departments` | 分机 ↔ 部门 多对多关联 |
| `rustpbx_sip_trunks` | SIP 中继（运营商线路、注册、限速、状态） |
| `rustpbx_routes` | 路由规则（方向、优先级、匹配与改写、目标中继组） |
| `presence_states` | 呈现 / 在线状态（SIP Presence 持久化） |
| `rustpbx_call_records` | 通话记录 CDR（核心大表） |
| `rustpbx_cdr_daily` | CDR 按日预聚合（仪表盘 / 报表下钻） |
| `rustpbx_frequency_limits` | 外呼频控 / 日限额 / 并发限额计数 |
| `rustpbx_roles` | RBAC 角色 |
| `rustpbx_role_permissions` | 角色权限点（`resource:action`） |
| `rustpbx_user_roles` | 用户 ↔ 角色 关联 |
| `rustpbx_banned_ips` | 认证失败封禁 IP |
| `system_notifications` | 系统通知（info / warning / update） |
| `config_entries` | 控制台在线配置存储（数据库模式） |
| `cluster_sessions` | 集群会话注册表（分布式会话定位） |
| `rustpbx_runtime_snapshots` | 运行时指标采样快照 |
| `rustpbx_queues` | 呼叫队列定义（queue 插件，建在主库） |
| `seaql_migrations` | 核心迁移跟踪表（插件为 `seaql_migrations_<插件 id>`） |

---

## 用户与组织

### `rustpbx_users` — 控制台用户账号

控制台登录主体，密码使用 Argon2 哈希存储，不保存明文。

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `email` | VARCHAR(255) | 邮箱，唯一 |
| `username` | VARCHAR(100) | 用户名，唯一 |
| `password_hash` | VARCHAR(255) | Argon2 密码哈希 |
| `reset_token` | VARCHAR(128) | 密码重置令牌 |
| `reset_token_expires` | TIMESTAMP | 重置令牌过期时间 |
| `last_login_at` | TIMESTAMP | 最近登录时间 |
| `last_login_ip` | VARCHAR(128) | 最近登录 IP |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间 |
| `is_active` | BOOLEAN | 是否启用（默认 `true`） |
| `is_staff` | BOOLEAN | 是否员工账号（默认 `false`） |
| `is_superuser` | BOOLEAN | 是否超级管理员（默认 `false`） |
| `mfa_enabled` | BOOLEAN | 是否启用 TOTP 双因素（默认 `false`） |
| `mfa_secret` | VARCHAR(64) | TOTP 密钥（Base32） |
| `auth_source` | VARCHAR(32) | 认证来源：`local` / `ldap` / `enterprise`，默认 `local` |
| `session_epoch` | BIGINT | 会话纪元，改密 / 重置密码时 +1，旧会话令牌立即失效（默认 `0`） |

索引：`email`、`username` 唯一。

### `rustpbx_departments` — 部门

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `name` | VARCHAR(120) | 部门名称，唯一 |
| `display_label` | VARCHAR(160) | 展示名 |
| `slug` | VARCHAR(120) | 短标识（URL / API 用），有索引 |
| `description` | TEXT | 描述 |
| `color` | VARCHAR(32) | 控制台展示颜色 |
| `manager_contact` | VARCHAR(160) | 负责人联系方式 |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间 |
| `metadata` | JSON | 扩展属性 |

索引：`idx_rustpbx_departments_slug (slug)`。

### `rustpbx_extensions` — 分机

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `extension` | VARCHAR(32) | 分机号，唯一索引 |
| `display_name` | VARCHAR(160) | 显示名 |
| `email` | VARCHAR(160) | 绑定邮箱（语音邮箱投递等） |
| `status` | VARCHAR(32) | 自定义状态文本 |
| `login_disabled` | BOOLEAN | 禁止登录控制台（默认 `false`） |
| `voicemail_disabled` | BOOLEAN | 关闭语音邮箱（默认 `false`） |
| `allow_guest_calls` | BOOLEAN | 允许未注册终端呼入（默认 `false`） |
| `sip_password` | VARCHAR(160) | SIP Digest 注册密码（覆盖用户后端） |
| `call_forwarding_mode` | VARCHAR(32) | 呼叫转移模式（如无条件 / 忙转 / 无应答） |
| `call_forwarding_destination` | VARCHAR(160) | 转移目标 URI / 号码 |
| `call_forwarding_timeout` | INT | 转移前等待秒数（范围 5–120，默认 30） |
| `registered_at` | TIMESTAMP | 最近一次成功注册时间 |
| `notes` | TEXT | 备注 |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间 |

索引：`idx_rustpbx_extensions_extension (extension)` 唯一。

### `rustpbx_extension_departments` — 分机 ↔ 部门关联

| 列 | 类型 | 说明 |
|---|---|---|
| `extension_id` | BIGINT | 分机 ID，联合主键，外键 → `rustpbx_extensions.id`（级联删除） |
| `department_id` | BIGINT | 部门 ID，联合主键，外键 → `rustpbx_departments.id`（级联删除） |
| `created_at` | TIMESTAMP | 加入时间 |

索引：`uniq_rustpbx_extension_departments_pair (extension_id, department_id)` 唯一。

---

## 线路与路由

### `rustpbx_sip_trunks` — SIP 中继

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `name` | VARCHAR(120) | 中继名，唯一索引 |
| `display_name` | VARCHAR(160) | 展示名 |
| `carrier` | VARCHAR(160) | 运营商 / 提供商 |
| `description` | TEXT | 描述 |
| `status` | VARCHAR(32) | 健康状态：`healthy` / `warning` / `standby` / `offline`（默认 `healthy`） |
| `direction` | VARCHAR(32) | 方向：`inbound` / `outbound` / `bidirectional`（默认 `bidirectional`） |
| `sip_server` | VARCHAR(160) | 对端 SIP 服务器地址 |
| `sip_transport` | VARCHAR(16) | 传输：`udp` / `tcp` / `tls`（默认 `udp`） |
| `outbound_proxy` | VARCHAR(160) | 出局代理地址 |
| `auth_username` | VARCHAR(160) | 注册 / 摘机认证用户名 |
| `auth_password` | VARCHAR(160) | 认证密码 |
| `default_route_label` | VARCHAR(160) | 默认路由标签 |
| `max_cps` | INT | 每秒呼叫数上限 |
| `max_concurrent` | INT | 最大并发路数 |
| `max_call_duration` | INT | 单通最大通话时长（秒） |
| `utilisation_percent` | DOUBLE | 当前利用率（%），健康检查回写 |
| `warning_threshold_percent` | DOUBLE | 告警阈值（%） |
| `allowed_ips` | JSON | 允许的来源 IP 列表 |
| `did_numbers` | JSON | 绑定的 DID 号码列表 |
| `billing_snapshot` | JSON | 计费快照（资费 / 账户信息） |
| `analytics` | JSON | 分析统计缓存 |
| `tags` | JSON | 标签 |
| `incoming_from_user_prefix` | VARCHAR(160) | 入局主叫用户前缀改写 |
| `incoming_to_user_prefix` | VARCHAR(160) | 入局被叫用户前缀改写 |
| `is_active` | BOOLEAN | 是否启用（默认 `true`） |
| `register_enabled` | BOOLEAN | 是否向对端注册（默认 `false`） |
| `register_expires` | INT | 注册有效期（秒） |
| `register_extra_headers` | JSON | 注册附加头 |
| `metadata` | JSON | 扩展属性 |
| `rewrite_hostport` | BOOLEAN | 是否改写信令中的 host:port（默认 `true`） |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间 |
| `last_health_check_at` | TIMESTAMP | 最近健康检查时间 |

索引：`name` 唯一、`(status, is_active)`、`direction`。

### `rustpbx_routes` — 路由规则

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `name` | VARCHAR(160) | 路由名，唯一索引 |
| `description` | TEXT | 描述 |
| `direction` | VARCHAR(32) | `inbound` / `outbound`（默认 `outbound`） |
| `priority` | INT | 优先级，数值越小越先匹配（默认 `100`） |
| `is_active` | BOOLEAN | 是否启用（默认 `true`） |
| `selection_strategy` | VARCHAR(32) | 目标中继选择策略：`rr` 轮询 / `weight` 权重 / `hash` 哈希（默认 `rr`） |
| `hash_key` | VARCHAR(120) | `hash` 策略的哈希键（如主叫 / 被叫） |
| `source_trunk_id` | BIGINT | 来源中继 ID，外键 → `rustpbx_sip_trunks.id`（删除置空） |
| `default_trunk_id` | BIGINT | 默认目标中继 ID，外键 → `rustpbx_sip_trunks.id`（删除置空） |
| `source_pattern` | VARCHAR(160) | 主叫号码匹配模式 |
| `destination_pattern` | VARCHAR(160) | 被叫号码匹配模式 |
| `header_filters` | JSON | SIP 头过滤条件 |
| `rewrite_rules` | JSON | 号码 / 头改写规则 |
| `target_trunks` | JSON | 目标中继列表（含权重、顺序） |
| `owner` | VARCHAR(120) | 归属人 |
| `notes` | JSON | 备注 |
| `metadata` | JSON | 扩展属性 |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间 |
| `last_deployed_at` | TIMESTAMP | 最近一次下发到路由引擎的时间 |

索引：`name` 唯一、`(direction, is_active)`、`priority`。

### `presence_states` — 呈现状态

SIP Presence 的持久化副本，重启后自动回载，并在集群内广播同步。

| 列 | 类型 | 说明 |
|---|---|---|
| `identity` | VARCHAR | 主键，呈现身份（通常为分机号 / 用户标识） |
| `status` | VARCHAR | 状态：`offline`、`available`(=idle)、`busy`、`ringing`、`wrapup`、`dnd`、`away[:原因]` |
| `note` | TEXT | 用户自由文本备注 |
| `activity` | VARCHAR | 附加活动描述 |
| `last_updated` | BIGINT | 最近更新的 Unix 秒级时间戳 |

---

## 通话与报表

### `rustpbx_call_records` — 通话记录（CDR）

核心大表，一通通话的每个 leg 一行；`session_id` 用于把同一通逻辑呼叫聚合起来（见 [session_id 关联模型](/guide/session-id)）。CDR 也可改存到文件 / S3 / HTTP / 自定义表（见 [配置：媒体、录音与 CDR](/config/media)）。

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `call_id` | VARCHAR(255) | SIP Call-ID，唯一（原始 Call-ID 可能很长，MySQL / PG 已扩到 255） |
| `session_id` | VARCHAR(120) | 逻辑呼叫的根会话 ID；子腿继承根值，用于 `GROUP BY` 聚合，有索引 |
| `display_id` | VARCHAR(120) | 展示用 ID |
| `direction` | VARCHAR(16) | `inbound` / `outbound` / `internal` |
| `status` | VARCHAR(32) | 通话状态（已接 / 未接 / 失败等） |
| `started_at` | TIMESTAMP | 开始时间（索引 `(started_at, direction)`） |
| `ended_at` | TIMESTAMP | 结束时间 |
| `duration_secs` | INT | 通话时长（秒） |
| `from_number` | VARCHAR(64) | 主叫号码（索引） |
| `to_number` | VARCHAR(64) | 被叫号码 |
| `caller_name` | VARCHAR(160) | 主叫显示名 |
| `agent_name` | VARCHAR(160) | 坐席名（队列 / CC 场景） |
| `queue` | VARCHAR(120) | 所在队列名 |
| `department_id` | BIGINT | 部门外键，删除置空 |
| `extension_id` | BIGINT | 分机外键，删除置空（有索引） |
| `sip_trunk_id` | BIGINT | 入局 / 关联中继外键，删除置空 |
| `outbound_sip_trunk_id` | BIGINT | 出局中继 ID（带索引） |
| `route_id` | BIGINT | 命中的路由外键，删除置空 |
| `sip_gateway` | VARCHAR(160) | 网关地址 |
| `rewrite_original_from` | VARCHAR | 改写前的原始主叫 |
| `rewrite_original_to` | VARCHAR | 改写前的原始被叫 |
| `caller_uri` | TEXT | 主叫 SIP URI |
| `callee_uri` | TEXT | 被叫 SIP URI |
| `recording_url` | TEXT | 录音对象存储地址（异步上传后回写） |
| `recording_duration_secs` | INT | 录音时长（秒） |
| `has_transcript` | BOOLEAN | 是否已有转写文本（默认 `false`） |
| `transcript_status` | VARCHAR(32) | 转写状态：`pending` / `processing` / `ready` / `failed` 等（默认 `pending`） |
| `transcript_language` | VARCHAR(16) | 转写语言 |
| `tags` | JSON | 业务标签 |
| `leg_timeline` | JSON | 各通话腿时间线（振铃 / 接通 / 挂断） |
| `metadata` | JSON | 扩展元数据（媒体质量数组、SipFlow JSONL 地址、自定义字段） |
| `media_loss_pct` | DOUBLE | 应答后中继侧腿的 RTCP 丢包率（%），无 RTCP 报告为 NULL |
| `media_jitter_ms` | DOUBLE | RTCP 抖动（毫秒） |
| `media_rtt_ms` | DOUBLE | RTCP 往返时延（毫秒） |
| `hangup_reason` | VARCHAR(64) | 归一化挂断原因（`caller` / `callee` / `refer` / `system` / `noAnswer` / `abandoned` …），有索引 |
| `sip_status_code` | INT | 最终 SIP 响应码（200 / 486 / 487 …） |
| `created_at` | TIMESTAMP | 写入时间 |
| `updated_at` | TIMESTAMP | 更新时间 |
| `archived_at` | TIMESTAMP | 归档时间 |

索引：`call_id` 唯一、`(started_at, direction)`、`status`、`extension_id`、`session_id`、`hangup_reason`、`from_number`、`outbound_sip_trunk_id`，以及报表优化索引（见 `call_record_indices` / `call_record_optimization_indices` / `call_record_dashboard_index` 迁移）。

### `rustpbx_cdr_daily` — CDR 日汇总

由报表模块从 `rustpbx_call_records` 幂等重算，每行对应 `(day, direction, department, trunk)` 组合，仪表盘下钻不再扫描原始 CDR 表。

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `day` | TIMESTAMP | 覆盖日期（UTC 零点） |
| `direction` | VARCHAR(32) | `inbound` / `outbound` / `internal` |
| `department_id` | BIGINT | 部门维度，可空 |
| `sip_trunk_id` | BIGINT | 中继维度，可空 |
| `total_calls` | BIGINT | 总呼叫数 |
| `answered` | BIGINT | 接通数 |
| `missed` | BIGINT | 未接数 |
| `total_duration_secs` | BIGINT | 总通话时长（秒） |
| `avg_duration_secs` | DOUBLE | 平均通话时长（秒） |
| `updated_at` | TIMESTAMP | 最近重算时间 |

索引：`idx_cdr_daily_day_dims (day, direction, department_id, sip_trunk_id)`。

### `rustpbx_runtime_snapshots` — 运行时指标快照

一张表承载所有周期性运行态采样，`kind` 区分来源，避免每新增一个指标域就要建表。

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `kind` | VARCHAR(32) | 采样来源：`locator`（在线注册数）、`system_capacity`（活动通话 / 上限）等 |
| `created_at` | TIMESTAMP | 采样时间（索引 `(kind, created_at)`） |
| `num1` | BIGINT | 通用计数槽 1（locator：在线位置数；capacity：活动通话数） |
| `num2` | BIGINT | 通用计数槽 2（locator：在线用户数；capacity：最大并发） |
| `num3` | BIGINT | 通用计数槽 3（locator：WebRTC 位置数） |
| `num4` | DOUBLE | 通用数值槽 |
| `data` | JSON | 结构化扩展（如按传输协议分组的计数、按中继明细） |
| `instance_id` | VARCHAR(64) | 采样节点实例 ID |

---

## 权限与安全

### `rustpbx_roles` — 角色

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `name` | VARCHAR | 角色名，唯一（内置 `superadmin` / `admin` / `supervisor` / `operator` 等） |
| `description` | TEXT | 角色说明 |
| `is_system` | BOOLEAN | 是否系统内置角色（不可删除） |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间 |

### `rustpbx_role_permissions` — 角色权限点

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `role_id` | BIGINT | 角色 ID，外键 → `rustpbx_roles.id` |
| `resource` | VARCHAR | 资源名（如 `extension`、`call`、`cc_agent`） |
| `action` | VARCHAR | 动作（`read` / `write` / 自定义动作） |

### `rustpbx_user_roles` — 用户 ↔ 角色

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `user_id` | BIGINT | 用户 ID → `rustpbx_users.id` |
| `role_id` | BIGINT | 角色 ID → `rustpbx_roles.id` |
| `created_at` | TIMESTAMP | 授权时间 |

### `rustpbx_banned_ips` — 封禁 IP

认证失败累计触发的封禁记录（详见 [安全](/operations/security)）。

| 列 | 类型 | 说明 |
|---|---|---|
| `ip` | VARCHAR(64) | 主键，被封禁 IP |
| `reason` | VARCHAR(64) | 封禁原因 |
| `last_username` | VARCHAR(128) | 最近一次尝试的用户名 |
| `last_method` | VARCHAR(32) | 最近一次触发的方法（如 REGISTER / INVITE） |
| `offense_count` | INT | 累计违规次数（默认 1） |
| `banned_until` | BIGINT | 封禁截止 Unix 秒级时间戳（有索引） |
| `created_at` | BIGINT | 首次封禁 Unix 秒级时间戳 |
| `released_at` | BIGINT | 解封 Unix 秒级时间戳 |
| `released_by` | VARCHAR(128) | 解封操作人 |

### `system_notifications` — 系统通知

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `kind` | VARCHAR(32) | 类型：`info` / `warning` / `update` |
| `title` | VARCHAR(255) | 标题 |
| `body` | TEXT | 正文 |
| `read` | BOOLEAN | 是否已读（默认 `false`） |
| `created_at` | TIMESTAMP | 生成时间 |

---

## 运行与配置

### `config_entries` — 在线配置项

控制台配置存储切到数据库模式（`[console]` 配置存储为 Database）时使用；`(category, entry_name)` 唯一，按分类保存配置片段 / 生成文件内容。

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `category` | VARCHAR(128) | 配置分类 |
| `entry_name` | VARCHAR(255) | 条目名（如 `xxx.generated.toml`） |
| `content` | TEXT | 配置内容（TOML 文本等） |
| `is_generated` | BOOLEAN | 是否为自动生成内容（默认 `true`） |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间 |

索引：`idx_config_entries_category_name (category, entry_name)` 唯一。

### `rustpbx_frequency_limits` — 外呼频控计数

配合外呼策略（Policy）做实时限额判断，行级计数避免每次呼出都扫日志。

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `policy_id` | VARCHAR(64) | 策略 ID（有索引） |
| `scope` | VARCHAR(32) | 计数维度（如按账户 / 按号码，有索引） |
| `scope_value` | VARCHAR(128) | 维度取值（有索引） |
| `limit_type` | VARCHAR(32) | 限额类型：`frequency` 频次 / `daily` 日量 / `concurrency` 并发（有索引） |
| `count` | INT UNSIGNED | 当前计数 |
| `window_end` | TIMESTAMP | 当前窗口结束时间（非窗口型限额为 NULL） |
| `updated_at` | TIMESTAMP | 最近更新时间 |

索引：`idx_frequency_limits_lookup (policy_id, scope, scope_value, limit_type)`。

### `cluster_sessions` — 集群会话注册表

集群内每路活动通话一行：会话诞生时写入，归属节点心跳批量刷新，超过 TTL 由清扫器回收（节点崩溃恢复）。详见 [集群与高可用](/operations/cluster)。

| 列 | 类型 | 说明 |
|---|---|---|
| `call_id` | VARCHAR(200) | 主键，SIP Call-ID 或代理会话 ID |
| `node_id` | VARCHAR(64) | 归属 PBX 节点（如 `10.0.0.2:5060`），有索引 |
| `caller` | VARCHAR(160) | 主叫 |
| `callee` | VARCHAR(160) | 被叫 |
| `direction` | VARCHAR(16) | `inbound` / `outbound` / `alias`（对话 Call-ID 别名行） |
| `target_session_id` | VARCHAR(200) | 仅别名行：该 Call-ID 映射到的规范会话 ID；常规行 NULL |
| `started_at` | TIMESTAMP | 会话开始时间 |
| `last_updated_at` | TIMESTAMP | 最近心跳刷新时间（有索引，供 TTL 清扫） |

### `rustpbx_locations` — SIP 注册位置（Locator 库）

仅在 `[proxy].locator` 配置为 `type = "database"` 时创建（可与主库同库，也可独立 URL），表结构由 Locator 自己的迁移器管理。

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `aor` | VARCHAR(255) | Address-of-Record（`sip:user@realm`） |
| `expires` | BIGINT | 绑定过期的 Unix 秒级时间戳 |
| `username` | VARCHAR(200) | 注册用户名 |
| `realm` | VARCHAR(200) | 认证域，可空，与 `username` 有组合索引 |
| `destination` | VARCHAR(255) | 呼叫落地地址（`ip:port` 或 transport URI） |
| `transport` | VARCHAR(32) | 传输协议：`udp` / `tcp` / `tls` / `ws` / `wss` |
| `last_modified` | BIGINT | 最近修改 Unix 秒级时间戳 |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间 |
| `supports_webrtc` | BOOLEAN | 是否 WebRTC 终端（默认 `false`） |
| `user_agent` | TEXT | User-Agent（MySQL / PG 已扩为 TEXT） |
| `instance_id` | VARCHAR(255) | 终端实例 ID（同一账号多设备区分），有索引 |

索引：`idx_locations_realm_username (realm, username)`、`idx_locations_instance_id (instance_id)`。

---

## 队列插件

### `rustpbx_queues` — 呼叫队列

queue 插件的迁移注册在插件自己的 migrator 里，但仍建在**主库**。

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT | 主键，自增 |
| `name` | VARCHAR(160) | 队列名，唯一 |
| `description` | TEXT | 描述 |
| `metadata` | JSON | 扩展属性 |
| `spec` | JSON | 队列规格（成员、振铃策略、超时、溢出、欢迎语等完整定义） |
| `is_active` | BOOLEAN | 是否启用（默认 `true`） |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间 |
| `last_exported_at` | TIMESTAMP | 最近一次导出 / 同步到拨号计划的时间 |

---

## 迁移跟踪表

| 表名 | 用途 |
|---|---|
| `seaql_migrations` | 核心迁移记录：`version VARCHAR(255)` 主键、`applied_at BIGINT` 应用时间 |
| `seaql_migrations_<插件 id>` | 每个插件一条独立记录表（如 `seaql_migrations_queue`），列结构与核心一致 |

::: warning 不要手工删除记录
若迁移文件被重命名 / 删除，启动时会因「记录存在但文件缺失」而中止；RustPBX 只在遇到该错误时才自动清理孤儿记录（见 `prune_stale_migrations`），不建议手工干预。
:::

---

## SipFlow 本地缓冲库（独立 SQLite 文件）

SipFlow（信令 + 媒体抓包）不写主库，而是在存储根目录下**按天分桶**写本地 SQLite 文件 `<存储根目录>/<日期分桶>/sipflow.db`（分片模式为 `shard-*/sipflow.db`），后台按批量 / 定时刷入，用于控制台的信令阶梯图与回放；详见 [SipFlow 抓包与回放](/operations/sipflow)。

### `call_meta` — 呼叫索引

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER | 主键，自增 |
| `callid` | TEXT | SIP Call-ID，唯一（有唯一索引 `idx_callid`） |

### `sip_msgs` — SIP 信令消息

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `call_id` | INTEGER | 关联 `call_meta.id`（索引 `idx_sip_call`） |
| `src` | TEXT | 发送方地址 |
| `dst` | TEXT | 接收方地址 |
| `timestamp` | INTEGER | 抓取时间戳（毫秒） |
| `offset` | INTEGER | 在原始数据文件中的字节偏移（消息体按需回读） |
| `size` | INTEGER | 消息长度（字节） |

### `media_msgs` — RTP 媒体包

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER | 主键 |
| `call_id` | INTEGER | 关联 `call_meta.id` |
| `leg` | INTEGER | 通话腿编号（A / B 侧） |
| `src` | TEXT | 发送方地址（默认空串） |
| `timestamp` | INTEGER | 抓取时间戳（毫秒） |
| `offset` | INTEGER | 原始数据文件字节偏移 |
| `size` | INTEGER | 包长度（字节） |

索引：`idx_media_call_timestamp (call_id, timestamp)`（`call_id` 前缀查询全部走该索引）。

---

## 可选：外部表

### 外部用户表（`[proxy.user_backends]` `type = "database"`）

当 SIP 用户由业务方自己的数据库提供时使用，表名与列名都可映射，**表结构由业务方维护**，RustPBX 只读：

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `table_name` | `users` | 用户表名 |
| `username_column` | `username` | 用户名列 |
| `password_column` | `password` | 密码列（支持 `hash:` 前缀的哈希密码等） |
| `id_column` | 未启用 | 业务主键列 |
| `enabled_column` | 未启用 | 启用状态列 |
| `realm_column` | 未启用 | 域 / 租户列（用于多域鉴权） |
| `display_name_column` / `email_column` / `phone_column` / `note_column` / `deleted_at_column` | 未启用 | 展示名、邮箱、电话、备注、软删除列 |

### 自定义 CDR 表（`[callrecord]` `type = "database"`）

```toml
[callrecord]
type = "database"
database_url = "postgres://user:pass@db/pbx"   # 不填则用主库
table_name = "my_cdrs"                         # 默认 rustpbx_call_records
skip_create_table = true                       # 表由 DBA 建时设为 true
rotate = "daily"                               # 按天滚动：SQLite 按文件，其他库按表 _YYYYMMDD
```

- `skip_create_table = true` 时 RustPBX 不建表、不跑迁移，只写入；
- 表结构需自行保证包含要写入的列（最小可用：`call_id`、`direction`、`status`、`started_at`、`duration_secs` 等 CDR 列）。

---

## 插件扩展表

插件可在主库追加自己的表，并用 `seaql_migrations_<插件 id>` 记录迁移。仓库自带的示例插件会创建 `demo_external_notes` 这类业务表。

CC（呼叫中心）插件会在主库 / 共享库中创建坐席与 ACD 相关表，供多节点共享调度（集群跨节点严格 FIFO 依赖 `cc_acd_queue`）：

| 表名 | 用途 |
|---|---|
| `cc_agent` | 坐席定义（坐席号、显示名、主终端、技能、最大并发、角色、初始状态） |
| `cc_skill` | 技能字典 |
| `cc_skill_group` | 技能组（所需技能、溢出组、SLA 与最大等待时长） |
| `cc_acd_queue` | ACD 队列 / 分配策略（策略名、排队算法、队列上限、坐席超时、整理时长），兼作跨节点排队的共享序列点 |
| `cc_agent_presence` | 坐席实时状态（`offline` / `idle` / `ringing` / `wrapup` 等、最近变更时间、小休原因） |
| `cc_agent_endpoint` | 坐席多终端与优先级 |
| `cc_agent_stats` | 坐席累计统计（总话务、接通、未接、通话时长、整理时长） |
| `cc_call` | 坐席当前 / 最近一通活动呼叫 |
| `cc_call_record` | CC 维度的通话明细（含录音地址、挂断原因、元数据） |

::: info 以插件版本为准
CC 等商业插件的表结构随插件版本演进，建表与迁移由插件自身完成；上表用途来自仓库内的 E2E 脚手架，具体字段请以实际部署中插件生成的 DDL 为准。
:::

---

## 维护建议

- **备份**：主库与各 CDR 数据一样重要，建议按业务节奏做快照；SipFlow 的 `sipflow.db` 是按天滚动的临时缓冲，可只备份未上传的分桶。
- **迁移**：升级 RustPBX 后由进程自动迁移，不需要手工执行 SQL；Postgres / MySQL 建议用具备 DDL 权限的账号。
- **只读副本**：报表与 CDR 查询量大时，可把 `[callrecord]` 指向独立库或使用 `rustpbx_cdr_daily` 做聚合，避免与在线写入争抢。
- **不要手改核心表**：列含义与索引由迁移维护，手工改列会导致后续迁移被 `has_column` 判断跳过而留下不一致结构。
