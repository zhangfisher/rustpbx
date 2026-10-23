# WebRTC 与软电话

RustPBX 原生支持 WebRTC 作为 SIP 终端：浏览器软电话可直接注册、拨打、接听，与普通 SIP 话机完全等价。

## SIP over WebSocket 端点

| 项 | 值 |
|---|---|
| 路径 | `/ws`（`[proxy] ws_handler` 可改） |
| 子协议 | `sip` |
| 传输 | 挂在 HTTP 服务上（可用 HTTPS/WSS） |
| 独立 WS listener | `[proxy] ws_port`（也可开启） |

```javascript
// JsSIP 示例
const socket = new JsSIP.WebSocketInterface("wss://pbx.example.com/ws");
const ua = new JsSIP.UA({ sockets: [socket], uri: "sip:1001@pbx.example.com",
                          password: "secret" });
ua.start();
```

## 认证

WebRTC 客户端推荐使用**一次性 Token**（免 401/407 Digest 挑战）：

- REGISTER 里带 `X-Auth-Token` 头（HTTP 用户后端配 `token_header` 启用）；
- 或 WebSocket URL 带 `?token=`；
- CC 坐席模式还支持 JWT 快速注册（`[proxy.jwt_auth]`）。

## WebRTC 检测与处理

WebRTC 不是独立监听器，而是**按 SDP 自动识别**：

- SDP 含 `a=fingerprint` / `a=setup:` → WebRTC 腿；
- `RTP/SAVP` / `a=crypto` → SRTP 腿；
- 其余 → 普通 RTP。

识别后媒体侧自动适配：SRTP 解加密在媒体桥边界完成，WebRTC 腿也能走**零拷贝中继快速路径**；注册时携带 `supports_webrtc` 能力；有专用 WebRTC RTP 端口段（`webrtc_port_start/end`）。

## ICE

- WebRTC 腿始终运行 **full ICE**；
- 普通 RTP 腿可按需声明 **ICE-lite**（`[media] ice_lite`，或按中继 `ice_lite`、按分机 `;+sip.ice`）——Microsoft Teams Direct Routing 等严格 full-ICE 对端要求此模式；
- 浏览器通过 `GET /iceservers` 获取 STUN/TURN 配置（支持临时 TURN 凭据 HMAC-SHA1）。

```toml
[[ice_servers]]
urls = ["turn:turn.example.com:3478", "turn:turn.example.com:3478?transport=tcp"]
secrete = "shared-secret"      # 临时凭据模式
lifetime = 3600
```

## 内置话机页面

### 诊断页内嵌话机

控制台「诊断」页内置 JsSIP 话机：

- WebRTC ICE 探测面板；
- SIP 注册 / 注销、拨号呼叫、DTMF 按键；
- 注册端点列表显示「是否支持 WebRTC」徽标。

### 独立整机页面

`/static/phone.html`（CC SIP Phone，JsSIP 3.10.0）：

- 完整的注册、拨号、转接（REFER）界面；
- 另有 `/static/phone_jssip.html` 供回归测试使用。

::: tip
独立话机页面不在控制台侧栏挂链接，直接访问 `/static/phone.html` 即可。
:::

## 分机的 WebRTC 标记

控制台「分机」详情页可把分机标记为 WebRTC 终端，影响 SDP 应答与媒体适配。

## 网络会议

WebRTC 话机可通过 `conference_factory_uri` 加入 SIP 网络会议，详见 [电话会议](/features/conference)。
