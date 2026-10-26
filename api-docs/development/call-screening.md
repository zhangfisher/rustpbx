# 黑白名单

黑白名单（呼叫拦截）：**把不想接的呼叫挡掉**——黑名单直接拒接、白名单之外全拒。RustPBX **不内置「主叫号码黑名单表」**：名单存哪、怎么匹配（精确号 / 号段 / 归属地 / 风控评分）是业务逻辑，归**你的程序**决定；PBX 提供的是**拦截时机**与**拒接手段**。

## 三个拦截点

| 拦截点 | 层面 | 时机 | 对主叫的呈现 | 适合 |
|---|---|---|---|---|
| HTTP Router `reject` | 路由面 | INVITE 一到、**振铃之前** | SIP 错误响应（状态码你定） | 业务黑名单（推荐） |
| RWI `call.reject` | 通话面 | 收到 `call_created` 后异步拒接 | SIP 错误响应（`reason` 映射） | 名单在外部服务、无法同步判断时 |
| 内建 ACL | 信令面 | SIP 事务入口 | **静默丢弃**（不回任何响应） | 防 IP 扫描 / 恶意 UA 攻击，非业务名单 |

## 实现方式一：HTTP Router 拒接（推荐）

振铃之前就拒掉，主叫直接收到错误响应，不产生振铃与话单。在你的路由服务里查名单：

```python
# examples/http_router_service.py 的简化思路
BLACKLIST = {"0085212345678", "+8613900000000"}   # 你的名单：DB / 风控服务均可

@app.post("/route")
async def route(req: Request):
    payload = await req.json()
    caller = payload["from"]                      # 主叫号码 / URI
    if is_blacklisted(caller):                    # 你的匹配逻辑：精确 / 号段 / 前缀
        return {"action": "reject", "status": 603, "reason": "blacklisted"}
    if not is_whitelisted(caller):                # 白名单模式：名单外全拒
        return {"action": "reject", "status": 403}
    return {"action": "forward", "targets": ["sip:1001@internal"]}
```

响应参数：

| 字段 | 默认 | 说明 |
|---|---|---|
| `action` | — | `reject`（拒接）或 `spam`（标记骚扰） |
| `status` | `403` | 任意 SIP 状态码：`486` 忙、`603` 拒接、`403` 禁止… |
| `reason` | `rejected by HTTP router` | 错误短语（写入响应与日志） |

`spam` 与 `reject` 的区别：`spam` 固定回 `403 Forbidden` 并在呼叫 cookie 上标记 `Spam`，便于事后在 CDR / 日志里统计骚扰源。路由服务是**全局替换语义**（启用后所有入局 INVITE 先到你的服务），未启用 HTTP Router 时用方式二。详见 [HTTP Router 动态路由](/interfaces/http-router)。

## 实现方式二：RWI 订阅后拒接

名单判断需要异步查外部服务（风控接口、CRM 标签）时，先放呼叫进来，订阅 `call_created` 判断后用 `call.reject` 拒接：

```javascript
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.event_type === "call_created") {
    riskService.check(msg.from).then((verdict) => {
      if (verdict.blocked) {
        ws.send(JSON.stringify({ action: "call.reject", action_id: "r1",
          params: { call_id: msg.call_id, reason: "decline" } }));
      }
    });
  }
};
```

`reason` 到 SIP 状态码的映射：

| `reason` | SIP 响应 | 语义 |
|---|---|---|
| `busy` / `486` | 486 Busy Here | 忙线（主叫话机常播「占线」提示） |
| `decline` / `603` | 603 Decline | 拒接（**默认**，不填 reason 时） |
| `unavailable` / `480` | 480 Temporarily Unavailable | 暂不可用 |
| `reject` / `403` | 403 Forbidden | 禁止 |

| 参数 | 必填 | 说明 |
|---|---|---|
| `call_id` | ✅ | 要拒接的呼叫（Call-ID 或 `session_id`） |
| `reason` | 可选 | 上表映射；不填默认 `603 Decline` |

事件订阅与认领方式见 [开发前准备](/development/index#开发前准备)；入局呼叫会先以 `call_created` 扇出，无需认领即可拒接。

::: tip 两种方式的取舍
HTTP Router 同步判断：**振铃前**拦截、主叫零等待，但要求名单查询在 `timeout_ms`（默认 5s）内完成。RWI 异步拒接：判断可以慢慢做，但主叫会先听到一小段振铃才被拒。名单查询快的场景一律选方式一。
:::

## 补充：内建 ACL（IP / UA 级）

针对**信令攻击面**（扫描器、恶意 UA、IP 滥用）而非业务名单，PBX 内建 ACL，配置即生效：

```toml
[proxy]
acl_rules = ["deny 1.2.3.4", "allow 192.168.1.0/24", "deny all"]  # 顺序匹配
ua_black_list = ["friendly-scanner", "sipvicious"]  # 大小写不敏感子串匹配
ua_white_list = []          # 非空 = 白名单语义：不匹配即拒
ua_block_scanners = true    # 内置扫描器 UA 特征库
```

与业务拒接的关键差异：ACL 命中是**静默丢弃**（不回 SIP 响应，攻击者探测不到 PBX 存在），并产生 `call_error` 事件（`detail.reason` 为 `ip_denied` / `ua_blacklist` / `ua_scanner` 等）。规则支持运行时重载（`POST {ami_prefix}/reload/acl`），中继来源 IP 默认绕过 ACL。完整配置见 [代理核心配置](/config/proxy-core)。

## 事件与观测

| 观测点 | 说明 |
|---|---|
| HTTP Router 拒接 | 主叫收到你指定的 SIP 状态码；CDR `metadata.trace` 记录路由决策 |
| `call.reject` 后 | `call_hangup`（`hangup_by: "system"`）或呼叫失败事件 |
| ACL 命中 | `call_error` 事件（`acl.denied`，含 `reason`），无 CDR |
| CDR `metadata.spam` | `spam` / ACL 标记的骚扰标记 |

## 常见问题

- **主叫什么都没收到（也不挂）？** 命中了 ACL——静默丢弃不回响应。业务黑名单请用 HTTP Router `reject` / `call.reject`，主叫能收到明确状态码。
- **486 和 603 主叫听到的提示一样吗？** 不一样：486 通常播「占线」，603 通常播「拒绝 / 无权拨打」，按提示语义选状态码。
- **想按时间段 / 号段拒接？** 匹配逻辑在你的路由服务里实现，PBX 只负责执行拒接——名单维度（时间、号段、频次）完全自由。
- **拒接的呼叫有话单吗？** 振铃前被 HTTP Router 拒接的呼叫不产生接通话单；RWI `call.reject` 拒接会产生一条未接通 CDR，便于事后审计拦截记录。
