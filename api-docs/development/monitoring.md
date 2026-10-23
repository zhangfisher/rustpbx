# 监听

> **Supervisor: listen / whisper / barge / takeover** — monitor, intercept and control active calls.

All technical claims in this chapter are verified against the RustPBX source code in `src/`. Where the implementation has known limitations, those are explicitly documented.

---

## 1. 目标与范围

本章节介绍如何在 RustPBX 中实现 call monitoring (监听), including:

- **Listen (静默监听)** — supervisor quietly monitors a call without merging their audio into the conference (when route gains are configured; see Caveats below).
- **Whisper (耳语)** — supervisor speaks only to the agent; the customer does not hear the supervisor.
- **Barge (强插)** — supervisor joins the existing call as a third party; all parties hear each other.
- **Takeover (接管)** — supervisor replaces the agent leg; the agent is disconnected (BYE) and the supervisor takes over the call.
- **Stop (结束)** — ends the supervisor mode.

The implementation is entirely **RWI-based** (Real-Time-Wire-Interface). There are no built-in HTTP/REST endpoints for supervisor commands — they are all invoked via RWI payloads (see `api-docs/interfaces/rwi-commands.md`).

> **Important**: The supervisor must have their own active call session with the PBX before issuing any `supervisor.*` command (verified: `processor.rs` calls `get_handle(supervisor_call_id)` and `get_handle(target_call_id)` — both must resolve to existing sessions). The supervisor's call session can be established via `call.originate` from a console app, or by the supervisor's phone dialing an access number routed to an app/IVR.

---

## 2. RWI 命令概览

All commands live in `src/rwi/session.rs` under `RwiCommandPayload`. The unified dispatch routes every supervisor command by `target_call_id` to the target session (`dispatch_call_id` returns `target_call_id`).

| Command | Payload fields | Session requirement |
|---------|---------------|---------------------|
| `supervisor.listen` | `{ supervisor_call_id, target_call_id }` | Both must be live sessions; supervisor_session_id = Some(supervisor_call_id) enables **cross-session** listen. |
| `supervisor.whisper` | `{ supervisor_call_id, target_call_id, agent_leg }` | `supervisor_session_id` = **None** (same-session only). `supervisor_call_id` must be a leg **within** the target session (e.g. added via `call.leg_add` or attended-transfer consult). `agent_leg` is only used for event fan-out (RWI event delivery to the agent's owner session); it does **not** enforce media routing. |
| `supervisor.barge` | `{ supervisor_call_id, target_call_id, agent_leg }` | Same as whisper: `supervisor_session_id` = None; `supervisor_call_id` must be a leg in the target session. All legs of the target session are bridged into `supervisor-{session}-barge`. |
| `supervisor.takeover` | `{ supervisor_call_id, target_call_id }` | `supervisor_session_id` = Some(supervisor_call_id) enables **cross-session** takeover. |
| `supervisor.stop` | `{ supervisor_call_id, target_call_id }` | Sends `CallCommand::SupervisorStop` to target session; emits `supervisor_mode_stopped` event. |

### 2.1 调度与验证

- **dispatch_call_id**: returns `target_call_id` for all supervisor commands. The command is sent to the **target** session via `get_handle(target_call_id)`. Both `supervisor_call_id` and `target_call_id` must pass `get_handle` (i.e. both must be live sessions in the call registry).
- **processor.rs** validates at call time:
  - `supervisor_listen`: calls `self.get_handle(supervisor_call_id)` and `self.get_handle(target_call_id)`.
  - `supervisor_whisper`/`supervisor_barge`: also validates `agent_leg` if non-empty (`self.get_handle(agent_leg)`).
  - `supervisor_takeover`: same two `get_handle` checks.
  - `supervisor_stop`: only validates `target_call_id`; supervisor session is looked up optionally.

---

## 3. 监听模式详解

### 3.1 Listen (静默监听)

两种拓扑：

#### 同会话 (same-session)
Supervisor's leg already exists in the target session (e.g. added via `call.leg_add` or attended-transfer consult leg). Then `supervisor.listen` with `supervisor_session_id: None` — handler `handle_supervisor_monitor` skips cross-session branch, requires `require_leg(&supervisor_leg)` where supervisor_leg = supervisor_call_id must be a leg in the target session. Conference `supervisor-{session}-listen` (max 3) bridges supervisor leg + target leg.

#### 跨会话 (cross-session) — 最常见的“拨号监听”模式
Supervisor has their own active call session (e.g. their phone dialed an access number routed to an app, or console app `call.originate` to supervisor's phone). Then `supervisor.listen` passes `supervisor_session_id: Some(supervisor_call_id)`. Since supervisor_call_id ≠ target session id, handler takes **cross-session path** (`handle_cross_session_supervisor_listen`):

1. Target session resolves target leg: `resolve_supervisor_target(target_leg, skip_exact=true)` → if target_leg equals session id, skips exact → falls back to `"callee"` (default) then `"caller"`.
2. Creates conference `supervisor-{target_session_id}-{supervisor_session_id}` (max 3).
3. Bridges the resolved target leg into the conference (on the target session side).
4. Forwards `CallCommand::JoinMixer { mixer_id }` to the supervisor session — the supervisor session joins with its **callee** leg (`handle_join_mixer` hard-codes participant leg `{session}-callee`).

> **Caveat** — Production code **never calls** `set_route_gain` (only the media crate's unit tests at `crates/rustpbx-media/src/conference_mixer.rs` use it). The conference mixer defaults to gain 1.0 for all routes, meaning in listen mode the supervisor's audio *can* be heard by the target party. True "silent" isolation requires the caller to apply `conference.mute` on the supervisor participant (verified: `conference_manager.rs` → `mixer.set_muted(leg, true)` drops the participant's input frames). Alternatively, use `conference.mute` on the target participant to silence the target in the supervisor's ear.

**媒体路径**：`start_conference_media_bridge` attaches `LegPcmStream` (passive ingress tap — packet-forwarding observer, does not consume the p2p relay) and sets the leg's egress source to `EgressSource::Inject` (mixer output). This means the target leg's media is re-parented into the conference mixer; the original p2p relay between the target's two parties is torn down (`try_start_and_store_bridge` calls `mb.unbridge()` when `conference_bridge.conf_id.is_none()`). As a result, during listen the monitored party's other leg no longer hears the original peer through the relay — the conference now handles that direction. This is a design choice; developers should test audio continuity in their specific deployment.

### 3.2 Whisper (耳语)

Same-session only (processor passes `supervisor_session_id: None`). Handler `handle_supervisor_monitor` (Whisper mode) does **not** take cross-session branch; requires `require_leg(&supervisor_leg)` — supervisor_call_id must be a leg **within** the target session (e.g. a consult leg added via attended transfer or `call.leg_add`). Conference `supervisor-{session}-whisper` bridges supervisor leg + target leg only (2 parties). The other party of the target call is unbridged (conference unbridges the session's main media bridge on first join).

**媒体隔离** — The mixer supports per-route gain via `set_route_gain` (tests at `crates/rustpbx-media/src/conference_mixer.rs:775-882` demonstrate "listen" and "whisper" route-gain semantics). However, **production supervisor code never calls `set_route_gain`** (grep across the entire repo found zero production callers outside the media crate). Therefore whisper isolation (supervisor → agent only, customer not hearing supervisor) is **not automatically enforced** in the current implementation. To achieve whisper semantics, apply `conference.mute` on the supervisor participant (mutes the supervisor's audio in the mixer) — this is the practical recipe documented in the caveats above.

### 3.3 Barge (强插)

Same-session only; `supervisor_session_id: None`. `handle_supervisor_barge` requires both `require_leg(&supervisor_leg)` and `require_leg(&target_leg)`. Conference `supervisor-{session}-barge` (max 3) then **bridges all legs** of the target session into it (via `for leg_id in self.legs.keys().cloned().collect()`). All participants (customer, agent, supervisor) are in the same conference and hear each other. The original p2p bridge between caller and callee is unbridged on first join.

### 3.4 Takeover (接管)

Two拓扑:

#### 跨会话 (cross-session) — supervisor has their own session
Processor passes `supervisor_session_id: Some(supervisor_call_id)`. Handler creates conference `supervisor-{session}-takeover` (max 3), bridges the **customer leg** into it (resolved via `resolve_supervisor_target` fallback callee→caller). Then sends `JoinMixerLeg { mixer_id, leg_id: "caller" }` to the supervisor session (so supervisor joins with their caller leg). The agent leg is marked `Ended` and a SIP BYE is queued (`queue_leg_bye`). `supervisor_takeover_active` flag is set to prevent the B-leg-disconnect cascade from hanging up the customer.

#### 同会话 (same-session)
Supervisor leg and target leg are both in the target session. Conference bridges supervisor leg + other leg (customer/agent non-target). Direct `BridgeConfig::bridge(supervisor_leg, other_leg)` is established. Agent leg is marked `Ended` + BYE queued; `supervisor_takeover_active = true`.

### 3.5 Stop (结束)

Sends `CallCommand::SupervisorStop { supervisor_leg }` to target session; handler marks supervisor leg `LegState::Ended`. Emits `supervisor_mode_stopped` event to both supervisor_call_id owner and target_call_id owner.

---

## 3.6 事件概览

All events are flat (`rwi_event!` macro shape) with `call_id` = `target_call_id`:

| Event type | Payload fields | Delivery |
|------------|---------------|----------|
| `supervisor_listen_started` | `{ supervisor_call_id, target_call_id }` | Sent to owners of `supervisor_call_id` and `target_call_id` (and `agent_leg` if whisper/barge with non-empty agent_leg). |
| `supervisor_whisper_started` | same shape | Same delivery. |
| `supervisor_barge_started` | same shape | Same delivery. |
| `supervisor_takeover_started` | same shape | Same delivery. |
| `supervisor_mode_stopped` | `{ supervisor_call_id, target_call_id }` | Sent to both owners after `supervisor.stop`. |

---

## 4. 实际工作流 — “拨号监听任意号码”

> **如何通过拨号来实现监听任意一个号码的正在进行中的通话**

The typical end-to-end flow for a supervisor to monitor any active call:

1. **Supervisor establishes their own call session** —  
   The supervisor's phone dials an access number routed to a PBX app (e.g., via dialplan or HTTP endpoint), or the monitoring console app originates a call to the supervisor's phone via `call.originate`. This creates a session whose id becomes `supervisor_call_id`. (There is no built-in feature-code dial plan like `*8`; the routing must be configured externally or via the console app.)

2. **Monitoring console discovers the target call** —  
   The console subscribes to RWI events (e.g., `call_created` with context `"default"`), lists active calls, and obtains the target session's `call_id` / `session_id` = `target_call_id`.

3. **Issue `supervisor.listen`** —  
   ```json
   {
     "action": "supervisor.listen",
     "params": {
       "supervisor_call_id": "<supervisor's session id>",
       "target_call_id": "<target call's session id>"
     }
   }
   ```
   The processor validates both handles exist, dispatches the command to the target session. Target session creates conference `supervisor-{target_sid}-{sup_sid}`, bridges the target leg, and sends `JoinMixer` to the supervisor session (supervisor joins with callee leg).

4. **Listen events** —  
   `supervisor_listen_started` fires; the console can render a monitoring UI. The supervisor hears the target leg's audio (via the conference mixer). If true "silent" monitoring is required, apply `conference.mute` on the supervisor participant (conf_id = `supervisor-{target_sid}-{sup_sid}`, call_id = `{sup_sid}-callee`).

5. **DTMF control during monitoring** —  
   The supervisor's own call can run an IVR/app that collects DTMF via `dtmf.collect`. The app maps digits to RWI commands: e.g., `1` = `supervisor.whisper`, `2` = `supervisor.barge`, `3` = `conference.mute` (toggle mute on supervisor participant), `4` = `supervisor.stop`. Alternatively, `call.send_dtmf { call_id, leg_id, digits }` can inject DTMF directly into the target call (e.g., navigate the customer's IVR).

6. **End monitoring** —  
   Issue `supervisor.stop`; the conference is torn down, legs return to their prior state, and `supervisor_mode_stopped` event fires.

### 4.1 同会话补跨 (same-session variant)

If the supervisor's phone is already a leg in the target call (e.g. agent did attended transfer to supervisor, or `call.leg_add` was used to add the supervisor as a third leg):

1. Agent does `call.leg_add { target: supervisor_phone, leg_id: "consult" }` — supervisor's phone rings as a new leg of the same session.
2. Supervisor answers → now the target session has legs: caller, callee, consult (supervisor).
3. Issue `supervisor.listen`/`supervisor.whisper`/`supervisor.barge` with `supervisor_call_id = "consult"` (the leg id). Both `get_handle` lookups succeed because the consult leg is part of the target session; cross-session branch is skipped (supervisor_session_id = None); `require_leg(&supervisor_leg)` passes because the consult leg exists in the target session.

This is the pattern used in the internal test `supervisor_switch` at `src/proxy/proxy_call/sip_session/tests/mod.rs:6343`.

---

## 5. 禁音与混音控制

### 5.1 `conference.mute` / `conference.unmute`

Confirmed working end-to-end in the current codebase:

- **`conference.mute { conf_id, call_id }`** → `processor.rs:559` → `conference_mute` → `ConferenceManager::mute_participant(&conf_id.into(), &LegId::new(call_id))` →
  - Updates conference participant state (`participant.muted = true`).
  - Calls `mixer.set_muted(leg_id, true).await` (conference_media_bridge.rs line 592) — the mixer drops the participant's input frames in both directions.
  - Emits `ConferenceMemberMuted` event.

- **`conference.unmute`** reverses the above.

**Which `call_id` to pass?** Participants in supervisor conferences are registered with the composite leg id `{session_id}-{leg}` (via `participant_leg()` in session.rs:328). So to mute the supervisor participant in a cross-session listen conference (`supervisor-{target_sid}-{sup_sid}`), pass `call_id = "{sup_sid}-callee"` (the same composite form used when the leg was added via `start_bridge_full_duplex`). To mute the target participant, pass `call_id = "{target_sid}-{resolved_target_leg}"` (e.g. `{target_sid}-callee`).

> **Note**: Earlier documentation (from prior sessions) claimed "`conference.mute doesn't actually mute the mixer`". That was **incorrect for the current codebase** — the manager's `mute_participant` at `conference_manager.rs:578-596` clearly calls `mixer.set_muted`, and the mixing loop (conference_mixer.rs:215-224, 243, 273) honors the `muted` flag by zeroing the participant's frames. Muting works as of this codebase version.

### 5.2 DTMF-based mute during monitoring

The supervisor's IVR/app can collect DTMF (`dtmf.collect`) and toggle `conference.mute`/`conference.unmute` on the supervisor participant. This provides a user-facing "mute/unmute" button in the monitoring UI.

### 5.3 Route gains (mixer-level isolation)

The mixer crate supports `set_route_gain(src, dst, gain)` with unit tests demonstrating:
- `test_route_gain_supervisor_listen`: supervisor → customer/agent gain 0.0 (supervisor silent).
- `test_route_gain_supervisor_whisper`: supervisor → customer gain 0.0 (customer doesn't hear supervisor), supervisor → agent gain 1.0 (agent hears supervisor).

However, **production supervisor flow never calls `set_route_gain`** (verified grep across entire repo). Therefore these semantics are **not wired** in the current implementation. Use `conference.mute` for practical mute control.

---

## 6. 支持与权限

- **RBAC**: `crates/rustpbx-models/src/rbac.rs` defines permission `("cc_supervisor", "monitor")` for the `cc_supervisor` role. This is enforced at the console/API level, not at the RWI layer (RWI commands are authenticated via RWI token scopes; see `src/rwi/auth.rs` — tokens with `"supervisor.control"` scope can invoke these commands).
- **No REST endpoints**: All supervisor operations are RWI-only; there are no HTTP handler routes for `supervisor.*` in `src/proxy/routing/http.rs`.
- **Media capabilities**: `MediaRuntimeProfile::supports_supervisor_media` (state.rs:99-100) is `true` when `path = MediaPathMode::Anchored` (the default) and `capability == MediaCapability::Full`; `false` in `Bypass` mode. Supervisor operations require anchored media.

---

## 7. 已知限制与 caveats

| Feature | Status | Note |
|---------|--------|------|
| Listen silent isolation (supervisor not heard by target) | ❌ Not automatic | Production code never calls `set_route_gain`; use `conference.mute` on supervisor participant for guaranteed silence. |
| Whisper agent-only isolation (customer doesn't hear supervisor) | ❌ Not automatic | Same as above — mixer supports it via `set_route_gain` but it's never called from supervisor flow. Use `conference.mute` on supervisor participant. |
| Cross-session whisper / barge | ❌ Not supported | Processor passes `supervisor_session_id: None`; handler requires `require_leg(&supervisor_leg)` — supervisor_call_id must be a leg **within** the target session (same-session only). |
| Cross-session takeover | ✅ Supported | Processor passes `supervisor_session_id: Some(...)`. Supervisor session joins via `JoinMixerLeg` with `"caller"` leg; agent leg kicked with BYE; `supervisor_takeover_active` flag prevents customer hangup. |
| Cross-session listen | ✅ Supported | Processor passes `supervisor_session_id: Some(supervisor_call_id)`. Target resolves leg (callee/caller fallback); conference bridges target leg; supervisor session joins via `JoinMixer` with callee leg. |
| Same-session whisper / barge / listen | ✅ Supported | Supervisor leg must exist in target session (e.g. via `call.leg_add` or consult leg from attended transfer). |
| Mute one party during monitoring | ✅ Supported | `conference.mute { conf_id, call_id }` — call_id must be composite `{session}-{leg}` (verified via `participant_leg`). Confirmed working via `mixer.set_muted`. |
| DTMF control during monitoring | ✅ Supported | `call.send_dtmf { call_id, leg_id, digits }` injects digits into a target leg; `dtmf.collect` on supervisor's own call for app-driven control menus. |
| Recording during monitoring | ⚠️ Partial | Standard `record.start/stop` commands apply to the target call; no special supervisor-aware recording mode. |
| Video recording | ❌ Not supported | RustPBX has no video file recording capability (documented in other chapters). |
| `supervisor.stop` effect | ✅ Supported | Marks supervisor leg `Ended`; conference is torn down; `supervisor_mode_stopped` event fires. |

---

## 8. 参考资料

- `src/rwi/session.rs` — `RwiCommandPayload` variants and `OwnershipMode` enum.
- `src/rwi/processor.rs` — `start_supervisor_mode`, `supervisor_listen`/`whisper`/`barge`/`takeover`/`stop` handlers.
- `src/proxy/proxy_call/sip_session/supervisor.rs` — `handle_supervisor_monitor`, `handle_cross_session_supervisor_listen`, `handle_supervisor_barge`, `handle_supervisor_takeover`, `handle_supervisor_stop`.
- `src/rwi/event.rs` — `SupervisorListenStarted`, `SupervisorWhisperStarted`, `SupervisorBargeStarted`, `SupervisorTakeoverStarted`, `SupervisorModeStopped` event definitions.
- `crates/rustpbx-media/src/conference_mixer.rs` — `set_route_gain`, `set_muted`, mixer test `test_route_gain_supervisor_listen` / `test_route_gain_supervisor_whisper`.
- `src/call/domain/state.rs:99` — `supports_supervisor_media` flag.
- `crates/rustpbx-models/src/rbac.rs` — `("cc_supervisor", "monitor")` permission.
- `api-docs/interfaces/rwi.md` and `api-docs/interfaces/rwi-commands.md` — full command/parameter specs.
- `api-docs/development/` — existing chapters (simultaneous-ring, sequential-ring, three-way, recording, dtmf-response) for style reference.

---
*本章节基于对 RustPBX 源码的实地验证编写。所有命令字段、事件形态、会话拓扑均经源码逐行核对。如有疑问或发现源码行为与文档描述不符，请在提交前通过 `git diff` 或 `git log` 与项目维护人员确认。*