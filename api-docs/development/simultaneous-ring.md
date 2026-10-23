# 同振

同振（并行振铃 / Parallel Ring / Ring All）：**一次呼叫同时向多个终端发起 INVITE，谁先接谁赢，其余目标立即取消**。典型场景：分机与手机同时响、班组共响、坐席组并行振铃。

## PBX 内建语义

RustPBX 的并行拨号对每个目标**并发 fork INVITE**：

1. 主叫先收到 `180 Ringing`，随后各目标同时开始振铃；
2. **第一个 `200 OK` 赢**——媒体桥接到胜出的腿，其余并发腿立即 `CANCEL`；
3. 全部失败才以最终原因结束呼叫（忙 / 无应答 / 拒绝 / 超时…）；
4. fork 出的腿以 `fork-0`、`fork-1`… 作为 `leg_id`，便于在事件里区分是谁接的；
5. 并行拨号**不使用中继的 `retry_policy`**——失败即失败，不会「失败后再推进到下一个」（那是顺振的语义，见 [顺振](/development/sequential-ring)）。

::: info 振铃总时长
整通呼叫的 `max_ring_time`（路由级或中继级）到点会取消所有 fork 并拒绝呼叫，不要设得比你预期的振铃窗口短。
:::

## 实现方式一：HTTP Router（推荐）

在你的路由服务里返回多个 `targets` + `strategy: "parallel"`，**振铃组成员由你的业务实时决定**（班表、CRM 客户等级、坐席忙闲都可以作为输入）：

```json
{
  "action": "forward",
  "targets": [
    "sip:1001@internal",
    "sip:1002@internal",
    "sip:+8613900000@trunk"
  ],
  "strategy": "parallel",
  "max_ring_time": 30
}
```

```python
# examples/http_router_service.py 的简化思路
@app.post("/route")
async def route(req: Request):
    payload = await req.json()
    members = crm.ring_group(payload["to"])      # 你的逻辑：谁该一起响
    if not members:
        return {"action": "reject", "status": 603}
    return {
        "action": "forward",
        "targets": [f"sip:{m}@internal" for m in members],
        "strategy": "parallel",
        "max_ring_time": 30,
    }
```

注意事项：

- `[proxy.http_router]` 是**全局替换语义**——启用后所有入局 INVITE 都会先到你的服务，详见 [HTTP Router](/interfaces/http-router)；
- `timeout_ms`（默认 5000）内必须返回，配合 `fallback_to_static = true` 兜底；
- `parallel` 下目标对象里的 `retry_policy` 不生效；`record` / `record_start_at` / `caller` 等可选字段仍然有效。

## 实现方式二：队列 Ring All

呼叫队列的并行拨号本质就是坐席同振：

```json
{ "action": "queue.enqueue", "params": { "call_id": "…", "queue_id": "sales" } }
```

```jsonc
// 队列配置（REST / 控制台）
"strategy": { "mode": "parallel", "wait_timeout_secs": 300 }
```

`strategy.mode = "parallel"` 并行振铃所有空闲坐席，先接者赢；`sequential` 则是坐席轮流。见 [呼叫队列](/features/queue) 与 [队列接口](/api/queues)。

## 容易混淆的两个「多目标」

| 写法 | 实际行为 | 是同振吗 |
|---|---|---|
| HTTP Router `targets` + `strategy: "parallel"` | 并发 INVITE，先接者赢 | ✅ |
| 队列 `strategy.mode = "parallel"` | 并行振铃空闲坐席 | ✅ |
| 静态路由 `dest = ["trunkA", "trunkB"]` | 负载均衡**选一**拨打（random / hash / rr / weighted） | ❌ |
| 中继 `backup_dest` / 批发候选序列 | 顺序 failover，失败才切下一个 | ❌（[顺振](/development/sequential-ring)） |

## 事件与观测

| 观测点 | 说明 |
|---|---|
| `call_ringing` | 振铃事件带 leg 信息，fork 腿标识为 `fork-N` |
| `call_answered` | 胜出腿接通，媒体桥接 |
| `call_no_answer` / `call_busy` / `call_error` | 该腿失败；全部失败才产生整通失败 |
| `call_hangup` | 通话结束（含被取消的落选腿） |
| CDR `metadata.trace` | 含 `Forking INVITEs to N target(s) in parallel` 的 ring 条目 |
| 接通腿的 CDR | 只有胜出腿会形成接通记录，落选腿不产生计费话单 |

事件订阅方式见 [RWI 事件参考](/interfaces/rwi-events)。

## 常见问题

- **谁接的？** 以 `call_answered` 事件的 `call_id` / `leg_id` 为准，随后用 `session_id` 串联全部事件。
- **要不要锚定媒体？** 录音、监听、AI 参与都要求媒体锚定（`media_proxy = "auto"` 下 IVR / 队列等应用流程会自动锚定）；纯分机互拨可旁路，见 [媒体、录音与 CDR](/config/media#媒体代理模式)。
- **想按顺序限制「同时响几路」？** 分批返回：先并行响 A/B，收到全部失败事件后由你的服务用 RWI `call.originate` 续拨——顺序与批次策略归你的代码所有。
