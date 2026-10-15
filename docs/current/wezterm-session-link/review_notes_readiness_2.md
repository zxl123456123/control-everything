# Readiness 检查记录（第 2 轮：受控 delta）

**review_target**：readiness  
**评审时间**：2026-10-04（Asia/Shanghai）  
**评审结论**：PASS  
**前轮**：[review_notes_readiness_1.md](review_notes_readiness_1.md)，冻结不改写。

本轮仅核 LW 补事实事件及最新基线；结论允许继续唯一 LW，不代替 Gate-2、实现或真实验收。没有修改产品、前轮报告或 research，没有运行 GUI/attach/watch/focus/本地 HTTP/SSH。

## 输入文件

| 文件 | 当前 SHA-256 |
| --- | --- |
| README.md | DD520F3CDCC50BBE871E4AFB423D64B935552DBDB1064586AA8674D6341AA15C |
| clarifications.md | 4973A2AB297774E74E8C28D213526BB74C862CAE4F46F0057261881D88F1172C |
| research_code.md | 277CB3ABAF943323188B13F471E5DD2A2219618B76EFB5C0070F6AD2BC8BDD93 |
| research_attach.md | F4EC50D8645F75B1AFA4771C1B35047B84701DA4FDBD405683746C62D8DF501C |
| review_notes_readiness_1.md | A9AD9E9FF9DDFA5063FF71F61BB971B4A33B995862BBB74D7492B85AD0425C03 |

本轮完整阅读 README/clarifications，实际验证未变 research 和前轮报告 SHA，沿用前轮完整读取及技能合同，不无理由重复宽读。terminal.py/source.py/gateway.py 当前 SHA 与前轮已读实现相同；实际完整阅读 D: 旧 launcher，SHA `06AE379C8085A3AE03ED0DD0FD5D79DB062F12DF07BF8215AB81B5811627CD7C` 与 research 相同，未执行。

必要源码以固定 commit `efd8fd5a89a20c07a111d248ad7fce53848d2c18` 的 raw 物理行定向独立补读：

- [server/lib.rs](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/zellij-server/src/lib.rs)：1264—1286 将 AttachWatcherClient 转成 watcher 并通知 Screen。
- [screen.rs](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/zellij-server/src/screen.rs)：5212—5223 添加 watcher_clients；7390 起 get_layout_metadata，7419—7432 仅从 connected_clients 取当前交互客户端/pane。前轮已读 ListClientsMetadata 输出路由及 CLIENT_ID 分配，不把 web 内部标记当三列已有字段。

## 澄清与基线核验

### A. 澄清问题完整性

- ① 未回答 Q&A：为空。本 delta 是接口事实补充，没有新增用户决策。
- ② 漏记问题：未发现。第 10 节记录 LW 补事实事件；决策 6 已修正可观察范围和两个严格 profile。
- ③ 决策落盘：完整。目标与自动实施授权沿用；本轮不把只读旧 argv 匹配扩大成运行旧入口。

### B. 基线内部质量

- ④ 必填 1—10 章节存在且非空：PASS；内容与前轮同一基线，新增技术事件，不另立平行权威。
- ⑤ 目标锁可验证：PASS。G1 分离后台/GUI/交互 client/年龄；G2 保持无名 attach 与有限前后验；G3 动作前后唯一关联观察/实例/pane。三个目标文本未改写。
- ⑥ 反目标具体：PASS；禁止项的存在性核验如下。

| 禁止内容 | 本轮核查锚点 | 确认未引入 |
| --- | --- | --- |
| 运行旧 launcher、named/create/force 连接、补 tab、复活/创建远端 session | N1、决策 3/4/6；旧 profile 仅严格只读匹配；新启动仍无名 attach | 是 |
| 以旧 argv 的 create/force 标志作为新请求参数 | 决策 6“参数是只读历史事实”“不运行旧profile”；完整实读旧 cmd 第 15 行 | 是 |
| 改 source/reader/MCP/图形/CSP/5 与 30 秒，browser 传 argv | N2、决策 2、第 3 节固定输入/同源 CSRF | 是 |
| 自制 IPC/常驻监管、替换工具、一般后代树清理/server/SSH 回收 | N3、决策 5/7；cleanup_unverified 保留 | 是 |
| 不可观察 web/watch 标成零、CLIENT_ID 当 PID、精确握手、关闭旧批 | 决策 6、第 5/9/10 节与 README 独立旧状态 | 是 |

- ⑦ 风险责任边界：PASS。delta 不增加副作用授权；root 承接真实环境，作者仅本地自证，未知仍禁 focus。
- ⑧ 验证产物/主体/顺序：PASS。第 4/8 节作者→root→fresh reviewer，work 证据和正式报告目录保留。真实不可观察缺口不能被本 delta PASS 覆盖。

### C. 基线与澄清一致性

- ⑨ Q&A/决策与基线一致：PASS。

| 已回答条目 | 对应基线 | 一致性 |
| --- | --- | --- |
| 日常开发效率优先、3D 辅助理解 | G3、N2、第 7 节沿用对话与图形 | 一致 |
| 3D 主视图＋像素/文字回退 | N2；本 delta 未改变图形 | 一致 |
| 三项 WezTerm 联动范围后答“继续” | G1/G2/G3；决策 6 仅补状态观察事实 | 一致 |
| “自动实施代码即可现在” | 授权条目、第 8/10 节；不重问相同入口，仍保留 Gate | 一致 |

- ⑩ README→决策→基线溯源：PASS。

README“后台存活但窗口未连接、多客户端和过期映射”→ 已确认连接状态 → G1 与决策 6 的交互 client 观察范围。README“现有显式定位入口切到对应 SSH pane”→ 已确认 UUID 定位 → G3 当前唯一关联观察及严格 pane。README“不允许复活/重放/补建”→ 决策 3/4 排除旧启动动作、决策 6 仅只读识别真实旧 profile → N1 与 G2 无名 attach。README“固定工作台”和已授自动实施→ 决策 6 不扩来源/参数权限 → 第 3/8/10 节固定参数及受控技术补证。README 旧批独立待验→ 第 5/9 节冻结旧报告。

### D. 内部一致性

- ⑪ 目标锁与反目标：PASS。识别已存活旧 profile 是 G1 所需观察，不执行其有 create/force/EnsureTabs 的 launcher；新增连接仍用新无名 profile。观察能力和运行能力边界明确。
- ⑫ 风险边界与验证责任：PASS。严格 profile 不是独立归属证明，仍须全量相关进程、父子/时间、原 server、交互清单共同观察；缺失/未知不获得动作资格。回收仅本请求句柄和已核验 attach 客户端，不能因旧 profile 可见而终止它。

### E. research 对齐

- ⑬ 关键事实进入基线：PASS。无名 attach 非原子、无限等待、CLIENT_ID 非 PID、最早证据年龄、坏清单不等于零、锁与 owned 清理等前轮合同不变；新增“交互 web 含于三列、watcher 不含、无类型/PID字段”已明确可观察范围。原 research 未声称三列是所有客户端总数，故无需改写其事实记录。

整体结论：PASS；无 FAIL 项，无新增用户问题。

## delta 结论与剩余证据

本轮修正了原“额外 web/watch 均禁”的可观察前提，不把它解释成实现能证明全部 web/watch 数量为零。三列是交互客户端清单，watcher 不在该链；关联观察不等于 client-PID 握手。观察到额外 watcher/web/异主/未知进程时保守拒绝；无法获得类型时须明确信息缺口，不把隐藏 watcher 当作已排除。该口径与用户已授权的可逆固定工作台联动一致，可继续唯一 LW，无须新增风险批准或自制 IPC。

前轮 U 点处理保持：release 字节匹配已核；原子 pin/不可观察客户端边界没有消失；Windows 普查/严格 argv、状态年龄、总等待、动作锁、cleanup_unverified 与负例仍由 LW 定型。真实 GUI、同一原 server、唯一关联观察、UUID focus、重复连接不重复创建、失败回收仍须 root 承接及 fresh Review(Impl)，本轮未验。若后续具体计划用计数本身证明精确归属，或把旧 profile 变成执行入口，应在 Gate-2 拒绝，而非引用本报告放行。

## 缺失证据

不缺本 delta 继续规划所需事实。实际联动证据和唯一 LW 的具体接口/预算/解析/清理/测试锚点尚未交付；前轮后续责任不变。本次不声称产品测试通过或 GUI 已连接。

## contract drift / stale / mirror mismatch

- 前轮报告与 research 冻结 SHA 一致，不用旧基线 hash 冒充 delta 已验。
- README 已为 LWPlan；基线第 9 节“当前 ReadinessCheck”是前轮阶段描述留存，第 8 节仍要求本轮正式流程。root 后续状态维护宜同步该文字；未产生第二套功能边界或实施授权，不阻断此次仅继续 LW 的判断。
- 技能默认 STOP 与用户持续授权的优先级处理沿用 r1；此 delta 没有新权限，不能再次制造阶段批准冲突。

## 建议恢复动作

- 证据补强：LW 明确 list-clients 是交互清单的字段口径、严格两个只读 profile 与新请求启动 argv 分离，按 G/N 形成拒绝/年龄/并发/清理负例；root 实际验收不得把未知字段填零。
- 契约纠偏：后续同步基线第 9 节阶段文字；不改写 r1 报告、未变 research、旧机器人或父 Q6，不重问已有许可。

## 放行判断

- allow_enter_lwplan: yes（继续同一 lwplan.md）
- allow_enter_impl: no（仍须唯一 LW/Gate-1 与 fresh Gate-2）
- close_previous_robot_or_parent_Q6: no

## 本轮验证与异常记录

本轮已沿用读取过的 verification-before-completion Gate。当前输入完整读取与 SHA 命令 `1eea66` / exit0；旧 launcher 与关键产品 SHA `7fad78` / exit0；固定 raw screen 定向读取 `2db1a3` / exit0；raw lib watcher 分支 `0d94e2` / exit0。web find 对长 Rust 源码给出了宽泛而非所需位置，随后只读取固定 raw 精确范围，不据宽结果声称读到目标函数。未写任何其它文件。

README 保留 root 初验 53 项的一个额外字面标题断言失败、修正口径后 36 项 exit0，以及早先基线 collector 失败和最终 55 tests 字节完整输出；它们不是本 agent 运行结果，本 delta 不省略或改成新功能已验。r1 的 README 并发 hash/GBK 输出失败及随后 47 项 exit0也不删除。

最终自证以 UTF8 Python -B 只读当前输入/hash/报告必填章节与标记、三份已读产品和旧 launcher SHA；完整输出/exit 由本轮尾后工具记录回传 root。该检查仅证明产物与已评审输入一致，不证明业务联动成功。

本次实际 PowerShell here-string＋`.venv/Scripts/python.exe -X utf8 -B -c $deltaReadinessVerify`＋`exit $LASTEXITCODE`（无管道）在 `ac58aa` 输出 **49 checks / 0 failures / exit0**：五输入 SHA 与文内引用、十个非空基线章节、三十个报告必需标记、四个实际源码 SHA 全部 true，完整输出已读。此段追加前报告 SHA 为 `DCD166B852EEBD484DA078F5B1267C14E5D08881F9772D2F01E04E39385464B0`；追加后再次执行同一全量核验，最终 hash 以尾后工具输出为准。本 delta 无新增命令失败，前轮与 root 的失败已上述保留。

无新增跨功能事实。
