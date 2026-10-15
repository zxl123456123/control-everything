---
workflow: product-launch-video
flow: automation
storyboard: no
message: 把项目、任务与 Agent 会话放回一个清晰的工作空间
destination: GitHub repository introduction
aspect: 16:9
language: zh-CN
length: 60s
audience: 仓库访问者与项目维护者
angle: actual product tour
---

## Intent

用户要求演示当前仓库面板及功能；明确选择中文配音＋字幕，并要求好看、用代码实现、便于持续更新，放进仓库作为介绍。

## Execution choices

约一分钟横屏1080p；真实源码页面截图配合明确标注的演示数据。深色墨蓝背景、青绿与冰蓝强调，清楚的大标题与有节奏的局部放大。三章：项目与任务、工具与会话、协作与当前进度。成片与可重渲染源码均入库，生成缓存忽略。

## Assets and truth

从Git已提交版本的web页面生成隔离fixture截图，无生产API、账号或私人正文。屏幕示例数字不代表真实进度。Agent执行与Orca仍属待验收，视频明确说明；不显示已删除的人物渲染。运行中并行profile工作不混入本版。

## Audio

中文清晰女声＋逐句字幕，不使用未经授权的音乐。HeyGen未登录；Kokoro依赖未安装。优先尝试独立环境的中文神经TTS，若服务不可用使用本机已安装中文语音，并记录实际来源。
