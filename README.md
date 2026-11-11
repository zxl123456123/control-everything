# Control Everything · 开发工作台

在本机工作台中管理多个项目和工作区，使用终端与 Agent 会话、查看工具用量和 AI 资讯。

适合同时使用多个开发工具、在不同项目之间切换的个人开发者。项目与管理数据保存在本机，基础管理无需配置 Agent、SSH 或远端服务；运行 Agent 需先准备对应工具的账号和配置。

[下载安装包](https://github.com/zxl123456123/control-everything/releases/tag/v0.1.0a18) · [项目文档](docs/README.md) · [参与开发](.github/CONTRIBUTING.md)

## 产品展示

https://github.com/user-attachments/assets/be96cc58-6bd8-4221-b0aa-77c0f9e31804

| 功能 | 可以做什么 |
| --- | --- |
| 项目与工作区 | 添加已有目录、新建或克隆 Git 项目，在工作区中保留开发现场；支持归档和恢复 |
| 内置开发工作台 | 在同一窗口使用终端、Agent 会话、文件、Git 和项目设置；Git 项目可创建独立 worktree 并行开发 |
| 会话与工具观察 | 选择 Codex、Claude Code、OpenCode 的本机项目来源后导入，支持其他 EXE 手工登记，进程指标收在诊断 |
| 返回工具窗口 | 在 Windows 上选择已登记工具的合格可见窗口，尝试切回继续工作；不承诺定位到终端标签页 |
| 用量与额度 | 按需读取 Codex 官方额度，查看各窗口剩余比例与重置时间 |
| AI 资讯 | 阅读内置来源或自定义 RSS/Atom/RSSHub 订阅，按分组与关键词筛选，按需采集或定时更新，保留日期与原文入口 |
| 账号与远程访问 | 使用服务管理员分配的独立账号，确认绑定自己的电脑后，从浏览器访问；需自行部署或取得服务地址 |
| 可选接入 | 按需配置文档进度来源、远端 Claude 会话、已有终端工作台和个人启动器，见[接入指南](docs/guides/integrations.md) |

常用流程：进入工作台 → 添加项目 → 创建或选择工作区 → 打开终端或 Agent 会话继续开发。

原有事项管理与 Codex / DSH 外部执行器保留在兼容管理入口，可明确执行、处理工具审批和人工审核。它与内置终端中的 Agent 会话分别管理；使用条件及尚未解决的 Windows 原生写入问题见[外部执行器最小流程](docs/guides/usage.md#外部执行器最小流程源码开发版)。

## 快速开始

**Windows x64 早期测试版 0.1.0a18**：[下载安装包](https://github.com/zxl123456123/control-everything/releases/download/v0.1.0a18/session-panel-0.1.0a18-windows-x64.exe) · [依赖对应源码](https://github.com/zxl123456123/control-everything/releases/download/v0.1.0a18/session-panel-0.1.0a18-sources.zip) · [版本说明与校验值](https://github.com/zxl123456123/control-everything/releases/tag/v0.1.0a18)。安装包自带运行环境，无需另装 Python、Node.js 或 Rust；源码 ZIP 不能代替安装器。

`0.1.0a18` 是完整版本号：`a` 表示 alpha（早期测试），`18` 是该阶段的版本序号，用于区分安装包。这一版包含账号接入和 iPhone 终端回车修复；实际测试结果与使用限制见版本说明。

1. 下载并运行安装器，选择安装目录。
2. 从开始菜单的 **Session Panel** 启动独立应用窗口；安装时可勾选创建桌面快捷方式。
3. 在项目总览点击“进入工作台”，再从“添加项目”添加已有目录、新建或克隆项目；已有项目可直接打开。
4. 创建或选择工作区，打开终端或 Agent 会话。终端沿用本机工具配置，首次使用需先在对应工具中完成配置与登录。

也可按[源码启动指南](docs/guides/usage.md#多-agent-工作台)运行。数据保存在本机；安装维护见 [Windows 安装指南](docs/guides/windows.md)，独立数据目录、端口设置、导入与备份见[使用指南](docs/guides/usage.md)。

仓库 `main` 是当前已集成源码，`develop` 用于开发预览；下载的安装包固定在对应发布标签，不会随分支更新。`0.1.0a18` 的受测源码为 `f3439da7`，包含范围与未验收项以[该版本说明](https://github.com/zxl123456123/control-everything/releases/tag/v0.1.0a18)为准。仅用 pip 启动管理服务不会自动构建完整内置工作台，源码装配步骤见[贡献指南](.github/CONTRIBUTING.md#内置项目工作台源码与构建)。

## 当前边界

- 本机进程观察与窗口返回需要 Rust 原生观察后台；源码安装缺少该组件时会显示受限，基础项目管理仍可使用。准备方式见[原生观察开发](.github/CONTRIBUTING.md#windows-原生观察开发)。
- 会话身份、进程运行和人工任务进度分别展示；进程存在不代表 Agent 正在工作或任务已经完成。
- 源码开发版提供需明确确认的 Codex / DSH 执行与人工审核。隔离范围与已知限制见使用指南。远端服务和个人工具需自行配置。
- 本机网关只监听回环地址；远程访问通过另行配置的账号与设备服务。电脑须联网、未休眠且软件保持运行；关闭网页或 Python 网关不会结束外部 Agent，也不会停止独立观察后台。
- 当前为开发预览版，目标平台 Windows 10/11 x64；安装器与原生程序未签名，已做本机安装验证，尚未完成干净 Win10/Win11 环境矩阵测试。

## 详细说明

- [架构说明](docs/architecture/architecture.md)：组件职责、目录归属、数据流与扩展边界。
- [使用指南](docs/guides/usage.md)：项目与工作区、账号与设备、资讯、本机观察、兼容事项管理及数据恢复。
- [可选接入](docs/guides/integrations.md)：远端会话、终端、启动器与只读 MCP。
- [Windows 安装与维护](docs/guides/windows.md)：安装、停止、升级、回退、卸载及发布验证。
- [参与开发](.github/CONTRIBUTING.md#开发与出包从这里开始)：日常开发工作流总入口；[构建新版本 EXE](docs/guides/windows.md#构建与技术预发布)按同一份流水线执行。

## 许可证

项目源码与文档采用 [MIT 许可证](LICENSE)。第三方依赖遵循各自的许可证。

内置工作台基于 [stablyai/orca](https://github.com/stablyai/orca) 的固定源码继续开发，保留[上游 MIT 许可证](web/workbench-engine/LICENSE)与[文件来源清单](tools/packaging/workbench-engine-source.json)。清单中的 `source-and-build-only` 界定源码、资源与构建输入的核验范围，不能据此判断某个安装包的功能是否可用；发行验收见对应版本说明。
