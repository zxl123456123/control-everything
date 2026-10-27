# 项目文档

Control Everything 是在本机运行的开发工作台，用于管理项目和任务、观察已接入的工具与会话，并查看用量和资讯。产品展示与快速开始见[仓库首页](../README.md)。

| 文档 | 内容 |
| --- | --- |
| [使用指南](guides/usage.md) | 源码启动、项目与任务管理、配置、数据备份与恢复 |
| [工作台最小契约](architecture/workbench-contract.md) | 页面概念、字段含义与来源、读写规则及[下一阶段执行桥 MVP](architecture/workbench-contract.md#12-下一阶段执行桥最小-mvp) |
| [架构说明](architecture/architecture.md) | 组件职责、目录归属、数据流与扩展边界 |
| [可选接入](guides/integrations.md) | 远端会话、终端、启动器与只读 MCP |
| [Windows 安装与维护](guides/windows.md) | 安装器构建、停止、升级、回退与卸载 |
| [参与开发](../.github/CONTRIBUTING.md) | 开发环境、测试、构建及贡献约定 |

接入配置示例在 [examples/integrations](examples/integrations)，旧格式导入示例在 [examples/legacy](examples/legacy)。示例使用占位配置；真实配置与数据由使用者保存在本机。

本机任务记录放 `current/<feature>/`，历史记录放 `archive/<feature>/`；两个目录均不提交。每项任务从自己的 README.md 恢复，验证产物在仓库 `work/<feature>/`。根目录只保留本索引，正文按指南、架构和示例归属。
