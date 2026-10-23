import { defineConfig } from 'vitepress'

// RustPBX 合并文档站点
// 一级导航：指南（mydocs 内容，独立侧边栏） / API（REST API 与 AMI 参考，独立侧边栏）
const guideSidebar = [
  {
    text: '指南',
    collapsed: false,
    items: [
      { text: '简介', link: '/guide/intro' },
      { text: '快速开始', link: '/guide/quick-start' },
      { text: '系统架构', link: '/guide/architecture' },
      { text: '版本与插件体系', link: '/guide/editions' },
      { text: '核心概念', link: '/guide/concepts' },
    ],
  },
  {
    text: '进阶指南',
    collapsed: true,
    items: [
      { text: '项目概览', link: '/guide/introduction' },
      { text: '呼叫模型与路由', link: '/guide/call-model' },
      { text: '控制台与安全', link: '/guide/console' },
      { text: '部署与运维', link: '/guide/deployment' },
      { text: '数据库表结构', link: '/guide/database' },
      { text: 'API 集成指南', link: '/guide/api-integration' },
      { text: 'RWI WebSocket 协议', link: '/guide/rwi' },
      { text: 'IVR Step 协议', link: '/guide/ivr' },
      { text: 'session_id 关联模型', link: '/guide/session-id' },
      { text: '可观测性（专题）', link: '/guide/observability' },
    ],
  },
  {
    text: '配置',
    collapsed: false,
    items: [
      { text: '配置体系总览', link: '/config/overview' },
      { text: '平台与网络', link: '/config/platform' },
      { text: 'SIP 代理核心', link: '/config/proxy-core' },
      { text: '认证与用户', link: '/config/auth-users' },
      { text: '路由与中继', link: '/config/routing' },
      { text: '媒体、录音与 CDR', link: '/config/media' },
      { text: '控制台、SipFlow 与存储', link: '/config/console-storage' },
    ],
  },
  {
    text: '配置分篇详解',
    collapsed: true,
    items: [
      { text: '配置指南导航', link: '/config/' },
      { text: '总览与概念', link: '/config/00-overview_zh' },
      { text: '平台与网络', link: '/config/01-platform_zh' },
      { text: '代理核心', link: '/config/02-proxy-core_zh' },
      { text: '认证与用户', link: '/config/03-auth-users_zh' },
      { text: '路由', link: '/config/04-routing_zh' },
      { text: '中继与队列', link: '/config/05-trunks-queues_zh' },
      { text: '媒体、录音与 CDR', link: '/config/06-media-recording_zh' },
      { text: '插件、控制台与存储', link: '/config/07-addons-admin-storage_zh' },
      { text: 'SipFlow', link: '/config/08-sipflow_zh' },
      { text: 'SSO 接入演练', link: '/config/sso_walkthrough' },
    ],
  },
  {
    text: '可编程接口',
    collapsed: false,
    items: [
      { text: 'HTTP Router 动态路由', link: '/interfaces/http-router' },
      { text: 'RWI 实时接口', link: '/interfaces/rwi' },
      { text: 'RWI 命令参考', link: '/interfaces/rwi-commands' },
      { text: 'RWI 事件参考', link: '/interfaces/rwi-events' },
      { text: 'Webhook 事件推送', link: '/interfaces/webhooks' },
      { text: 'REST API 与 AMI', link: '/interfaces/rest-ami' },
    ],
  },
  {
    text: '功能特性',
    collapsed: false,
    items: [
      { text: 'Web 控制台', link: '/features/console' },
      { text: 'WebRTC 与软电话', link: '/features/webrtc' },
      { text: '呼叫队列', link: '/features/queue' },
      { text: '电话会议', link: '/features/conference' },
      { text: 'IVR 语音流程', link: '/features/ivr' },
      { text: 'AI 语音与 TTS', link: '/features/ai' },
      { text: '外呼', link: '/features/outbound' },
    ],
  },
  {
    text: '运维',
    collapsed: false,
    items: [
      { text: '可观测性', link: '/operations/observability' },
      { text: 'SipFlow 抓包与回放', link: '/operations/sipflow' },
      { text: '安全', link: '/operations/security' },
      { text: '集群与高可用', link: '/operations/cluster' },
    ],
  },
  {
    text: '插件开发',
    collapsed: false,
    items: [
      { text: '插件体系', link: '/addons/overview' },
      { text: '编写插件', link: '/addons/development' },
    ],
  },
]

// 二次开发专题：基于 RustPBX 二次开发的场景化文档（独立侧边栏）
const developmentSidebar = [
  {
    text: '开发',
    collapsed: false,
    items: [
      { text: '开发概览', link: '/development/' },
      { text: '同振', link: '/development/simultaneous-ring' },
      { text: '顺振', link: '/development/sequential-ring' },
      { text: '三方通话', link: '/development/three-way' },
      { text: '录音录像', link: '/development/recording' },
      { text: 'DTMF 响应', link: '/development/dtmf-response' },
    ],
  },
  {
    text: '相关接口',
    collapsed: true,
    items: [
      { text: 'HTTP Router 动态路由', link: '/interfaces/http-router' },
      { text: 'RWI 实时接口', link: '/interfaces/rwi' },
      { text: 'RWI 命令参考', link: '/interfaces/rwi-commands' },
      { text: 'RWI 事件参考', link: '/interfaces/rwi-events' },
      { text: 'IVR Step 协议', link: '/guide/ivr' },
      { text: '通话控制 (REST)', link: '/api/call-control' },
      { text: '编写插件', link: '/addons/development' },
    ],
  },
]

const apiSidebar = [
  {
    text: 'API 入门',
    collapsed: false,
    items: [
      { text: '快速开始', link: '/apiguide/quick-start' },
      { text: '认证与权限', link: '/apiguide/authentication' },
      { text: '通用约定', link: '/apiguide/conventions' },
      { text: '出站 Webhook 概览', link: '/apiguide/webhooks' },
      { text: '名词解释', link: '/apiguide/glossary' },
    ],
  },
  {
    text: '分类总览',
    collapsed: false,
    items: [
      { text: 'REST API 总览', link: '/api/' },
      { text: '接口分类一览', link: '/apiguide/categories' },
    ],
  },
  {
    text: '通话与媒体',
    collapsed: false,
    items: [
      { text: '通话控制', link: '/api/call-control' },
      { text: '通话记录 CDR', link: '/api/call-records' },
      { text: '录音播放与下载', link: '/api/recording' },
      { text: 'SipFlow 信令与媒体', link: '/api/sipflow' },
      { text: '状态呈现 (Presence)', link: '/api/presence' },
      { text: '呼叫队列 (Queues)', link: '/api/queues' },
    ],
  },
  {
    text: '资源管理',
    collapsed: false,
    items: [
      { text: '分机 (Extensions)', link: '/api/extensions' },
      { text: 'SIP 中继 (Trunks)', link: '/api/sip-trunk' },
      { text: '路由 (Routing)', link: '/api/routing' },
    ],
  },
  {
    text: '监控与诊断',
    collapsed: false,
    items: [
      { text: '仪表盘与运行指标', link: '/api/dashboard' },
      { text: '报表 (Reports)', link: '/api/reports' },
      { text: '诊断 (Diagnostics)', link: '/api/diagnostics' },
    ],
  },
  {
    text: '系统管理',
    collapsed: false,
    items: [
      { text: '系统设置与日志', link: '/api/settings' },
      { text: '用户 / 角色 / 部门', link: '/api/users-roles' },
      { text: '通知与其他接口', link: '/api/misc' },
    ],
  },
  {
    text: 'AMI 管理接口',
    collapsed: false,
    items: [
      { text: 'AMI API 总览', link: '/api/ami' },
      { text: '健康检查与诊断', link: '/api/ami-health' },
      { text: '热重载与运维', link: '/api/ami-ops' },
      { text: '外呼 SSE 与集群', link: '/api/ami-cluster' },
    ],
  },
]

export default defineConfig({
  lang: 'zh-CN',
  title: 'RustPBX 文档',
  description: 'RustPBX —— 用 Rust 编写的高性能软件定义 PBX，中文指南与 REST API 参考',
  // 发布到 GitHub Pages 项目页所需的子路径（https://zhangfisher.github.io/rustpbx/）。
  // 若将来迁移到自定义域名或用户页（username.github.io），改回 '/' 即可。
  // 本地 `npm run dev` 会自动跳转到 /rustpbx/ 前缀，无需手动处理。
  base: '/rustpbx/',
  cleanUrls: true,
  lastUpdated: true,

  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/intro' },
      {
        text: '开发',
        items: [
          { text: '开发概览', link: '/development/' },
          { text: '同振', link: '/development/simultaneous-ring' },
          { text: '顺振', link: '/development/sequential-ring' },
          { text: '三方通话', link: '/development/three-way' },
          { text: '录音录像', link: '/development/recording' },
          { text: 'DTMF 响应', link: '/development/dtmf-response' },
        ],
      },
      {
        text: 'API',
        items: [
          { text: '快速开始', link: '/apiguide/quick-start' },
          { text: '认证与权限', link: '/apiguide/authentication' },
          { text: '接口分类一览', link: '/apiguide/categories' },
          { text: 'REST API 总览', link: '/api/' },
          { text: '通话控制', link: '/api/call-control' },
          { text: 'AMI 管理接口', link: '/api/ami' },
        ],
      },
      {
        text: '生态',
        items: [
          { text: 'GitHub', link: 'https://github.com/zhangfisher/rustpbx' },
          { text: '官方网站', link: 'https://miuda.ai' },
          { text: '在线探测', link: 'https://probe.rustpbx.com' },
        ],
      },
    ],

    // 多侧边栏：指南、开发专题与 API 各自独立
    sidebar: {
      '/development/': developmentSidebar,
      '/guide/': guideSidebar,
      '/config/': guideSidebar,
      '/interfaces/': guideSidebar,
      '/features/': guideSidebar,
      '/operations/': guideSidebar,
      '/addons/': guideSidebar,
      '/apiguide/': apiSidebar,
      '/api/': apiSidebar,
    },

    outline: { label: '本页目录', level: [2, 3] },
    docFooter: { prev: '上一页', next: '下一页' },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '未找到相关结果',
            resetButtonTitle: '清除查询',
            footer: { selectText: '选择', navigateText: '切换' },
          },
        },
      },
    },
    lastUpdated: { text: '最后更新于' },
    darkModeSwitchLabel: '主题',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
    langMenuLabel: '语言',
  },
})
