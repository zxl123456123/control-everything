# 本机 Codex 会话身份索引

2026-10-04；新 feature，与旧 WezTerm 真实关联未验收分开。

原始需求：用户要求 Codex 对话、WezTerm 对话对应真实小机器人，有游戏式活动空间、工位和动态关系。此前已明确“自动实施代码即可现在”，本次继续有效；不重复请求常规实施确认。

当前阶段：本只读身份范围已交付，独立 Review(Impl) 协议PASS/业务PASS。授权范围是本机只读身份索引与独立来源展示，不是恢复退出终端或发送消息。

当前事实：本机 state_5.sqlite 有真实 threads ID/cwd/time/archive/source；官方 app-server 控制 socket 的只读 version 探测 exit1，未建立实时状态通道。历史投影不可靠，不能以最近更新或未归档推断忙碌。研究见 ../codex-conversation-source-research.md。

里程碑：代码与官方调研、readiness、唯一 LW r2、独立 Review(LW)、root Gate-2 30项/0失败、实施与独立 Review(Impl) 均已验证。完整基线见 clarifications.md；最终 [独立审查](review_notes_impl_r1_1.md) 与 [交付范围](delivery_r1.md) 记录126 Python测试、1334浏览器检查、113实机身份对照及全部失败。持续自动实施授权覆盖本次只读范围，唯一实施作者为 game_scene_renderer_impl，root 独占浏览器 harness 与实际环境验证。

目标是让真实 Codex 身份进入机器人空间，同时清楚说明仅索引元数据、活动未知。真实 WezTerm 会话覆盖和定位仍需独立实机证据。
