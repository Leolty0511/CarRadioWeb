# 更新日志

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
