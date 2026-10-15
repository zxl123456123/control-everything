# 未映射反馈补充调研（r3）

日期：2026-10-03；角色：repo_researcher。只调查事实，不写方案或产品补丁。

**结论：当前“未映射”混合了旧索引残留、身份冲突、已核验身份但缺终端位置三类情况。** 最后一份完整 HTTP 元数据采样有 6 行：2 行位置确认、2 行当前注册缺失、1 行身份冲突、1 行身份/进程已核验但位置未知。14:46—14:53 之间远端注册和进程实例持续变化，不能把早期三槽位快照或一次绿状态当成持续保证。另确认一项当前原因展示缺陷：来源已恢复后，缺注册行的 `reason_codes` 仍携带旧 `source_unavailable`。

用户最新原话：“你继续，目前我看好多都是未映射成功的，然后现在能不能来个机器人控制面板像素小人之类的3d显示之类的，然后保证功能，可以去看看github有没有现成可参考的技术”。本报告仅调查映射反馈；像素/3D 的新范围由 coordinator 承接。原功能仍为 **impl_reviewing / Q6 待客户端观察**；这段新需求没有回答“三工具是否可见”，不改变既有审查结论。

## A. 系统边界与现有能力

- 固定来源为 `ubuntu@175.24.135.125:/home/ubuntu/.claude`，Claude Code 2.1.278；本机只关联 Zellij 0.45.1 / workbench-v4 / Work-for-Linux 的严格 main/dev/files 命令。来源常量见 [source.py:5](E:/project-funny/mianban-develop/session_panel/source.py:5)。
- 列表来自该用户/config 的内部 PID registry，进程计数来自该 UID 的 `claude` / `claude.exe`；数量均不是全主机或所有历史会话总数。注册数、进程数、列表行数、位置确认数含义不同。
- 日常列表只查询元数据；本轮未调用消息 endpoint、未选中会话、未读取私人消息正文、未 focus/输入/重启，也未改远端或权限配置。Edge 为新建 headless 页面，限制为本地 GET 元数据和静态资源，未保存截图或 token。

## B. 入口与主流程

`GET /api/sessions`（`X-Session-Client: panel`）→ 单份 SessionService → 既有 SSH 下的 registry / proc / UUID 顶层身份元数据 + 本机 Zellij list-panes → 按 UUID 合并 → web 元数据卡片。只有唯一新鲜 slot 与 pane 关系才能定位；不能以 cwd、旧 slot、tty 或标题猜配。

本轮完整 HTTP 与直接观察、过滤 proc/祖先、终端清单、浏览器 DOM、纯合成原因复现统一保存在 [session-mapping-feedback-r3.json](E:/project-funny/mianban-develop/work/session-mapping-feedback-r3.json)。未落消息正文。

## C. 关键模块与证据锚点

| 模块 | 实际职责 / 锚点 |
|---|---|
| remote_probe | [read_registration:115](E:/project-funny/mianban-develop/session_panel/remote_probe.py:115) 核对 PID、UUID、cwd、实例及允许环境；[argv 冲突:155](E:/project-funny/mianban-develop/session_panel/remote_probe.py:155) 不选胜者；[observe_source:182](E:/project-funny/mianban-develop/session_panel/remote_probe.py:182) 逐注册观察和独立进程计数 |
| service | [merge_observation:96](E:/project-funny/mianban-develop/session_panel/service.py:96) 当前与旧 UUID 联集；[123](E:/project-funny/mianban-develop/session_panel/service.py:123) 保留旧行；[140](E:/project-funny/mianban-develop/session_panel/service.py:140) 缺注册 / 冲突 / 实例变化拒配；[151](E:/project-funny/mianban-develop/session_panel/service.py:151) 唯一 slot/pane 才 confirmed |
| terminal | [parse_slot_command:21](E:/project-funny/mianban-develop/session_panel/terminal.py:21) 精确整段 SSH 启动命令；[list_panes:56](E:/project-funny/mianban-develop/session_panel/terminal.py:56) 当前版本/清单；plugin 与同编号 terminal 分开处理 |
| gateway / web | [GET 路由:103](E:/project-funny/mianban-develop/session_panel/gateway.py:103) 查询同一 Service；[卡片:39](E:/project-funny/mianban-develop/web/app.js:39)、[原因:74](E:/project-funny/mianban-develop/web/app.js:74)、[计数:85](E:/project-funny/mianban-develop/web/app.js:85)；页面选择会触发消息读取，本轮没有选择 |

## D. 新鲜采样与具体未映射原因

### 时点变化

| UTC 时点 | 当前注册 / 同 UID Claude 进程 / 列表行 / 位置确认 | 已观察事实 |
|---|---|---|
| 14:46:43 | 1 / 5 / 6 / 0 | 唯一当前注册为后台 PID2904558 的 6557194c；另外 5 行无当前注册 |
| 14:48:14（直接 SSH） | 4 / 8 / 未取列表 / 未合并 | 新 dev PID2625544、files PID2625639、main PID2625710 已出现；后者与后台 PID2904558 短暂注册同一 UUID6557194c |
| 14:50:38—14:50:43 | 4 / 9 / 6 / 2 | dev/files 位置已确认；新的 a98c69c4 PID2626765 首次为 instance_changed，slot=null；直接 observe 同意 4 注册 / 9 进程 |
| 14:51:42 | 4 / 9 / 6 / 2 | a98c69c4 的下一观察已核验身份/进程，仍缺 slot/pane；来源 observed、age_ms=2375 |
| 14:53:34（真实 Edge DOM） | 5 / 9 / 6 / 2 | 注册数再次变化；页面 dev/当前 files 两行位置确认，其余四行位置未知，0 pageerror、0消息请求 |

上述均为本轮实际采样。root 的独立 14:49:48 采样另在 `work/session-mapping-feedback-r3-root.json`，不是本 agent 的直接执行结果。本 agent 没有操作这些进程；启动/退出的行为主体与原因未查明。

### 最后完整 HTTP 采样（14:51:42UTC）

| UUID | PID / slot | 身份 / 进程 / 位置 | 当前原因与 provenance |
|---|---|---|---|
| 125d23ce-04a0-4f6f-a56a-cfb1dcba7260 | 2625544 / dev | verified / observed_running / terminal_3 | 1 当前注册、reason=[]；startticks=1330663983 |
| a4ce6556-3ada-4873-bf27-3235880d87f9 | 2625639 / files | verified / observed_running / terminal_4 | 1 当前注册、reason=[]；startticks=1330664206。旧同 UUID PID3524213 已不存在，新注册没有旧时间异常 |
| a98c69c4-d136-4301-82df-f6adafc93672 | 2626765 / null | verified / observed_running / unknown | `binding_unknown`；1 当前注册、唯一 transcript、实例稳定；允许环境为空，无 TWB_CWD_FILE；tty_nr=34819，父进程 sshd，不能由此猜 pane |
| 6557194c-f278-4d14-a5b5-82fe10a5020e | 2904558 / null | unknown / unknown / unknown | `identity_conflict`；1 当前注册，但显式 argv UUID 为 be09bcc4-50d5-422b-851a-7de48d5517e4；注册 UUID 与 transcript 元数据为 6557194c。不能自动选择 |
| 6ee281b5-e4f7-43ce-b1b7-92da287e5809 | 2023927 / 旧 files | unknown / unknown / unknown | `registration_missing`；provenance.registrations=[]；最后 SSH 确认该旧 PID 不存在。行中的 slot/cwd 是保留值 |
| b7ed3430-9064-4153-894d-d295a388a572 | 2059992 / 旧 main | unknown / unknown / unknown | 同上，旧 PID 不存在；不能继续当作当前 main |

最后 SSH 14:51:45 还确认旧 dev PID2033737、旧 a4ce PID3524213、旧 a98c PID2327469 和短暂 main PID2625710 均不存在。UUID 125d/a4ce/a98c 的新进程与旧实例不同；这解释第一次重新出现时的 `instance_changed`，该一轮拒配符合现有代码，后一轮重新验证不是本轮补修。

### 背景进程、覆盖与终端

14:48 的 proc 元数据中，PID2557440、2557458、2904531、2904540、2904558 均无三槽位环境；前四个 tty_nr=0。祖先关系包含 `2904531 → 2904540 → 2904558` 的 claude.exe 树；2904558 虽有 tty_nr=34821，仍没有 Workbench slot，不能等同于三个 SSH pane。其余没有 registry 的 Claude 进程只计入 process_count，不产生可证明的 UUID 行。这是覆盖边界，不能把进程数直接换算成会话数。

本机清单成功：terminal_2/main、terminal_3/dev、terminal_4/files 命令仍符合模板；terminal_15 的 terminal_command=null，不能参与 slot 关联。同编号 plugin_2 是插件，未被当作 terminal_2。清单存在 main pane 不证明当前 main 内有哪一个 Claude UUID。

本轮最后完整 HTTP 来源与 Zellij 都正常；“当前来源故障”不是这份样本的未映射原因。最初保留行含 `source_unavailable`，只能证明索引此前记下过该失败；本轮没有独立见到那个失败请求，不能重述为本轮 SSH 失败。

## E. 实际代码缺陷与前端混淆

**F1：当前原因数组携带历史失败，已复现。** [service.py:125](E:/project-funny/mianban-develop/session_panel/service.py:125) 在无候选时采用旧 row，[129](E:/project-funny/mianban-develop/session_panel/service.py:129) 复制其 reason_codes，[91](E:/project-funny/mianban-develop/session_panel/service.py:91) 再追加当前原因。[web/app.js:74](E:/project-funny/mianban-develop/web/app.js:74) 在来源当前 observed 时直接展示整数组，没有将其中历史原因标成“上次证据”。真实旧 main/files 行当前 reason=registration_missing，却同时保留 source_unavailable。

本轮纯元数据合成输入依次为“有效观察 → 来源失败 → 来源恢复但该 UUID 注册缺失”，实际输出为 top_status=observed、top_reason=null、row_reason=registration_missing、row_reason_codes=[binding_unknown, source_unavailable, registration_missing]，exit0。由此确认该混淆来自实际代码，不需要读取私人正文或再次制造真实断连。本报告不设计 patch。

**F2：标题和卡片层面的分类混淆，已观察。** 标题仅为 `record.slot || '未映射槽位'`（[app.js:47](E:/project-funny/mianban-develop/web/app.js:47)），不区分旧 slot 与当前 slot。真实 DOM 同时有两个 files：旧 6ee 全未知、当前 a4ce 三维已确认；旧 b7ed 仍叫 main；a98c 身份/进程已核验却也叫“未映射槽位”，与冲突 655 共用标题。列表不显示逐行原因，具体原因要到详情；实际选择又会读取消息。因此“好多未映射”不能直接归为后台全部绑定失败。

F2 是可核查的呈现事实/可理解性问题，不单独证明身份关联算法错误。当前保守拒绝 655 冲突、a98c 缺 slot、旧 main/files 缺注册均有依据；未观察到错绑或把 unknown 伪装成位置 confirmed。

## F. 已阅读文档及本轮退出/失败

已读全局 AGENTS、codebase-research、verification-before-completion；实际 source/service/remote_probe/terminal/gateway、web 三文件；本 feature 的 README、clarifications、lwplan、impl_report_r2、review_notes_impl_r2_1。唯一计划 hash 仍为 `38E3F991AA0BBF3434F2A9B7A2562EA0DBFE7520095C894003B4934018AB3074`；复审 hash 仍为 `00C46A9853384AD006383A215638ECE5815D1088CF1F94DCF12ECC538E37E5D7`。13 份实际输入 hash 已落证据。

本轮文件读取/rg、HTTP采样、两次自定义元数据 SSH、直接产品 observe、终端清单、合成 merge、Edge DOM、输入 hash 命令实际退出均为0；HTTP均200，自定义SSH均 exit0/stderr空。期间批读与整份 lwplan 输出发生截断，已逐份重读并定向补读缺失 S2 段；没有拿截断内容当完整证据。没有本轮产品测试失败；也没有运行消息、focus 或全量测试来声称整体可用。最终报告/JSON读回和结构验证另按交付时工具结果报告。

既有 r1/r2 竞态红控、测试/运行时/CLI/浏览器及研究失败继续保留在原报告；本轮局部观察不能覆盖它们。当前复审仍 USER_CONFIRMATION_NEEDED、业务结论为空，不宣称首批验收完成。

## G. 不确定点清单

- **U1**：14:46—14:53 实例/注册变化由谁触发、是否还会继续变化未知；需时间对应的正常运行反馈或后续受限元数据观察确认，不能归因本轮采集器。
- **U2**：655 registry UUID 与显式 argv UUID 的冲突成因未知；后台内部生命周期/恢复行为尚无证据，不能改写 registry 或猜身份。
- **U3**：a98c 新 PID 的实际本机 pane 未证明；其允许环境无 TWB_CWD_FILE，terminal_15 无启动命令。不以 cwd/tty 猜配；跨越这条事实缺口的能力属于下一步范围决策。
- **U4**：本机 main pane 还在，但旧 main PID 及短暂新 main PID 均消失；后续实际 UUID 与注册变化未稳定。当前只可说位置确认2，不保证3。
- **U5**：当前 Codex 三工具发现/真实调用及 Q6 客户端观察仍缺证据。像素/3D 新需求不关闭此点。

## H. 给 readiness reviewer 的最小可核查证据

1. JSON 的 `final_observation.http_snapshot`（14:51:42、age2375）与 `selected_process_probe`：逐 UUID/PID/slot/identity/process/binding/reason/provenance 和旧 PID 消失事实。
2. JSON 的 `prior_observations`、`direct_observe`、`terminal`、`frontend_metadata_observation`：注册从1→4→5、实例变化、严格三槽位与真实6卡呈现；不得合成成一个原子快照。
3. JSON 的 `synthetic_sticky_reason_reproduction` + service:91/125/129/140 与 web:74：F1 可核查复现；不是假想风险。
4. lwplan 的 G1/G2/G3 和独立状态契约；r2 review 的 USER_CONFIRMATION_NEEDED/Q6恢复规则。当前 F1 与 U1–U5须由 coordinator 按实际范围路由，不把本研究等同于 readiness PASS 或实施批准。

跨功能事实：无新增。英文提交消息建议：`docs: record live session mapping causes and stale reason evidence`（当前不执行 Git 操作）。
