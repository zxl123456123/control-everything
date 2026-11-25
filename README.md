# 掌控一切 · Control Everything

在同一个 Windows 窗口里切换项目，使用终端和 Agent 会话，查看文件和 Git 改动。需要并行改代码时，可以为同一 Git 项目创建独立工作区。工作台也能查看 Codex 额度和订阅的 AI 资讯。

[下载 Windows x64 安装器](https://github.com/zxl123456123/control-everything/releases/download/v0.1.0a19/session-panel-0.1.0a19-windows-x64.exe) · [0.1.0a19 早期测试版说明与校验值](https://github.com/zxl123456123/control-everything/releases/tag/v0.1.0a19) · [项目文档](docs/README.md)

## 产品展示

https://github.com/user-attachments/assets/40eb7ff9-c04e-4f62-90ff-64342e417eb2

## 快速开始

1. 运行安装器，从 Windows 开始菜单打开 **Session Panel**。本地使用无需平台账号。
2. 首次打开 0.1.0a19 时，在项目总览点击“进入工作台”，用“添加项目”打开已有目录、新建项目或克隆 Git 仓库。
3. 选择工作区，打开终端或 Agent 会话。终端沿用本机配置，使用 Codex、Claude Code 等工具前，先在本机完成相应工具的登录。

需要从浏览器继续工作时，在“账号与设备”用管理员分配的账号绑定自己的电脑。远程访问期间，电脑需要联网、保持唤醒，并运行工作台。[远程访问步骤](docs/guides/usage.md#从浏览器访问自己的电脑)

## 开发进展

- `main` 已更新项目总览和工作区布局。宽屏下可以在终端或 Agent 会话旁打开文件和 Git 差异，对照查看改动。
- `develop` 提供任务编排预览。可从本机项目的“任务流水线”启动 Codex，也可在已绑定的飞书群里发起项目任务、选择方案、验收交付。[开发预览使用说明](https://github.com/zxl123456123/control-everything/blob/develop/docs/guides/usage.md#启动项目自动编排)

从源码运行完整工作台，请按[贡献指南](.github/CONTRIBUTING.md#内置项目工作台源码与构建)准备运行环境。公开安装包的功能范围见对应版本说明。

## 许可证

项目采用 [MIT 许可证](LICENSE)。内置工作台基于 [stablyai/orca](https://github.com/stablyai/orca)，保留[上游许可证](web/workbench-engine/LICENSE)及[文件来源清单](tools/packaging/workbench-engine-source.json)。
