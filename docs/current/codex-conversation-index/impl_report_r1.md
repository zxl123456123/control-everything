# 本机 Codex 身份索引：Impl r1

feature_name=codex-conversation-index；impl_round=1；date=2026-10-04；lwplan_version=唯一 r2 最终 `3FEF4B9F10B1F5A222610C5151628E29668F16EA09E7A436F89F83878974AE94`。作者实际完整读最终计划、fresh Review(LW) r2 `7C289F0B5A13629238A6205061212BE9E699A81D19E8E17BA23C89A199082FBF`、root Gate2（30 项/0 失败），收到 root 明确 GO 后才改产品。持续自动实施授权没有被解释为复活终端、读正文或实时状态许可。

## 变更事实与目标对齐

| path | change_type | change_purpose / key_changes | related_tasks |
| --- | --- | --- | --- |
| session_panel/codex_index.py | 新增，74 行 | 固定 state_5 路径、mode=ro/query_only、只读事务内分区计数和显式六列12条分页、规范 UUID/类型/时间校验、固定失败与 close | S1/G1/G3/N1–N3 |
| session_panel/gateway.py | 增加14行 | guard 后独立 GET 和唯一 offset parser；坏参数不读库；503固定失效 | S1/G1/G3/N2–N3 |
| web/app.js | 增103删4行 | 独立 codexState、严格有效页/UUID string/namespace/count校验、请求开始计龄/迟到拒绝/失效清空、来源选择分派和旧epoch隔离；仅 view 合并 | S2/G2/G3/N1–N3 |
| web/index.html | 增9删1行 | 独立 Codex 身份panel/list/detail/分页，明确scope，footer区分身份与远端历史 | S2/G2/G3 |
| web/style.css | 增2行 | 独立panel、12卡片滚动与详情布局、窄屏单列，原空间/flow不改 | S2/G2 |
| tests/test_codex_index.py | 新增146行 | 人工临时DB的分页/覆盖/坏值/只读/不读额外列/一致快照/失败 | S1/S3/G1–G3 |
| tests/test_gateway.py | 增35行 | Mock直接handler的独立GET/参数/路径/POST/Host/Origin/client/异常拒绝 | S1/S3/G1/N2–N3 |

产品总增202删5，净增197行；测试额外181行。没有通用provider/class框架、依赖、配置、MCP或第二消息/focus实现。goal_lock_check=G1固定只读真实身份，G2独立选择未知活动，G3完整筛选集合12条分页均落实；anti_goal_touch_check=N1–N3保持。作者门复核18项全部true，gateway allowed/do_POST/reply/reject AST与 before相同；原 recordView/evidence-flow/renderSelection/readMessages/focusSession/connectWorkbench 函数段与before相同。新增SELECT不读title/正文/preview/auth，只PRAGMA列信息、COUNT、六列页面。

authoring_ergonomics_notes：固定plain reader、短函数/明确SQL与客户端小state，没有声明式配置或新抽象；字段范围由固定响应契约维护。root冻结的标题、420px空间、远端flow原文字节及样式保留。renderer/cockpit/harness不在本轮改动；源/service/terminal/workbench/native/MCP/D:和实际Codex库未触及。

DOM合同：`#codex-list button[data-session-key="codex:<UUID>"][data-thread-id="<UUID>"]`；`#codex-detail`只允许元数据；`#codex-status/#codex-coverage/#codex-notice/#codex-page-range`；分页`#codex-previous/#codex-next/#refresh-codex`。选Codex清远端epoch/selected/page/reading和消息DOM，禁用focus/刷新消息，保留真实 focusing/connecting pending；旧远端晚响应依既有epoch忽略。有效选回远端先清Codex选择再执行旧reader，不把命名键传去远端。

## 本轮自证及全部已见失败

owner=实施作者；impl-safe只人工临时库/Mock、AST/静态和Node syntax。没有运行真实DB、HTTP、browser、GUI、SSH、服务重载或平台动作。

- 首轮 `.venv/Scripts/python.exe -X utf8 -B work/verify-codex-index-impl-r1.py`，chunk `5d5855` exit1：15 tests，2 FAIL、9 ERROR；完整失败stdout/stderr存 `work/codex-index-impl-r1/command-1.json`。初次显示截断，随后 chunk `dbe8f4`完整补读stderr和exit。ERROR为fixture用了sqlite connection context却没有close，Windows TempDirectory清理WinError32；生产reader原本已finally.close，未据此改reader。另2fail由fixture Mock形参uri与调用uri=True重名引起TypeError，不是改生产schema或放宽readonly。
- 修fixture明确closing与清理前临时目标检查后，新 `command-1-recheck.json` exit1，15tests剩2FAIL/0ERROR（chunk `3dc971`完整已读）。局部trace首次从work启动缺repo sys.path，chunk `a9e3b1` exit1/ModuleNotFoundError；补路径后的trace chunk `0a9042` exit1完整显示2个Mock重复uri参数TypeError。上述诊断失败保留工具记录与该脚本，未把诊断失败改写成成功；随后只修fixture形参database_uri。
- 最终 `.venv/Scripts/python.exe -X utf8 -B work/verify-codex-index-impl-r1-final.py`，chunk `c81854` exit0，完整stdout/stderr已读：`.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_codex_index tests.test_gateway.GatewayDispatchTests -v` **15 tests/0FAIL/0ERROR**、1.510秒，包含临时DB并发写入后的只读快照一致性、explicit-column authorizer与写入拒绝、固定无创建缺库。证据 `command-1-final.json`；Node --check app exit0、stdout/stderr空，证据 `command-2-final.json`。
- root初读提醒RegExp会coerce数组UUID，作者同范围补`typeof thread_id==='string'`；之后执行 `.venv/Scripts/python.exe -X utf8 -B work/finalize-codex-index-impl-r1.py`，chunk `7ae13c` exit0，完整输出18项/0失败；最终app Node --check exit0/stdoutstderr空，Python AST全部解析，原before/权限/远端函数保护核验true。证据 `after-manifest.json.final_syntax`；没有修改producer权限来消除失败。

conclusion_if_missing=缺完整exit/stdout/stderr只能记实施，不能声称fixture或语法通过。本15项不是全Python/浏览器或实际接入结果；root本轮须独立跑。历史Win10053、控制socket os10050、WezTerm BLOCKED与既有游戏展示失败由root独立交付报告保全，本文没有宣称它们解决。

## 证据、最终字节与回滚

完整before=`work/codex-index-impl-r1/before/`，7项presence/hash=`before-manifest.json`；5既有文件与root冻结hash匹配，2新文件原不存在。完整合并差异=`implementation.patch`；7文件before/after/hash/增删和保护检查=`after-manifest.json`，均新建、未覆盖失败输出。

- reader SHA `DE3E7C0B4D4C39DEFAD46F089428522A097D9CD7F609280A75A372F758E0BACD`
- gateway SHA `EE42EB369F5BC47C3BCBB66F789F8FA12C67B82208E312273A1BF47144E85799`
- app SHA `CA7CB3389EA720D118F26ECF40E1B3057744BC61128A56C4A28E36EC95CF78C1`
- index SHA `D00B22ADFD2664A039321FE17093669D233F7DDDACF0149C0F9AD4356CE85714`
- style SHA `C2C0EDFA382E2CB7CD8E2B8A36F27D3B7261A0E2E1672019C0D5E9C0B4E5FBE2`
- test_codex SHA `18D33502F3B231EE88E6B3B220AD9092AC0542166DCA276CB3574563BEDA59FE`
- test_gateway SHA `FDF4BB482F3F53CEC154A70C8D2A8CAA87085BAF6E827E087B7870086E9BCFC0`

回滚信息=可直接回滚本作者7文件diff，新reader/test移除前核对owner；不覆盖root renderer/harness或其它修改，不更改真实库，无Git初始化/commit/push。建议提交消息：`feat(cockpit): index local Codex identities without reading conversations`。

## Coordinator 承接验证、缺口与风险

coordinator_handoff_verifications：root独立全Python、实际Edge旧/新fixture（分页25/同UUID来源/晚到epoch/格式失败/30秒请求年龄/像素3D选择/无Claude消息POST/窄屏）、只重载其owned网关后的固定本机DB六字段与GET计数对照、实际本线程key选中与当前IAB截图；fresh Review(Impl)最后审最终diff和失败。evidence_expected=`work/codex-index-root-live-r1.json`、root-browser/fixture完整逐条结果和exit、当前截图、freshreview；owner=root/freshreviewer；conclusion_if_missing=不能称本机接入、双源对话全部监测、实际UI/流畅度验收完成。

contract_drift_reports=无新增安全/业务scope；root初读的UUID数组coercion属于现有规范string实现修补，已留痕。未完成与风险：内部state_5/schema变更会明确不可用；source序列化非固定前缀计入other；每页独立快照会换序，不承诺跨页冻结；锁timeout仅SQLite预算；活动/完成始终unknown。当前不提供Codex正文/实时工作状态；旧真实WezTerm关联/focus/owned清理仍未验收。本地fixture没有访问真实`.codex`或生产8766。

无跨功能事实。
