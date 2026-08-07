# 更新日志

## [1.1.8] - 2026-08-07

### Added

- Add address search to the default map setting using OpenStreetMap search results.
- Lock the saved default map position until an administrator explicitly enables editing.

## [1.1.7] - 2026-08-07

### Fixes

- Add rich-text announcement editing with headings, paragraphs, lists, and safe links.
- Preserve announcement line breaks and wrap long English text in detail dialogs.
- Keep legacy plain-text announcements compatible and show the formatted preview in admin.
- Show the AI assistant as online when its configured client is ready.

## [1.1.6] - 2026-08-07

### 修复

- 修复私有仓库模式下检查更新和同步源码的 Git 认证失败问题。

## [1.1.5] - 2026-08-07

### 修复

- 管理员登录支持邮箱、登录账号和昵称。
- 修复私有 GitHub Release 预构建包下载跳转导致更新失败的问题。
- 修复一键更新在重启后台时意外中断的问题。
- 修复中断任务长期显示处理中，以及更新后工作区被误判为有本地改动的问题。
- 论坛部署后自动配置任务调度，修复 Scheduler 长期未运行的问题。

## [1.1.4] - 2026-08-07

### 修复

- 公告内容上限提升至 5000 字符，适合较长英文公告。
- 修复公告详情弹窗中的换行、长单词换行和长内容滚动显示。

## [1.1.3] - 2026-08-07

### 修复

- 让后台预构建更新同时同步论坛部署脚本和 Docker 配置，避免服务器继续使用旧脚本。

## [1.1.2] - 2026-08-07

### 修复

- 修复论坛部署过程中将正常 Docker 警告误判为失败的问题。
- 修复论坛重复部署会删除数据库和上传资源的问题。
- 完善论坛服务就绪检查，避免容器尚未完成初始化时提前显示部署成功。
- 修复生产环境论坛域名反向代理和 HTTPS 配置。

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
