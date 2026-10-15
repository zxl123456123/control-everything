# 方案评审记录：hlplan（第 1 轮）

**评审对象**：`hlplan.md`，2026-10-14 候选版。  
**评审时间**：2026-10-14（Asia/Shanghai）。  
**review_target**：`hlplan`；受众：共享。  
**评审结论**：✅ 通过（仅高层方向与后续规划输入）。  
**被审 SHA-256**：`F7178567796836772A584BA47AF55BD661C83DB89508FBC6A1C119355575FC2F`。

结论：有条件选择外置 runtime 与完整官方 Web client，保留 Python 管理面，符合用户降低重复实现的目标。
未发现需要先改变用户范围、推翻架构方向或阻断本轮高层收口的问题；下述建议不阻断高层评审。
本结论允许准备下一项隔离实验的 Readiness，不授予进入 LW、实施、真实模型试跑或产品发布的许可。

## 范围与输入

- 全文独立读取本目录 `README.md`、`clarifications.md`、`research.md`、`hlplan.md`。
- 核实旧工作台 README、用户确认原文及旧 M3 `handoff-paused.md`；不以旧成功标签替代新证据。
- 读取本地执行链、小院账本与 Provider 卡的相关实现片段，只验证架构现状，不做旧产品代码审查。
- 独立核对固定上游 SHA 的 CLI launcher、Node entry/bind、Vite Web、Web main 与结构化 capability gate。
- 本轮没有安装、构建、启动 runtime、读取凭证或私人正文、发送 Agent 任务、运行产品测试。

## 需求与基线一致性

| 原始要求或基线 | 方案锚点 | 独立判断 |
|---|---|---|
| 用户希望复用 Orca 的底层管理与展示，减少造轮子 | 第 1 节；D1、D2（行 44–59） | 固定版本外置复用与完整展示优先，理由和替代路线齐备 |
| 用户暂缓像素小人嵌入，除非已有实际作用 | G3、事实归属、D4（行 19、37、75） | 延期动画，解释账本价值，不虚构持续使用或删除历史 |
| 保留个人项目/任务管理，不重写完整 IDE | 行 20、26–28、D3 | 管理、运行事实和上游展示各有归属，没有新增完整状态库 |
| 旧 M3 尚未真实验收，本轮不恢复模型试跑 | 行 21–22、P1、P3 | 保留历史边界；真实控制须另行明确范围与额度 |
| 不把启动、接口存在或终端可用等同审批/取消可用 | 行 39–40、D4、P1–P3 | 分层证据与未知状态清楚，失败时不盲目重发 |

`clarifications.md` 的 G1–G3、反目标和风险边界均能对应到方案；未发现未回答的本轮用户问题。
技术 U 点保留为候选可用性缺口，没有被写成用户已经确认或本机已经运行。

## 可行性分析

- 技术方向有实际入口：本地 `execution.py:42–72` 直接选择 `CodexRun`；`codex_execution.py:153–166` 自行启动 Provider 协议链。
  这支持“现状仍是自研执行链”，本轮没有证据证明已调用 Orca runtime。
- 上游 Node entry 构造共享 `OrcaRuntimeService`，同时安装独立宿主适配；外置复用可以作为候选，不能据此保证 Windows 可用。
- [CLI launcher](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/cli/runtime/serve-orcad-launch.ts#L135) 固定加入宽监听；[Node bind](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/orcad/orcad-bind-address.ts#L27) 缺省 loopback。
  D1 选直接 entry、不自动回退默认 serve，与独立核对的源码一致。
- [Vite Web config](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/vite.web.config.ts#L9) 与 [Web main](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/renderer/src/web/main.tsx#L28) 支持完整 App 路线；不是独立聊天组件合同。
  D2 先取得独立客户端证据、延后 iframe/组件抽取，避免把研究缺口变成产品承诺。
- P1→P2→P3 的顺序可逐层否定候选；U5 不成立可退回入口，U6 不成立保留现状，未形成必须迁移的单向路径。
- 资源与成本尚不能量化；方案没有给出未经验证的工期或维护优势，适合作为实验规划输入。

## 风险点

1. **宿主保护差异，已纳入方案。** [Node entry](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/orcad/orcad-entry.ts#L84) 明示加密不可用。
   行 36、88、92 正确区分 profile、Provider home 与凭证保护；后续不能仅建临时 profile 就启动实验。
2. **完整客户端的权限和后台行为，仍未实测。** 行 73、89 与 U3/U4 留出准入边界。
   配对到 workspace 权限的完整 App 不等于只读面板；继承与读取边界须在后续实际运行前确定。
3. **关联与控制能力可能不成立，方案已承认。** 行 65–67、99–101 保留仅入口与未知状态；P2 不能被宣传为已统一执行管理。
4. **版本耦合与原生依赖成本。** 行 50、116 保留 Windows/native PTY 和固定版本要求；共享 runtime 不构成稳定公共 SDK 承诺。
5. **重复执行与状态混淆。** 行 40、67、110 分开回执、停止、清理和验收，并禁止同任务双派发；方向正确，后续需落实到验证。

## 遗漏或需补充

- 未发现影响当前方向判断的必补项；函数签名、安装命令、运行证据不属于本轮通过条件。
- **建议 S1（非阻断）**：行 49、87、109 的维护成本比较尚无统一观察口径。
  后续 P1 计划可记录固定版本部署步骤、升级适配范围及需要维护的自有代码，P3 再与继续自研的成本比较；避免只按能否启动作取舍。
- **建议 S2（非阻断）**：行 88–91、118 的核查应在低层计划明确先后依赖。
  先核实 Provider home/自动发现/正文读取边界，再启动 runtime 与完整 App；边界不明就停在源码补证，避免启动后才发现越过 U3。
- 小院 `garden.py:1、215–239` 确有独立产物复核能力；这不能证明实际账本持续使用，G3 延期依据充分。

## contract drift / stale / mirror mismatch

- 本轮四份文档对仅规划、旧 M3 暂停、像素场景延期和未来 Gate 的口径一致。
- 旧工作台与 M3 交接保留历史范围，未发现本方案用新的高层结论覆盖旧未验收状态。
- 未审查 shared skills 的全量镜像；本结论不作跨平台合同或未来实现一致性保证。

## 后续行动

1. coordinator 读取本报告全文，保持本轮止于高层方案与独立审查的状态。
2. 后续按现有授权为 P1 做 Readiness；明确六类核查、证据责任与停止条件，消费 S1/S2。
3. Readiness 与低层 Gate 各自收敛后，coordinator 承接隔离运行和浏览器验证；失败/未知如实保留。
4. P2/P3 分别取得本阶段前置证据；真实模型范围未明确前，不恢复旧 M3 或迁移执行链。

## 当轮核查与限制

- 四份文档非空、本地 Markdown 链接核查：`checked_documents=4; checked_local_links=6; missing_links=0`，退出 0。
- 实际实现片段、被审行号与 SHA-256 核查命令退出 0；上游五个精确 HTTPS 片段读取修正后全部退出 0。
- 保留失败：浏览工具 Node bind 页面超时；输出包装发生 TypeError；首次 PowerShell 片段提取误用 HashSet `ToArray()`，五个命令退出 1。
  已用数组转换重取并读取完整核查输出；这些取证失败不构成 Orca 运行失败或来源不可用证据。
- 本报告落盘后再次核对必备章节、链接、被审 hash 与报告全文；没有运行验收证据，不声称接入已可用。
- 本轮未新增跨功能事实；调研报告已有的候选事实不重复登记。
