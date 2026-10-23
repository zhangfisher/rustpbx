# 编写插件

本页说明如何实现一个 RustPBX 插件。参考实现：仓库 `examples/external-demo-addon/`。

## 最小插件

实现 `Addon` trait 的核心方法：

```rust
use rustpbx::addons::{Addon, AddonCategory};
use axum::Router;

#[derive(Default)]
pub struct MyAddon;

impl Addon for MyAddon {
    fn id(&self) -> &'static str { "my-addon" }
    fn name(&self) -> &'static str { "我的插件" }
    fn description(&self) -> Option<&'static str> {
        Some("演示用插件")
    }
    fn category(&self) -> AddonCategory { AddonCategory::Community }

    /// 启动初始化：起后台任务、定时器等
    fn initialize(&self, _ctx: &InitContext) -> anyhow::Result<()> {
        tracing::info!("my-addon initialized");
        Ok(())
    }

    /// HTTP 路由（自动挂到 /api 前缀）
    fn router(&self) -> Option<Router<AppState>> {
        Some(Router::new().route("/hello", get(hello_handler)))
    }

    /// 控制台侧栏项
    fn sidebar_items(&self) -> Vec<SidebarItem> {
        vec![SidebarItem {
            label: "我的插件".into(),
            path: "/my-addon".into(),
            permission: None,
        }]
    }

    /// 独立数据库迁移（插件自己的表）
    fn migrations(&self) -> Vec<Box<dyn MigrationTrait>> {
        vec![Box::new(MyMigration)]
    }
}
```

## 可用扩展点清单

按需实现（都有默认空实现）：

```rust
fn initialize(&self, ctx) -> Result<()>                    // 启动初始化
fn migrations(&self) -> Vec<Box<dyn MigrationTrait>>       // 数据库迁移
fn router(&self) -> Option<Router<AppState>>               // /api 路由
fn console_page_routes(&self) -> Option<Router<AppState>>  // 控制台页面路由
fn sidebar_items(&self) -> Vec<SidebarItem>                // 侧栏项
fn template_dir(&self) -> Option<PathBuf>                  // 模板目录
fn locales_dir(&self) -> Option<PathBuf>                   // 翻译目录
fn call_record_hook(&self) -> Option<Box<dyn CallRecordHook>>  // CDR 钩子
fn metrics_endpoint_info(&self) -> Option<MetricsEndpointInfo> // 指标端点
fn export_reload_handler(&self) -> Option<ExportReloadHandler> // 导出+热重载
fn branding(&self) -> Option<Box<dyn BrandingProvider>>    // 白标（商业）
fn ami_router(&self) -> Option<Router<AppState>>           // AMI 路由
fn on_shutdown(&self)                                      // 停机清理
```

## CDR 钩子（计费 / 上传 / webhook 典型场景）

```rust
impl CallRecordHook for MyHook {
    /// 落库前： enrichment（补字段）
    fn on_record_enrich(&self, record: &mut CallRecord) { /* ... */ }

    /// 落库后：通知外部系统
    fn on_record_completed(&self, record: &CallRecord) {
        // POST 到计费系统
    }
}
```

内置示例：observability 插件用它产出 `rustpbx_calls_total` 等指标；归档插件用它维护归档游标。

## 多语言

插件自带 `locales/en.toml` 与 `locales/zh.toml`（扁平 TOML 表），自动注册：

```toml
# locales/zh.toml
[nav]
my_addon = "我的插件"

[page]
title = "欢迎"
```

模板里用 `{{ "nav.my_addon" | t }}`，前端用 `tt("page.title")`。

## 注册到发行版

```rust
// 你的发行版入口
fn main() {
    rustpbx::builder::main_with_addons(vec![
        Box::new(MyAddon::default()),
    ]);
}
```

内置插件则是核心内条件编译：

```rust
// src/addons/registry.rs
#[cfg(feature = "addon-acme")]
registry.register(Box::new(acme::AcmeAddon::default()));
```

## 白标品牌化（商业）

```rust
impl BrandingProvider for MyBranding {
    fn brand(&self) -> BrandContext { /* 站点名、logo、主色、自定义 CSS */ }
    fn brand_for_host(&self, host: &str) -> BrandContext { /* 按 Host 租户品牌 */ }
}
```

控制台按请求 Host 解析品牌并注入样式；外发邮件同步品牌化。

## 测试建议

- 核心提供进程内 E2E 测试设施（feature `e2e-testing`：`TestUa` / `E2eTestServer` / `rtp_utils`），可驱动真实的 SIP+RTP 流量到你自己的服务器组装；
- 参考 `tests/` 下的 e2e_core 套件写法；
- 迁移务必独立成表，保证插件可安全插拔。

## 发布

- 插件可以是外部 crate（独立版本发布）或核心内 `src/addons/<id>/`；
- 编译进发行版时在入口 `main_with_addons` 注入；
- 商业插件额外实现许可证 scope 校验（`license.rs` 的 `can_enable_addon`）。
