# 会话关联首批实施后审查（Impl r1，第 1 次）

- review_target：impl
- impl_round：1
- review_seq：1
- review_date：2026-10-03
- reviewer：session_impl_review；未参与产品实施，不递归委派。
- 实施报告：[impl_report_r1.md](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/impl_report_r1.md)，SHA256 `030400B5E17A44649EDEE6D9DCE6561364BDDB1FCB0CE67341E45B525366EB51`。
- **协议结论：REVISE**
- **业务结论：IMPL_DEFECT**

独立审查重现 S2 锚定分页的版本检查竞态：请求携带旧 revision，文件在初次元数据检查后、reader 调用前变化，当前实现仍返回 `available=true` 和新 revision。现有 47 项测试没有覆盖此时点。此缺陷局限于已批准的 `read_messages` 和消息回归测试，无须改目标、计划、预算或回滚设计。当前 Codex 工具列表仍为空，客户端加载也未验收，因此本轮不能判整体 PASS，也不能把剩余事项写成“仅缺客户端确认”。

## 独立输入、版本与实际差异

收到 FINAL_ARTIFACT_READY 后，reviewer 完整读取最终 21 个产品文件、测试、实际项目配置、根 README、冻结实施报告与过滤后的外部证据；完整读取 root 最终自证 JSON/TXT、core 全量日志、surface 分页和独占端口红绿日志。没有只接受作者摘要。五份指定 skill 已完整读取；首次批读截断处逐份补读。审查只执行本地合成验证、语法/配置/hash 核对；没有执行真实 SSH、安装、私有正文读取、focus、客户端动作或产品修改。

| 权威输入 / 证据索引 | reviewer 本轮核对 SHA256 |
|---|---|
| lwplan.md | `38E3F991AA0BBF3434F2A9B7A2562EA0DBFE7520095C894003B4934018AB3074` |
| clarifications.md（Q1–Q5、完整基线 1–10） | `EB92133A3A26D70340EAEF7F5A0A954DC3ED1F78F4FACBA4EDA01FB7B84F5109` |
| review_notes_lwplan_2.md | `8FC0D0166D4EDC6B7A059953ABEFFDB8A880396EEBBDE5D56FCAC761E2C7A08D` |
| review_notes_lwplan_1.md（历史 Gate-2 FAIL） | `0DA2F9C85882AEB05FF0581F45DDB3E0C994C07D4F7718742A4183294CDAD2DD` |
| impl_report_r1.md | `030400B5E17A44649EDEE6D9DCE6561364BDDB1FCB0CE67341E45B525366EB51` |
| feature README（impl_reviewing 状态台账） | `E3DFF64238D026EB8B2ABC49045D9C2F5B8DF408315BD6093C4752FF8B6AA06A` |
| research_session_binding.md | `13BA22F8E07ED07DD25C18C894B1F0FDD382805B95795E5BA5955524122C240E` |
| research_session_interfaces.md | `13609324326548DC89F20323F8BB24B59714600A486438050D6614EEFB9C9787` |
| research_session_dependency_versions.md | `E09A9A214AC8978BD19583322C2DF76AB1FE89A3D384BE7F7E6A8186FB211877` |
| work/session-product-manifest-r1.json | `C6058D487BDFCB502A102A7A2A1AA7F27052FD78747A4AAF953A8F0576B6242F` |
| work/session-panel-external-r1.json | `639270F1E9C05529DD0840C0E537F1B9B39F4BF8BECA224CFFB34DE2A1991532` |
| work/session-panel-codex-r1.json | `CCC215A85D16FE94640DB4BCD1505881432AB56FFE53C31FEC70AC37DBACE893` |
| work/session-revision-race-r1-red.json（root 独立复现） | `A8AAE72973EFDCCC3628486AF7D03F47522143746D8A19D1493C51D5950564E8` |

实际 diff 等于初始仅 docs/work、非 Git 工作区新增的产品文件；没有初始化 Git、restore、commit 或 push。`.venv` 和运行时缓存不计产品 diff。独立 hash 命令 exit 0，`manifest_files=21; hash_mismatches=0`，manifest 合计 2006 行。逐文件的完整 hash 保存在 manifest，实际内容均已读：

| 新增文件 | 行数 | 计划任务 / 首个审查落点 |
|---|---:|---|
| .codex/config.toml | 5 | S4；root 承接，仅一个项目 server 表 |
| .codex/config.toml.example | 5 | S4；绝对 command/cwd、三工具白名单 |
| README.md | 60 | S4；两种 runtime、启动、状态、接入与撤销顺读 |
| requirements-reader.txt | 2 | S2；SDK 0.2.163 + MCP 1.26.0 |
| requirements.txt | 1 | S4；MCP 1.26.0 |
| session_panel/__init__.py | 5 | S1/S4；单一 Service 导出 |
| session_panel/gateway.py | 190 | S3；路由、Host/Origin/header/CSRF、Windows 独占 bind |
| session_panel/mcp_stdio.py | 83 | S4；三只读工具，固定 HTTP 薄转发 |
| session_panel/remote_probe.py | 323 | S1/S2；元数据与官方 reader，R1 落点 262–270 行 |
| session_panel/service.py | 238 | S1/S2/S3；单份索引、实例/失败/陈旧、消息串行 |
| session_panel/source.py | 46 | S1/S2；固定来源、UUID 与预算 |
| session_panel/terminal.py | 116 | S1/S3；完整命令匹配、fresh focus 与事后证据 |
| tests/__init__.py | 0 | S3/S4；测试包 |
| tests/test_focus.py | 99 | S3；mock argv、拒配、事后变化 |
| tests/test_gateway.py | 144 | S3；HTTP 契约与临时监听占用回归 |
| tests/test_mcp.py | 87 | S4；合成 stdio 协议与 HTTP 同源 |
| tests/test_messages.py | 206 | S2；scope/空结果/六字段/分页/变化/预算；缺 R1 时点 |
| tests/test_observation.py | 158 | S1；同 cwd UUID、冲突、实例、失败/陈旧 |
| web/app.js | 158 | S3；按需正文、分页、选择竞态、惰性 textContent |
| web/index.html | 45 | S3；会话列表、独立证据、消息与唯一定位按钮 |
| web/style.css | 35 | S3；窄屏、路径换行、键盘焦点 |

关键冻结 hash：remote_probe `7AD5CF1F95114D5F6FDF5A1488F3733EB58C8256885C8CB6D56A932558CD0565`；gateway `F613D30C9BADC94003C7AF8ACBA85B7B9D46155A7A37A1A263871339BC9A8E9D`；app.js `ACE9FF63F5A2A9CD2772B8AAF3C8B9BD84F6922B9B7DE20719997C3E76B68CAF`。后续修改使本轮源码审查版本失效。

## 必填结论字段

| 字段 | 结论 | 依据与限制 |
|---|---|---|
| goal_lock_alignment | aligned | UUID、单 Service、既有终端补绑的目标形态保持；R1 是已定义分页验收的局部实现缺陷，整体目标尚未验收成功 |
| anti_goals_touched | none | 禁止项逐条核对见下表 |
| authoring_ergonomics_check | pass | 固定 source、一个 Service、公开 reader 单入口、薄 HTTP/stdio，无通用插件/主机系统 |
| declaration_readability_check | pass | requirements 与五行项目表直接可读；README 顺读，两种 runtime 和客户端未加载边界明确 |
| plan_defect_checkpoint_recommended | no | 需求和计划已有明确版本不一致拒绝要求，无需问题重述 |
| plan_defect_checkpoint_reason | R1 可在当前 S2 实现点修补 | 未命中目标形态漂移、反目标或作者体验回退 |
| plan_defect_trigger_reason | N/A | 当前业务结论为 IMPL_DEFECT |
| impl_safe_validation_check | pass | 实施记录和 reviewer 独立 47 项本地自证存在；新增定向竞态测试 exit 1 必须修补，pass 不表示产品无缺陷 |
| coordinator_handoff_check | pass | 外部工作均有 owner 与过滤证据；Codex 客户端未验收明确保留，未伪装为 impl-safe 完成 |
| 基线与澄清一致性复核结果 | PASS | Q5 授权当前实施及外部范围；无新增未答决策或需求方向改变；R1 为实现偏差 |

## R1：[P2] 锚定消息页在 reader 前接受不同 revision

**位置**：[remote_probe.py:262](E:/project-funny/mianban-develop/session_panel/remote_probe.py:262)，`read_messages` 初次 metadata revision 检查与第 266 行 `before = revision_of(path)` 之间；测试应补在 [test_messages.py](E:/project-funny/mianban-develop/tests/test_messages.py)。

lwplan 第 137 行明确“后续页 revision 不一致 409，刷新尾页”；第 135–137 行要求读前 stat、一致性及变化处理。当前代码只在第 262 行将请求 revision 与早先 `transcript_metadata` 的 revision 比较。第 266 行重新取当前 revision，却没有将该值再与请求锚点比较。若文件在两者之间追加或替换，后续 reader 和读后 stat 可以对新版本完全一致，代码因此返回新版本 `available=true`，而非 `revision_mismatch`。HTTP 第 45 行原已能把该 reason 映射为 409，不需要改接口或页面。

正常运行中的 transcript 可以继续落盘，翻页时点不受用户控制。该问题使客户端以旧页 offset 翻到另一历史版本，破坏计划要求的分页一致性。现有 `test_revision_mismatch_no_reader_call` 仅覆盖请求进入时已经不匹配；`test_change_retries_once_and_repeated_change_fails` 仅覆盖 reader 执行期间变化，未覆盖两次检查之间。

### reviewer 本轮实跑复现

只使用现有测试的 TemporaryDirectory、真实临时文件 stat 和六字段 mock；在第三次 `revision_of`、即初次 metadata 检查完成后、reader 前追加四字节。没有真实环境、私人消息或产品文件修改。以下 Python 通过 PowerShell here-string 输入绝对 `.venv/Scripts/python.exe -`，随后 `exit $LASTEXITCODE`；命令末尾没有 tail 管道。

```python
from unittest.mock import patch
from tests.test_messages import MessageTests
from session_panel import remote_probe
case = MessageTests('test_tail_page_six_actual_fields_no_message_time')
case.setUp()
try:
    old_revision = remote_probe.revision_of(case.path)
    original_revision = remote_probe.revision_of
    calls = [0]
    def revision_with_change(path):
        calls[0] += 1
        if calls[0] == 3:
            with case.path.open('a', encoding='utf-8') as stream:
                stream.write('\n{}')
        return original_revision(path)
    with patch.object(remote_probe, 'revision_of', side_effect=revision_with_change):
        result = case.read(offset=0, limit=20, revision=old_revision)
    print({'scope':'temporary synthetic file, no external or private content',
           'available':result.get('available'), 'reason':result.get('reason'),
           'requested_revision':old_revision, 'returned_revision':result.get('revision'),
           'reader_calls':case.reader.call_count})
    assert result.get('available') is False and result.get('reason') == 'revision_mismatch', \
        'Anchored page accepted a different revision after initial metadata check'
finally:
    case.tearDown()
```

完整输出与实际退出结果：

```text
{'scope': 'temporary synthetic file, no external or private content', 'available': True, 'reason': None, 'requested_revision': '747671447555746353:21392098231284441:89:1791023118055788500', 'returned_revision': '747671447555746353:21392098231284441:93:1791023118074977400', 'reader_calls': 1}
Traceback (most recent call last):
  File "<stdin>", line 19, in <module>
AssertionError: Anchored page accepted a different revision after initial metadata check
exit_code=1
```

root 收到事实后独立运行 [verify-session-revision-race-r1.py](E:/project-funny/mianban-develop/work/verify-session-revision-race-r1.py)，实际 exit 1；reviewer 随后完整读取脚本及 [red 证据](E:/project-funny/mianban-develop/work/session-revision-race-r1-red.json)。root 同样取得 size 89→93、`available=true`、`reason=null`、reader_calls=1，三个断言失败，且记录 product hash 与冻结版本相同。此证据是新增的当前实现失败，不能被 root 原总账 `failures_in_current_final_assertions=0` 或 47 项绿测试覆盖。

### IMPL_DEFECT 三条件及补实施任务

| 条件 | 独立判断 |
|---|---|
| 局部 | 修补限 `remote_probe.py::read_messages` 的当前 revision 比较及 `tests/test_messages.py`，均是原 S2 锚点；不改阶段目标或消息链 |
| 低风险 | 请求提供 revision 时，在实际读前当前 stat 与其不一致就拒绝；保留既有 HTTP 409、默认尾页的一次重试、scope/预算/空结果/六字段，不新增跨模块调整 |
| 无新决策 | lwplan 已明确后续页不一致拒绝；不改变任务结构、验收定义、运行环境或回滚设计，不需要用户新增选择 |

可直接给原实施者的补实施边界：

1. 在进入 reader 的每次尝试中，把本次 `before` 与显式请求 revision 比较，不匹配直接 `available=false/reason=revision_mismatch`；该拒绝必须发生在 reader 调用前。默认尾页 `revision=None` 的当前重试语义保留。
2. 增加此精确时点的临时文件回归，断言 unavailable、`revision_mismatch`、reader 未调用；保留既有初始不匹配、reader 期间变化、非锚定一次重试和严格六字段测试。不能只放宽断言或把返回的新 revision 当成功。
3. 新一轮 Impl(r2) 保留 r1 报告与本报告，落 `impl_report_r2.md`，保存红→绿及全量真实退出/完整输出。coordinator 独立复跑 root 复现和所需本地检查，再由未参与实施的 fresh reviewer 审最终 diff。
4. 若补修引入计划/预算/reader 路线或回滚变化，应停止此局部路径并回到正式 PLAN_DEFECT 分流；不得扩展本任务。

## 目标、反目标与作者体验复核

| 目标锁 | 实际代码 / 证据 | 判断 |
|---|---|---|
| G1：真实 ID，同 cwd 分开，三类证据分离 | service 第 123–165 行按 UUID 合并；remote 第 115–179 行实例/注册/transcript；真实 observation 同 cwd Main/Files UUID 不同 | 目标形态 aligned；真实三槽位覆盖只是测试时点，非全主机会话总数 |
| G2：页面与 Codex 单索引，按 ID 消息、来源/时间/unknown | gateway 一个 SessionService；stdio 固定 HTTP 三查询；service 最早单调时钟/失败/30秒陈旧；remote 六字段 | 共源有真实 stdio/HTTP证据；R1 分页验收失败；当前 Codex 尚未加载，目标整体未满足 |
| G3：保留既有终端，fresh 唯一补绑/定位 | terminal 第 79–110 行 fresh、同实例、完整 slot/pane、age、提交前 inventory、事后唯一 client；真实 UI focus 后回 Files | 既有会话补绑与 focus 有对应时点证据；不承诺原子绑定或桌面前台激活 |

| 禁止内容 | reviewer 可核查证据 | 结论（impl 未踩中） |
|---|---|---|
| 3D/Jev/C4D/全资源监控/多 Agent/新增主机系统 | 21 文件全文 + 本轮 rg；source 固定单来源；产品入口只有观察、消息和 focus | 确认不存在；README 的 Jev/Hooks 是禁止说明 |
| 发送消息、输入注入、代审批、resume/重启/终止 Claude | remote 只有 `claude --version` 与公开 reader；terminal 只有 list 与 focus-pane-id；MCP 恰三查询 | 确认不存在；`send_header` 为 HTTP 协议，JS query 为 fetch 包装，非模型 query/消息发送 |
| cwd/title/mtime/静态布局冒充 UUID/任务完成 | service 主键 UUID、instance_key 与 unknown；mtime 只进入 message revision；activity/task_completion 始终 unknown | 确认不存在；R1 是 revision 拒绝遗漏，没有改用 mtime 作身份 |
| 默认汇总全体私人正文、第二父链 parser、模型外发 | 列表只输出元数据；选中 UUID 才进 reader；remote 使用公开 get_session_messages；web 仅同源 fetch | 确认不存在；metadata 只提取顶层 sessionId/cwd，不是正文链解析器 |
| 私有正文/token 持久化或加载消息 HTML/附件 | gateway 禁请求日志/no-store/CSP；service 不存正文；web textContent、无 localStorage/indexedDB；过滤证据及元数据截图 | 确认产品不存在；合成验证脚本保存的是 fixture 断言，非私人正文 |
| 改 Workbench/Nova/系统 CLI/PATH/Claude 设置/Hooks、自动启动 | 实际 diff 完全在本工作区；root 专属两个 runtime/一个项目表；无启动器/EnsureTabs调用 | 本批产品确认未引入；外部配置归属由 coordinator 承接记录，不宣称全机器审计 |
| 源码/配置/stdio 成功冒称当前 Codex 接入 | 根 README 46/58 行、impl 报告、codex JSON loaded=false/tools=[]/trust=false | 确认没有冒称；当前客户端仍未验收 |

作者体验与声明可读性没有显著回退：一个 source、一个 Service、官方 reader、薄两层协议，使后续作者能直接顺读主链；没有数据库、插件/主机抽象或重复索引。中文原因、UUID、读取时点和原生控件可辨认。reviewer 检查保存的 1280/360px 元数据截图，没有私人正文，布局与所读 CSS/HTML 一致；截图不证明真实消息链或定位。

## 基线一致性与设计味道

**基线与澄清一致性复核结果：PASS**。当前首批“未回答”列表为空；Q5原话`a`授权当前具体实施与外部动作，Q1/Q2/Q3的开发效率、首批会话关联及其它模块另批的边界保持。没有目标形态漂移、反目标命中或头脑风暴决策违反；R1是已定义分页行为的局部实现偏差，不要求改变基线。历史第二轮Gate-2 PASS和首轮FAIL保持，仅覆盖各自计划时点，不在Review(Impl)重建规划门禁或扩大为产品通过。

**设计味道扫描结果：FAIL: R1 检查与使用分离遗漏**。已承诺锚点一致性，但reader前的新stat没有再次比对；属于局部IMPL_DEFECT，没有发现双索引、泛化主机/插件框架、自制消息链或整体设计方向缺陷。目标形态、作者体验和声明可读性判据见前文，不能用其它维度通过覆盖此失败。

## 实跑验证、责任与证据不足约束

reviewer 本轮独立执行并读完整输出、退出码：

| 验证命令 / 步骤 | 实际结果 | owner / 证据 | 缺证据时的结论 |
|---|---|---|---|
| `.venv/Scripts/python.exe -m unittest discover -s tests -v` | exit 0；47 tests，0 failures，0 skips；8.731s | reviewer 本轮工具完整两块输出；root/core/surface 对应完整日志另已读 | 既有本地逻辑未自证；不等于 SDK/客户端真实验收 |
| `.venv/Scripts/python.exe -m compileall session_panel` | exit 0；完整输出 `Listing 'session_panel'...` | reviewer 本轮工具 | Python 语法未验证 |
| `C:/nvm4w/nodejs/node.exe --check web/app.js` | exit 0；stdout/stderr 空 | reviewer 本轮工具 | JS 语法未验证 |
| Node 加载 `work/verify-ui-r1.cjs`，将 `fs.writeFileSync` 设为 no-op 以不覆写冻结 evidence | exit 0；15 checks，0 failures，private_content_used=false/real_ui_verified=false | reviewer 本轮完整输出；合成 DOM 断言保持原样，只禁证据写入 | 合成 UI 未自证，不能证明真实 Edge |
| tomllib 解析 actual/example 并比较三工具 | exit 0；两表相同，恰三工具 | reviewer 本轮工具 | 配置语法未自证，不等于加载 |
| 21 文件 SHA 与 manifest 比对、权威输入 SHA、禁止项 rg | exit 0；0 hash mismatches；实际 rg 输出逐项读 | reviewer 本轮工具；manifest | 未能确认所审版本与实际 diff |
| R1 定向临时文件复现 | **exit 1；返回新 revision 仍 available=true** | reviewer 上述完整输出；root 独立 red JSON/脚本 | 无法证明该特定竞态；当前已有确定证据，必须修补 |

本机消息测试是六字段 mock，外国 cwd 存在性在 Windows shim；文件/stat/大小预算是实际临时文件。临时 loopback 与 mock focus 不是生产网关或真实终端。`IncompleteFieldDefinitionWarning` 与 protocol stderr 在 reviewer 本轮同样出现且已读，未隐藏。

| 外部能力 | coordinator 证据与已读结果 | owner | 缺证据/限制 |
|---|---|---|---|
| 固定来源实际观察、已有会话补绑 | observation-r1.json：09:33:43UTC，2.719s，6 注册/11进程/3 confirmed；Main/Files同 cwd 不同 UUID；其它冲突/时间异常 unknown | coordinator | 只覆盖固定 source/config/registry 与时点，不是全服务器总数 |
| 两种隔离 runtime | local-runtime-r1.json 安装 exit0/MCP1.26.0/API；runtime-setup-r1.json attempt2 exit0/SDK0.2.163/MCP1.26.0/公开 signature/解析版本 | coordinator | 安装和依赖记录不证明消息链或 Codex 已加载；首次超时失败保留 |
| 真实 Linux 公开 SDK、合成链/空结果/六字段 | sdk-synthetic-r1-rerun.json exit0/13 checks/0 failures，stdout/stderr完整已读 | coordinator | 合成 temporary fixture 不是真实历史；首跑 exit1/2失败为错误预期，保留并对照官方行为 |
| 两个已选真实 UUID 的消息页 | messages-r1.json：两 ID available，尾页/前页各2条、严格六字段、各自 same revision、reader0.2.163 | coordinator | 只读计数/ID/revision/字段，没有正文；通过所测时点不覆盖 R1 竞态 |
| 实际 Edge | ui-real-r1.json：1280/360px、键盘、两 UUID 默认20、无 pageerror、元数据轮询不额外读正文；元数据截图已目检 | coordinator | 真实消息只在已选 IDs 读取；截图没有正文 |
| Edge 内合成 45 条 / 错误 / HTML | ui-pagination-r1.json：25→5→0(5条)→5，scope错误保留上次页/禁分页，惰性文字、无附件加载 | coordinator | 实际浏览器中的合成消息 route，不是改真实 transcript 或真实分页竞态 |
| 失败、恢复、31秒陈旧 | recovery-r1.json：isolated Service、新增受控 SSH probe；failed unknown保留 last_success，恢复三槽位，age33233ms全unknown | coordinator | 没有断开真实服务器/用户SSH；expected_injected_ssh_exit=255 是预期值，不是捕获实际 exit；无真实网络断服验收声明 |
| 已有 pane 的真实 focus | focus-r1.json：Main→terminal_2、Files→terminal_4；HTTP200/actionexit0，唯一 client1，恢复原 Files | coordinator | 只覆盖该时点的 Zellij 焦点；无输入/桌面前台激活；双侧非原子限制保留 |
| 最终8766占用拒绝 | port-r1.json：第二启动实际exit1/0.282s/原health正常；process-exclusive记录最终 gateway hash与归属 | coordinator | 子exit1为预期拒占用，不能与早期timeout/编码失败混同；不宣称任意平台均验证 |
| 最新真实 stdio 与 HTTP 共源 | mcp-protocol-r1-final.json：10:09:24UTC恰三readonly、same observation_revision、两ID消息 items/revision 相同、六字段；stderr完整已读 | coordinator | 是实际最终网关 stdio，不是当前 Codex 聊天实际工具 |
| 当前 Codex 项目工具 | codex-r1.json：actual tools=[]、chat_loaded=false、project_trust_verified=false；project-config记录初始不存在仅新增本表/global未改 | coordinator / 用户正常客户端动作 | **未验收**；配置、TOML、旧CLI或独立stdio均不能补齐 |

外部表引用均在 `E:/project-funny/mianban-develop/work/`，总索引为 session-panel-external-r1.json。reviewer 读取过滤产物而没有再执行外部动作。某些过滤 UI/观察记录没有独立进程 exit 字段，其断言/结果与命令退出只能按 root 对应记录的证据层级引用，不能伪称 reviewer 复跑外部命令。

## 当前客户端缺证据与协议选择

本轮存在确定 R1，因此不是“仅缺低风险可观察确认”的状态，不能输出 USER_CONFIRMATION_NEEDED。也无需因尚缺客户端而掩盖可直接收敛的局部实现失败为 BLOCKED。先按 REVISE/IMPL_DEFECT 修补，再由新一轮 fresh review 判断剩余缺口。

后续客户端证据要求仍是原 S4：由用户控制正常客户端重载；实际发现 `list_sessions`、`get_session_status`、`get_session_messages`，由 coordinator 通过该客户端对 Main `b7ed3430-9064-4153-894d-d295a388a572` 与 Files `6ee281b5-e4f7-43ce-b1b7-92da287e5809` 实际查询，保存加载来源/UUID/available/reason/字段/reader/revision与网页核对，禁止落正文。用户观察工具名称属于纯观察；不得要求用户代判消息正确性、安全性或通过修改全局配置/新增信任决策来替代验收。若后续只剩可观察工具加载且满足 skill 四条件，可给明确 USER_CONFIRMATION_NEEDED 并恢复 reviewer；若正常客户端无法加载、还需未授权权限/信任决定或专业判断，应保持 BLOCKED/受控澄清，不能冒称已接入。

## 全部已见失败与保留责任

已修复失败并非当前零失败的同义词，以下记录继续保留：

- **本 reviewer 新失败**：R1 实跑 exit1；root 独立三断言红 exit1。原 47 项绿测试没有此覆盖。报告结构核验首跑exit1/1failure，因检查脚本误要求并非合同必填的英文`body`字面量，正文已写隐私边界；随后按实际中文“禁止落正文”核对，保留失败而不把它当产品测试。首次批量 skill/基线/代码输出被外围截断处已补读；读取单行 requirements 的 PowerShell 标量索引仅显示首字符，随后 Raw 完整读取 `mcp==1.26.0`，未误判文件内容或据截断推进。
- **surface fixture 失败**：mock 方法 `run` 覆盖 TestCase.run 导致 AttributeError/exit1；随后计数/after_panes未隔离 exit1/1failure；只修测试隔离后21/46/最终47绿。分包报告/最终实施报告保留此过程。
- **UI 分页真实缺陷**：旧45条首页重叠；VM仅在内存恢复旧表达式 red exit1，修后 Node15/46和最终47绿；实际 Edge 合成边界证据保留。此修复不覆盖新的 R1 reader revision 竞态。
- **Windows 端口真实缺陷**：root 首个occupied8766 probe wrapper exit1，5秒超时且GBK/UTF8解码失败，未捕获子完成exit；其 JSON明确 null。临时 own listener 的重复bind red exit1/1failure，独占选项修复后 targeted0/full47/compile0；最终第二启动exit1为预期，原health正常。不能把早期46/health覆盖失败。
- **远端 runtime 首次失败**：420秒 wrapper timeout exit1，0 wheel/未建venv；核对本批孤儿PID/startticks后仅清理本批 downloader exit0；SHA/SCP后attempt2安装/API exit0。first-failure/setup分别保留。
- **Linux SDK 合成首跑**：exit1/2failures；误期望 meta descendant 下 selected为主leaf，固定官方SDK实际选abandoned，产品跟随官方；改fixture预期并新增对照后13项0，未造第二消息链。
- **旧 CLI 两次失败**：0.118.0 inspect均exit1，既有全局ultra/default不被接受；config-list与-retry完整stderr已读，global未改、未升级CLI。该失败不证明当前Desktop已加载或必然不可加载。
- **网关重启守卫**：PowerShell日期重解析丢时区，exit1在mutation前拒绝；依赖读取未生成final记录再exit1；随后raw UTC + argv/exe/PID/创建时点核对才操作自身网关。final/exclusive两个归属记录保留，未动Claude/他人终端。
- **路径/读取/编码失败**：root误读非.system openai-docs路径exit1；初始8766无监听查询exit1不是服务失败；surface误读不存在control_center.py exit1再rg到实际路径；owner猜错retry-env/尚未生成codex记录读取失败，后续语句曾遮蔽exit，随后严格模式重读；root提前猜独占日志名读取exit1，后rg/作者实际路径恢复；open_in_codex queued只代表排队。各分包/notes/master保留。
- **第三方警告**：MCP Pydantic lifespan forward reference警告在root、分包、reviewer本轮stderr均存在；当前协议断言通过，未抑制或承诺未来依赖兼容。
- **历史规划/研究失败**：首轮Gate-2 FAIL及原报告hash保持；Gate-1首跑90项/34项各exit1/1failure、第二轮review报告锚词漏记exit1/1failure与恢复；root diff编码/截断、技能/vendor输出截断、错误JSON字段/命令语法与退出遮蔽，均保留。非Git真实exit128、PermissionError、agents漏Files/后台UUID和时间冲突、错误Zellij get-pane/focus-pane/list-clients --json exit2、GitHub限流/tree Internal Error/HTML超限、正则过长、缺路径/空rg/graph工具不可用、8765拒绝连接、默认Playwright浏览器缺失exit1、Maxon抓取超时仍见原报告与研究。不改写成当前产品全部成功，也不要求跨范围修复。

## contract drift / stale / mirror mismatch

1. 已知共享 `development-workflow` 里程碑表将 Review(LW) PASS映射为进入Impl，与 `coordinator`明确 STOP_BEFORE_IMPL停机条款冲突。当前实际执行Q5手动确认后才实施，继续采用明确停机合同；已上报root，本 reviewer 不修改共享skill或扩审所有镜像。
2. 固定 lwplan 的“尚未实施/Q4未授权”及 clarifications 第9节研究阶段文字属于早期状态；Q5明确补充授权，feature README/current impl_report承接当前阶段。它们不否认有效Q5，也不能当作新路线或删除历史文本的理由。reviewer显式记录此时点陈旧，不私改权威基线。
3. root 外部总账生成时的“sole_remaining_client_check”与“failures_in_current_final_assertions=0”已被本轮R1新事实更新；该字段只覆盖原断言时点，不是不可变产品结论。coordinator须在新轮台账增加R1，保留旧总账作为历史，不能继续称“仅缺客户端”。
4. 没有发现本批同源查询或scope/六字段契约的mirror分叉；未审计全部平台镜像，因此不作全局一致保证。

## 放行与后续动作

双结论合法组合为 **REVISE → IMPL_DEFECT**。R1已同时满足局部、低风险、无新决策；无 PROBLEM_DEFECT 或需要改写目标约束的 PLAN_DEFECT。coordinator可按上面四项任务进入 `impl_remediating` 的下一轮局部补实施，无需为确定的现有S2行为向用户重新征求范围批准。

本轮不允许进入 Archive/PR，不把已有外部通过时点或源码冻结称整体可用。r1全部产物和失败保留；补修后新报告、root独立验证、fresh最终差异审查仍为必需。当前客户端加载/信任状态和两个真实UUID的实际Codex调用仍需独立承接；不静默重启当前app/chat。

本报告交付前，reviewer将实际读取全文核对双结论、Review(Impl)最小字段、R1/三条件/证据责任/失败/当前客户端边界及固定输入/产品hash；工具实际退出和完整结果交回root。此文档核验不能替代R1修复或业务验收。

英文提交消息建议：`fix: reject changed revisions before reading anchored session pages`。当前非Git，不提交/推送。

跨功能事实：无新增。
