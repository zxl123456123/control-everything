# 事实入口

权威调查：../codex-conversation-source-research.md；实证 work/codex-conversation-source-metadata-r1.json、projection-r1.json、control-probe-r1.json。

实际 gateway 只有远端 service，API 已有 loopback、Host、Origin、X-Session-Client 检查；无 Codex 路由。app.js 目前 selected 只用远端 UUID，消息与 focus 也只用于远端。

官方：https://learn.chatgpt.com/docs/app-server；thread/read 不 resume/不订阅；状态属于连接的服务器。控制探测失败不等于桌面无任务，不能另启 server 后用其 notLoaded 判定原桌面会话状态。

当前 metadata 包含 cli/exec/vscode/subagent，交互默认排除 subagent；归档与 updated_at 不能解释为 active。
