# 掌控一切 · Control Everything

掌控一切是一个 Windows 开发工作台。打开项目后，你可以在终端里运行命令，和 Codex 或 Claude Code 一起写代码，再用 Git 看改了哪些文件、哪几行。

如果要一边修 bug，一边试新功能，可以给同一个 Git 项目建两个工作区，各用一份代码。工作台里也能查 Codex 的剩余额度、读自己订阅的 AI 资讯。

[下载 Windows x64 安装器](https://github.com/zxl123456123/control-everything/releases/download/v0.1.0a19/session-panel-0.1.0a19-windows-x64.exe) · [0.1.0a19 早期测试版说明与校验值](https://github.com/zxl123456123/control-everything/releases/tag/v0.1.0a19) · [项目文档](docs/README.md)

## 产品展示

https://github.com/user-attachments/assets/40eb7ff9-c04e-4f62-90ff-64342e417eb2

## 快速开始

1. 运行 0.1.0a19 安装器。安装好后，从 Windows 开始菜单打开 **Session Panel**。在本机使用无需平台账号。
2. 第一次打开时，在“项目总览”点“进入工作台”，再点“添加项目”。如果代码已经在电脑上，选它所在的文件夹。你也可以新建项目或克隆 Git 仓库。
3. 选好工作区后，打开终端就能运行命令。想用 Codex 或 Claude Code，先在这台电脑上配置并登录对应工具，再打开 Agent 会话。

要从另一台设备的浏览器打开项目，先用管理员发给你的账号，在“账号与设备”里绑定这台电脑。远程使用期间，电脑需要保持联网和唤醒，工作台也要开着。[远程访问步骤](docs/guides/usage.md#从浏览器访问自己的电脑)

## 开发进展

- **`main` 源码**更新了项目总览。宽屏下使用单栏布局、侧栏也没有盖住内容时，可以在终端或会话右边打开文件，对照查看 Git 改动。
- **`develop` 开发预览**里，打开项目的“任务流水线”，选好任务后点“启动 Codex”。如果飞书群已获授权并绑定项目，也可以在群里提需求、选方案，最后确认改动是否符合要求。[预览版操作步骤](https://github.com/zxl123456123/control-everything/blob/develop/docs/guides/usage.md#启动项目自动编排)

上面两项是安装包发布后的源码进展。想试用这些改动，可以按[贡献指南](.github/CONTRIBUTING.md#内置项目工作台源码与构建)运行对应分支。

## 许可证

项目采用 [MIT 许可证](LICENSE)。内置工作台基于 [stablyai/orca](https://github.com/stablyai/orca)，保留[上游许可证](web/workbench-engine/LICENSE)及[文件来源清单](tools/packaging/workbench-engine-source.json)。
