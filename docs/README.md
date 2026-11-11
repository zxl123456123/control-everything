# 项目文档

Control Everything 是在本机运行的开发工作台，用于管理项目与工作区，在终端和 Agent 会话中开发，并查看用量与资讯。项目之外提供项目总览、新闻、设置和账号与设备；原有事项与外部执行器保留在兼容管理入口。产品展示与快速开始见[仓库首页](../README.md)。

安装使用从 [Windows 指南](guides/windows.md)开始；源码运行完整内置工作台需按[贡献指南](../.github/CONTRIBUTING.md#内置项目工作台源码与构建)准备并装配运行时，单独启动 Python 网关仅提供管理服务。公开安装包的功能和验收范围以其版本说明为准，源码分支更新不代表安装包已更新。

| 文档 | 内容 |
| --- | --- |
| [使用指南](guides/usage.md) | 内置工作台、账号与电脑接入、源码管理服务、兼容事项与接口、数据备份与恢复 |
| [兼容事项契约与历史设计](architecture/workbench-contract.md) | 保留早期字段约定、页面与执行桥规划供追溯；不是当前页面说明或开发计划，现行接口见使用指南 |
| [架构说明](architecture/architecture.md) | 组件职责、目录归属、数据流与扩展边界 |
| [可选接入](guides/integrations.md) | 远端会话、终端、启动器与只读 MCP |
| [Windows 安装与维护](guides/windows.md) | 安装、升级、回退、卸载；[每次新 EXE 的构建与发布流水线](guides/windows.md#构建与技术预发布) |
| [开发文件与产物管理](guides/development-files.md) | current 任务、归档、临时输出、资源保留及 AI 执行约束 |
| [宠物嵌入指南](guides/EMBEDDING.md) | 独立页面挂载、参数与生命周期 |
| [宠物集成指南](guides/PETS_INTEGRATION.md) | 工作台宠物接入与验证 |
| [参与开发](../.github/CONTRIBUTING.md#开发与出包从这里开始) | 开发工作流总入口：任务、环境、验证、预览、提交与交接 |

接入配置示例在 [examples/integrations](examples/integrations)，旧格式导入示例在 [examples/legacy](examples/legacy)。示例使用占位配置；真实配置与数据由使用者保存在本机。

`web/workbench-engine` 内的 Markdown 随固定源码保留，分别服务于内置技能、构建工具、测试场景和许可追溯，不作为本产品安装与使用的入口。不要按旧日期批量删除，也不要用其中的上游部署说明替代本项目的 Windows 或自建账号服务指南。

本机任务记录放 `current/<feature>/`，历史记录放 `archive/<feature>/`；两个目录均不提交。每项任务从自己的 README.md 恢复，验证产物在仓库 `work/<feature>/`。根目录只保留本索引，正文按指南、架构和示例归属。
