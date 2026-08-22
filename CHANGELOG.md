# 更新日志

## [1.3.0] - 2026-08-22

### 新增

- 主机型号管理支持维护两张设备识别图片，前台识别弹窗在桌面端并排展示、移动端自适应展示。
- 用户手册和软件下载资源支持关联主机型号，前台可通过共享的“识别我的主机型号”弹窗筛选适用内容。
- 知识库各功能页和文档详情页增加“返回知识库首页”入口，用户不再需要依赖顶部导航返回。
- CANBus 设置支持按车型和主机类型联动查看设置内容，主机类型与主机操作教程保持一致。
- 主机操作教程增加主机型号横向展示区，支持图片和说明查看，并通过独立型号标签筛选教程。
- CANBox 类型和主机型号参考图统一使用普通居中弹窗展示，支持图片自适应和自定义说明。

### 优化

- 主机操作教程文案明确区分“辨认设备型号”和“筛选教程”，避免将图片卡片误解为选择器。
- 用户手册和下载页面不增加车型、年份选择器，仅按主机型号和通用资源筛选，识别完成后保留当前页面上下文。
- CANBox 与主机型号参考区改为一排三项的横向滑动布局，适配多种设备类型。
- 知识库结构化内容统一为原车主机接线指南，保留基本信息、图文教程和常见问题等核心内容。
- 分类管理和文档管理补充结构化文档类型，主机操作教程支持绑定主机型号。
- 知识库详情页返回按钮统一为简洁的返回图标样式，减少多余文字和装饰。
- 图片参考弹窗适配浅色和深色模式，降低遮罩强度，提升页面上下文可见性。
- CANBus 设置统一按单张图片维护，选择车型和主机型号后自动打开对应设置图弹窗。

### 修复

- 修复 CANBus 多图片配置及主机类型关联后的前台展示和查询问题。
- 修复普通管理员系统设置版本查看、版本检查和拉取更新权限。
- 修复知识库首页入口及相关中英文文案未同步更新的问题。
- 修复更新完成后刷新系统设置页面仍显示 100% 进度条的问题。

## [1.2.9] - 2026-08-21

### 优化

- 系统设置的“版本更新”对拥有系统设置权限的普通管理员开放，不再仅限超级管理员。
- 检查更新、查看状态和拉取部署包接口同步放宽为系统设置页面权限，生产服务器仍只使用预先构建的资源包。
- 普通管理员查看管理员列表时不再显示无意义的“只读”操作列；邀请、编辑、停用和删除仍仅超级管理员可操作。
- 表单管理的待处理和已回复改为全库统计，不再只统计当前页；批量操作增加“标记已回复”。
- 前台知识库首页入口由“车型数据/车型资料”改为“主机接线教程”。


## [1.2.8] - 2026-08-21

### 新增

- 视频教程播放窗口改为 13.1 英寸产品外观：四周等宽银色圆角边框，边框以内全部是屏幕，视频只在屏幕内播放。
- 左侧银色边框上还原 RST、MIC 两个孔位和丝印，不单独凸出一条侧板，也不进入画面。
- 该外壳独立于公告里的 9 英寸 Car Radio 样式；浅色和深色模式分别使用不同金属色、描边和阴影，避免融进页面背景。
- 主机接线教程改为图文步骤编辑与展示，可按车型维护接线教程。

### 优化

- 前台铃铛在有未读公告时直接打开最新公告内容，已读后点击才打开历史列表。
- 后台管理员、会员管理入口按权限显示，不再仅限超级管理员。
- 补齐接线教程编辑器的中英文文案。

### 说明

- 本地开发后台默认账号为 admin / admin；生产环境仍使用现有管理员账号，不会被重置。
- 部署包仍由 GitHub Actions 预先构建，生产服务器只拉取资源包，不在服务器上执行前端构建。


## [1.2.7] - 2026-08-11

### 新增

- 后台“消息推送”增加通知事件设置，可单独开启或关闭会员注册通知。
- 增加知识库留言通知开关，覆盖车型资料、视频教程和图文教程等文档留言。

### 优化

- 通知事件开关同时控制所有已启用推送渠道及旧版钉钉兼容推送，关闭后不会重复发送。
- 通知事件设置保存到数据库，升级或重启后保持不变；未配置时默认开启，兼容现有站点行为。

## [1.2.6] - 2026-08-11

### 新增

- 用户手册后台的新增分类、编辑分类、上传手册、编辑手册和 PDF 预览统一使用项目弹窗。
- 主站会员与 Flarum 论坛增加短时、一次性签名登录桥接；论坛已有账号可自动建立或关联主站会员，管理员账号保持独立。
- 未登录主站的访客可以直接进入论坛，继续使用论坛自己的注册和登录入口。
- 自更新部署包包含论坛桥接扩展，更新时自动安装并启用，不在服务器执行前端构建。
- 更新中心支持查看远程版本完整中文更新说明，并保留提交明细查看。

### 修复

- 修复用户手册管理中的浏览器原生删除确认和新窗口预览体验。
- 补齐论坛账号回到主站后的会员会话建立、一次性凭证消费和管理员邮箱隔离校验。
- 修复更新说明换行显示，中文段落在弹窗中保持原格式。

## [1.2.5] - 2026-08-08

### 新增

- 会员注册成功后向已启用的消息渠道发送通知；待审批注册会标明审批状态。
- 记录会员最近活动时间、登录 IP、设备类型、操作系统和浏览器信息，并限制在线状态写入频率。
- 后台会员管理增加会员总数、在线人数、正常账号和待审批统计，支持搜索、状态筛选、分页和设备信息查看。
- 知识库增加管理员专属的在线会员悬浮入口，可查看当前在线会员的昵称、邮箱、设备、最近活动时间和 IP。

### 优化

- 在线状态统一按最近 5 分钟活动判断，后台在线列表每分钟自动刷新，过期账号自动不再显示在线。
- 会员管理页面重新排版，注册规则、邀请码和会员列表层次更清晰，适合大量会员持续管理。
- 技术中心下拉菜单改为三列均衡布局，减少空白区域并提升桌面端可读性。
- 修复分类创建弹窗输入框每输入一个字符就失去焦点的问题。
- 修复访问统计地图只加载部分国家、低访问量国家颜色不明显的问题。

### 安全与稳定性

- 在线会员接口允许管理员查看，但会员审批、停用、删除和注册规则仍仅限超级管理员。
- 在线数据为辅助运营信息，推送失败不会影响会员注册流程。

## [1.2.4] - 2026-08-08

### Fixed

- Fixed the image-and-text tutorial category selector so existing categories are loaded and searchable.
- Kept legacy categories visible when older records do not contain document type metadata.
- Kept legacy categories visible when older records do not contain a language field.
- Showed configured video categories before their first published video, so navigation does not depend on content already existing.
- Prevented category browsing and management from crashing on legacy category records with missing metadata.
- Normalized legacy `enhanced-article` drafts and reconstructed HTML content from image-text sections before validation and persistence.
- Fixed global knowledge-base search fields and result links to match the current document schema and routes.
- Added a loading state while categories are being fetched.

## [1.2.3] - 2026-08-08

### Added

- Restricted the AI assistant to authenticated members and administrators, matching knowledge-base access rules.
- Added regression tests for multipart CSRF handling and typed document update endpoints.

### Fixed

- Fixed image uploads returning 403 because multipart request headers overwrote the CSRF token.
- Added forced CSRF token refresh and one replay for uploads when the browser token is missing or invalid.
- Fixed user-manual upload and deletion requests to use authenticated, CSRF-protected API calls.
- Restored the user-manual upload route in the deployable backend and allowed resource create or update permission.
- Fixed image-and-text tutorial saves by sending valid document type, content, summary, category, and persisted image metadata.
- Fixed updates to general and structured documents using a nonexistent generic endpoint.
- Added database update validators and clearer general-document request validation.

## [1.2.2] - 2026-08-08

### Fixed

- Fixed local-disk uploads when the configured directory is outside the project default uploads folder.
- Rebuilt storage services when provider configuration changes across PM2 workers.
- Added one automatic CSRF token refresh and retry for browser uploads.
- Completed knowledge-base resource permission checks for categories, manuals, resource links, and downloads.
- Added production logs for CSRF and permission denials to identify 403 responses quickly.

## [1.2.1] - 2026-08-08

### 修复

- 修复普通管理员拥有知识库权限后仍无法读取、编辑或删除图片与文件的问题，并统一文档编辑器和存储接口的权限判断。
- 修复后台导航只检查页面权限、未检查资源读取权限，导致页面可见但进入后返回无权限的问题。
- 修复无效权限邀请会先撤销旧邀请的问题，页面权限现在会自动补齐对应的只读资源权限。
- 修复生产环境邀请链接可能指向本机地址的问题，并增加邀请链接配置校验。
- 修复管理员接受邀请过程中数据库操作可能不一致的问题；支持事务，并兼容单机 MongoDB 的安全回退流程。
- 修复邀请邮件模板未转义昵称和链接的问题，并为接受邀请接口增加请求频率限制。
- 修复多个图片同时上传时 CSRF 令牌轮换导致超级管理员也收到 403 的问题。

### 新增

- 管理员邀请记录新增“重新发送”，失败、撤销或过期的邀请可生成新链接后再次发送。
- 联系表单的订单号或设备信息改为必填，并增加填写说明；前端、接口和数据库使用一致的校验规则。

## [1.2.0] - 2026-08-08

### 修复

- 修复普通管理员拥有文档创建或编辑权限时仍无法上传知识库图片、文件的问题。
- 修复后台长时间打开或首次上传时可能出现 `csrf_token_missing` 的问题。
- 修复 CSRF 错误被错误显示为“权限不足”的问题。

### 新增

- 管理员邀请支持发送邮件，并在后台展示邀请记录、状态和处理时间。
- 默认地图设置支持地址搜索，可从搜索结果快速定位地图位置。
- 公告编辑器支持标题、段落、列表、链接等富文本内容，并提供格式化预览。

### 优化

- 默认地图保存后自动锁定，只有管理员主动进入编辑状态后才能修改。
- 公告内容上限提升至 5000 字符，改善长英文、换行、长单词和长内容的展示效果。
- 管理员登录支持邮箱、登录账号和昵称。
- AI 助手状态改为依据实际客户端可用状态显示，避免服务正常却显示离线。

### 论坛

- 修复论坛接口未挂载、生产环境域名反向代理和 HTTPS 配置问题。
- 修复论坛部署过程误判 Docker 警告、初始化未完成却提前显示成功的问题。
- 重复部署时保留论坛数据库和上传资源，并同步最新部署脚本与 Docker 配置。
- 论坛部署后自动配置任务调度，解决 Scheduler 长期未运行的问题。

### 系统更新

- 支持私有 GitHub 仓库检查更新和下载预构建发布包。
- 支持没有 `.git` 目录的生产环境使用预构建包更新，无需在服务器执行高资源构建。
- 更新前校验发布包提交信息，更新失败时自动恢复原有文件和服务。
- 更新时同步前端、后端、生产依赖、论坛部署文件及项目版本信息。
- 更新完成后自动刷新前端或 Nginx、重启后端并执行服务健康检查。
- 修复更新任务在服务重启时意外中断、长期显示处理中和误报本地改动的问题。
- 发布包依赖统一使用官方 npm 源并增加下载重试，降低构建失败概率。

## [1.1.0] - 2026-08-06

### 新增

- 新增前台会员注册、登录、找回密码和邮箱验证码流程。
- 新增会员注册开关、管理员审批和邀请码规则。
- 新增后台会员管理，可审批、拒绝、停用和恢复会员，并查看注册 IP 与地区信息。
- 新增飞书群机器人推送渠道，支持 Webhook 和签名密钥。
- 新增知识库、用户手册、软件下载、车型、分类和 CANBus 数据的统一访问保护。
- 新增 GitHub 项目更新检查和更新日志展示能力。

### 安全与权限

- 前台会员账号与后台管理员账号使用独立认证 Cookie 和数据模型。
- 管理员可使用现有后台账号访问受保护资料。
- 文档留言和回复改为必须登录，作者信息由当前登录身份生成。
- 用户手册 PDF 移入私有存储，仅通过受保护接口预览和下载。
- 搜索结果和 AI 知识库数据按登录权限过滤。

### 优化

- 登录页重新调整布局，移除不必要的系统说明文案。
- 会员管理后台收紧内容宽度，改善大屏下的阅读和操作布局。
- 留言展示完整日期和时间，历史留言继续保留。
