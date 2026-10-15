# Readiness 检查记录（第 1 轮）

**评审对象**：当前 P1-A 基线、最终架构及三份研究；原 hlplan 仅历史输入。
**评审时间**：2026-10-14
**评审结论**：PASS
**受众**：用户、协调者与后续规划者共享。

允许为 P1-A 独立离线预检编写低层计划。现有证据足以定义一个只核对明确提供材料、候选参数和合成环境计划的小工具；没有证据允许启动 Orca。P1-B、完整运行接入、HTTP 迁移和真实模型验证均不在此次放行范围。离线工具尚未实现或测试，本报告也不证明工具已可用。

## 输入文件

本 reviewer 全文读取下列文件；SHA256 为当轮 Get-FileHash 实际输出。路径均相对于本目录。

| 文件 | SHA256 |
|---|---|
| README.md | A06EF3E7B07ACE614D84CE686B9A1C3EA7A605991F2D997E108469886E558B6D |
| clarifications.md | E2A4B888D5B4D31D3FF0A3F9A8860CB4437EFED807687EB099F30ECF5AE04F95 |
| architecture-final.md | 704CFA6BD29087F54FD60525E440999B48510786147A427BDB084190F7C6071A |
| review-b92c4e.md | DB45A8C90DBD2D593BF3B1824F5F13333989F021E607DBBE3537E362D880D390 |
| research.md | 571337FD98826A2DFFD36B092461061BD63B7B53D0507F7E9795C7937D36A6F3 |
| research_stability.md | 529F4F2D5FFC859D55194A04707EEC1183B32709BC5C38374FBB0CC4B936CAC8 |
| research_p1_implementation.md | D9611D9490D1A8D59803C569325D29081CC8A56C1339CF544569C56A9B82B729 |

额外读取 plan-review、clear-expression、verification-before-completion。直接核对本地 `session_panel/owned_process.py:167–184`：spawn 没有 env 入参，CreateProcessW 的环境参数为 None。直接读取公开副本 `work/orca-p1-research/` 中 `src__main__orcad__orcad-daemon-supervision.ts`、`src__main__orcad__orcad-app-paths.ts`、`src__shared__node-runtime-pin.ts`、`src__shared__orcad-artifacts.ts` 全文：daemon cleanup 只 disconnect；profile 与 home/temp 路径不同；Windows Node pin 和现成 artifacts 声明存在。仅文本读取，未执行、import 或重新下载这些源码。

## 澄清与基线核验

### A. 澄清问题完整性

- ① 未回答 Q&A 是否为空：是。未回答节没有具体待答问题；最新 P1-A 节把 P1-U1–U5 明确归为技术证据缺口，并未留下需要用户决定的首批范围。较早“无阻塞当前调研和高层方案”措辞不单独作为 P1 准入依据。
- ② coordinator 是否漏记澄清问题：未发现。README 的最新“继续，直到可以实现代码那一步”已进入已回答节及当前补充基线；没有把旧自动开发授权覆盖最新停机要求。
- ③ 头脑风暴决策是否完整落盘：是。决策 1–8 与最终架构相互对应；P1-A 收敛理由及 P1-B 后续条件已明确落盘，不需规划者自行判断是否启动。

### B. 基线内部质量

- ④ 必填章节 1–10：PASS。目标、反目标、风险、验证责任、文档职责、生成规则、内容边界、下游消费、状态兼容、新需求处理均存在且非占位。末尾“当前补充基线”明确覆盖旧的仅高层阶段限制；历史目标不误用为当前低层范围。
- ⑤ 目标锁：PASS。P1-G1 锁定固定材料有界读取、存在/尺寸/hash/版本、参数和合成环境；P1-G2 要求区分静态匹配/缺失/不匹配/运行未验证；P1-G3 要求零产品接线。函数、输入输出、退出码及上限是 LW 必须落定的实现细节，当前不需要伪装成已确定代码。
- ⑥ 反目标：PASS。以下“确认不存在”仅指当前生效基线没有要求执行禁止行为，不是尚不存在工具的实现审查。

| 禁止内容 | 可核查证据 | 结论（当前规划指令中确认不存在） |
|---|---|---|
| 执行被检文件、subprocess、下载、安装、TS import、监听、配对、浏览器启动 | clarifications 的 P1-A1；research_p1 的 B/F 明示文本读取与禁止启动 | 确认不存在此类执行任务 |
| 读取凭据、私人正文、宿主账号或完整环境 | 当前风险责任、P1-G1；research_p1 的 C/F 只接受合成映射 | 确认不存在此类读取授权 |
| 静态成功升级为 runtime 安全/兼容/隔离/清理通过，布尔开关越过阻断，可执行命令导出 | P1-G2、P1-A1/A3；research_p1 的 F/G | 确认不存在此类放行要求 |
| 修改 OwnedProcess、旧 M3、FastAPI、前端、库或像素模块；扩为生产调度/通用清单/Provider 框架 | P1-A2、P1-G3；当前反目标 | 确认不存在此类产品任务 |
| 默认 CLI serve 宽监听 fallback、把 profile 等同沙箱 | 原风险边界；最终架构第 4/6 节；research_p1 的 C/D | 确认不存在此类替代路线 |
| 启动 P1-B、P2/P3、真实模型或整个架构实施 | 最新首批范围明确 P1-U1–U5 补齐后另行准入；STOP_BEFORE_IMPL | 确认不存在本轮执行授权 |

- ⑦ 风险边界与责任：PASS。研究只读取证；规划作者仅文档与 Gate-1；reviewer 独立评审；协调者核验并承接真实环境验证。公开源码与固定哈希不被当成安全证明。
- ⑧ 验证责任、产物、顺序：PASS。research_p1 → readiness → lwplan/Gate-1 → 独立 Gate-2 → STOP_BEFORE_IMPL；以后 impl 仅纯临时 fixture，协调者承接实际 Windows/外部行为，缺失继续未验证。README/run_logs 保存状态，不以高层 PASS 越过后续 Gate。

### C. 基线与澄清一致性

- ⑨ 与已回答 Q&A/头脑风暴无矛盾：PASS。

| Q&A 条目或决策 | 对应基线字段/条目 | 一致性 |
|---|---|---|
| 确认为 stablyai/orca，优先复用以降低重复建设 | 决策 1/3、P1-G1、P1-A2 | 采用上游已有声明约束小切片，不创建第二套 runtime |
| 暂时不推进像素嵌入 | 原 G3、决策 2、P1-A2 | 像素延期，旧数据保留 |
| 旧 M3 因额度暂停，询问进度不恢复试跑 | 原风险第 5/6 项、当前风险责任 | 无模型调用，旧 M3 不改写 |
| 研究技术、稳定性、扩展、Rust 与多 Agent | 决策 5/8、当前反目标、P1-A3 | 技术方向保留，首批不扩展成框架/全 Provider 实施 |
| 评审并收敛最终架构 | 文档职责、当前下游阅读顺序 | architecture-final 唯一入口；旧 hlplan 为历史 |
| “继续，直到可以实现代码那一步” | 当前目标/状态、P1-G2 | 连续规划和独立评审，STOP_BEFORE_IMPL |
| 决策 6：先静态核查，再最小运行、独立 HTTP 迁移 | P1-A 收敛段、P1-G1/G3 | 首批静态；P1-B 与 HTTP 仍后续 |
| 决策 7/8：独立 runtime 生命周期、全入口准入才受控执行 | P1-A3、P1-U4 保留 | 不以主进程退出推导清理，不启动、不受控派发 |

- ⑩ README → 决策 → 基线可追溯：PASS。
  - “底层技术管理和展示用ocra的源码技术可以尝试，这样不需要自己造轮子” → 决策 1/3 与最终架构 D4 条件采用 → P1-G1 使用固定版本现成声明、P1-A2 禁止通用框架。
  - “暂时可以先不用管他的嵌入了” → 决策 2 → 原 G3 与 P1-A2 排除像素改动。
  - “是否稳定，未来是否可靠，是否可以扩展” → 决策 6/7 与架构第 6 节先静态后运行 → 研究揭示 daemon/环境缺口 → 首批 P1-A、P1-A3 保持运行未验证。
  - “可以评审一下，最后确认最终架构方案进行设计” → 决策 5–8 及最终高层复核 → 当前下游消费使用最终架构，不重开候选方案。
  - “继续，直到可以实现代码那一步” → README 本轮继续至实施前 → 当前补充基线的 Readiness/LW/Gate-2 产物与 STOP_BEFORE_IMPL。

### D. 基线内部一致性

- ⑪ 目标锁与反目标：PASS。检查候选参数是数据核对，不执行命令；读取调用者提供材料不等于发现宿主材料；离线结果不授予启动资格。目标可在反目标内实现。
- ⑫ 风险边界与验证责任：PASS。fixture 只证明检查器行为；真实进程、环境、网络与 ABI 仍由协调者后续承接。这里“无副作用”按不执行被检材料/不接线产品解释；必要测试临时文件不是运行 Orca 的授权。

### E. 与 research 对齐

- ⑬ 关键约束进入基线：PASS。默认 serve 宽监听、Node SecretStore、profile 非隔离、完整 Web 服务未知继承到当前风险；新研究的 daemon 存活、OwnedProcess 环境继承、artifact 与 Web 分离、Node 固定 pin、缺材料不自动取得进入首批范围和 P1-U1–U5。
- 本 reviewer 直接核对 daemon `stopOrcadDaemon` 与 WindowsAPI.spawn 后，同意将真实启动排除。现有上游 artifact 声明允许选择有界子集；LW 必须列明未覆盖项，不能维护整份清单镜像或将一个 entry 存在当成 bundle 完整。

### 澄清与基线核验结论

整体结论：PASS。①为空，④–⑬无 FAIL；因此无阻断三元组。此结论只支持编写 P1-A LW，不关闭任何运行 U 点。

## 缺失证据与分类

- **当前 readiness 证据缺口**：未发现阻断 P1-A 低层规划的缺口。具体 schema、读取上限、路径边界、错误/退出码、fixture 和回退尚未设计，属于下一阶段任务，不能因此声称已经可编码。
- **后续运行证据缺口**：P1-U1 固定 bundle 来源/构建/native；P1-U2 自动发现及副作用；P1-U3 实际监听/Web/权限；P1-U4 整套所属进程退出；P1-U5 Windows 环境生效均开放。旧 U/S-U 的性能、恢复及真实 Provider 能力缺口同样保留。这些不影响纯离线检查器规划，但阻断 P1-B。
- **契约缺口**：未发现阻断 P1-A 的契约缺口。最终架构“Orca 收尾自身 Agent、监听与数据”是需核验的目标；上游 daemon 存活说明不能把默认 stop 当成达到目标。本轮基线明确禁止作该推论，后续 P1-B 必须单独解决。

## contract drift / stale / mirror mismatch

- 非阻断 stale：README 顶部已写“P1-A Readiness 检查”，旧里程碑仍写“Readiness 与低层计划（本轮未进入）”，早先“下一步”仍包含最小启动/停止。末尾当前生效范围及 clarifications 明确覆盖，未造成首批范围不唯一。协调者收取本报告时宜同步导航文字。
- clarifications 前部仍有“本轮止于高层”历史段落，但当前补充明确覆盖，不构成当前合同冲突。review-b92c4e 的旧 clarifications hash 是历史评审对象，不是当前 hash 错误。
- 未检查平台镜像，不对跨平台镜像一致性作保证。

## 建议恢复动作

- A. 证据补强：当前无需回退 research；进入 P1-A LW 时明示覆盖子集、只读路径边界、合成环境输入、所有静态匹配仍运行未验证，以及 fixture/协调者分责。P1-U1–U5 的补证与真实运行以后另做准入。
- B. 契约纠偏：无需更改已审定高层决策；协调者同步 README 当前导航。若 LW 扩大为执行、安装、浏览器或产品接线，应退回基线/readiness，而非用本 PASS 放行。

## 验证与失败保留

本轮首次批量文件输出发生截断，随后将 clarifications、架构/复核、research、research_stability、research_p1 分别全文补读；没有依据截断尾部作判断。读取、源码定位和哈希命令退出码为 0。未执行产品测试或 Orca，也没有读取账号/私人正文/全环境。

历史研究中的浏览失败、404、GitHub rate-limit、unexpected EOF、15 秒超时、缺文件以及非 Git 目录下 diff --check 退出 1 全部保留；本次没有通过默认成功尾命令把这些失败改成成功。公开副本只支撑已读静态事实，不等于发行物验证。

## 放行判断

- review_target: readiness
- conclusion: PASS
- scope: P1-A 独立离线预检工具的低层规划
- allow_enter_lwplan: yes
- allow_enter_impl: no（须 LW/Gate-2，且本轮授权停在实施前）
- runtime_readiness: 未通过；P1-U1–U5 开放
- stop_boundary: STOP_BEFORE_IMPL

无新增跨功能事实。
