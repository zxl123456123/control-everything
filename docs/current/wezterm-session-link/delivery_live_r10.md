# R10：当前会话监测与定位验收

2026-10-05。当前版本已有下列有限实测；整批交付判断见文末独立审查结论。
由 root 根据本轮实际执行、当前字节核对与独立审查核实发布；原始草稿原样保留。

## 现在能看到和操作什么

- 新 Codex `01a10809-706b-78e3-b279-c3611cf75be0` 已进入真实身份索引；归档/恢复记录保留。
- WezTerm 对应的新 Claude 为 `0990a0a5-a375-4bef-85ef-0ae23ee5ad74`，实际关联 `terminal_3`。
- 两个身份各有实际 WebGL 机器人及独立工位，同页三次数据刷新保持各自 mesh、slot 和 home。
- 点选 Codex 显示身份元数据；点选固定 Claude UUID 只读取其两条授权测试历史，切回 Codex 清空远端正文。
- 两条历史分别为 user/assistant，assistant 精确 marker 为 `PANEL_LIVE_WEZ_R8_READY`，没有混入旧会话正文。
- 可见页面三次实际定位均确认 `terminal_3`，另有独立客户端记录核对，不只依赖页面提示。

![当前可见工作台](E:/project-funny/mianban-develop/work/live-session-cockpit-delivery-r10.jpg)

当前截图为 13 个角色（12 Codex＋1远端）；页面集合与后续采集范围仍可能变化。

## 本轮验证与对应证据

| 已验证内容 | 实际结果与范围 |
| --- | --- |
| [当前全回归](E:/project-funny/mianban-develop/work/live-session-root-tests-h1-1.json) | 175项、exit0、OK，测试前后源码/测试字节稳定；两个 Pydantic lifespan 警告仍在。 |
| [H1独立审查](E:/project-funny/mianban-develop/work/gateway-rejection-h1-review.md) | PASS，仅针对可靠小请求体的早期拒绝响应，不代表一般网络稳定性。 |
| [原三症状](E:/project-funny/mianban-develop/work/gateway-rejection-h1-symptom-green-root-1.json)／[原策略69次](E:/project-funny/mianban-develop/work/gateway-rejection-h1-after.json) | 原20ms延迟体三分支及69/69均原403／csrf_rejected、Service调用0、fixture已清理，exit0。 |
| [实际网关加载](E:/project-funny/mianban-develop/work/live-session-gateway-reload-h1.json) | root精确自有 launcher26552／listener14488、health已记录，exit0；未操作终端或清 latch。 |
| [正常轮询API三轮](E:/project-funny/mianban-develop/work/live-session-capabilities-r10-1.json) | 三次 connect 均不launch；三次 focus confirmed，独立唯一client1均在terminal_3；33项、22请求、exit0。 |
| [五起点15次定位](E:/project-funny/mianban-develop/work/live-session-focus-stress-r10-1.json)／[原始时钟核对](E:/project-funny/mianban-develop/work/live-session-focus-audit-r10-1.json) | 15/15 confirmed，212项全true、exit0；保留完整final、实例/关联/库存指纹和子调用退出码。 |
| [当前原生浏览器](E:/project-funny/mianban-develop/work/live-session-robot-browser-r10-2026-10-04T23-33-35-988Z.json)／[截图](E:/project-funny/mianban-develop/work/live-session-robot-browser-r10-2026-10-04T23-33-35-988Z.png) | 22/22、8资源匹配、26 GET、无错误；各身份一次mesh、三刷新、真实射线选择及正文隔离，浏览器已关闭。 |
| [最终字节与证据核对](E:/project-funny/mianban-develop/work/live-session-final-audit-r10-1.json) | root独立59项全true、exit0，绑定本轮保存记录与当前复合版本。 |

本轮 R10 产品增量为零，使用 R9 四文件与独立 H1 两文件的复合版本。
[唯一计划§13](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/lwplan.md)、[澄清§17](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/clarifications.md)、
[fresh计划审查](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/review_notes_lwplan_r10_1.md)、[root Gate2](E:/project-funny/mianban-develop/work/wezterm-integration-r10-gate2.json)及[明确准入](E:/project-funny/mianban-develop/work/wezterm-integration-r10-release.json)均已有记录；准入不替代交付审查。

## 操作与时钟边界

API共六个POST：每轮connect和focus各一次，没有动作重发。
七个ready样本中首个 `terminal_action_busy` 仍是负样本；250ms后仅GET补读一次取得新资格。
[首审计红](E:/project-funny/mianban-develop/work/live-session-capabilities-audit-r10-1.json)是hash大小写比较误判；仅纠正checker后[复核28项全true](E:/project-funny/mianban-develop/work/live-session-capabilities-audit-r10-recheck1.json)，没有重跑API。
15轮最早累计远端年龄2187–4077ms、原动作时间1250–3313ms，都在原5000ms内；完整final和守卫未省略。
API第三轮focus总请求6516ms，不能把总请求延迟当原两个时钟，也不承诺请求总耗时小于5秒。
ready读取与POST并非原子操作，后续仍可能忙而拒绝；这三轮只证明当前有限窗口。
原生射线测试为重复取点暂停了动画，属于功能验收，不作为性能样本；同页刷新也不证明跨浏览器工位持久化。

## 真实可见页面路径

三次IAB均visible、free=true、paused=false，正常10秒轮询持续，刷新后等按钮可用再按准确UUID单次点击。
第一次误按AX的checkbox映射查找，no_matches／timeout且没有click；读DOM改为实际button后才执行三次有效路径，这是定位测试元素的修正。
独立CLI记录05f3ce／827d7d／e75a61均exit0、client1terminal3；本稿未重跑这些命令。
[第1次页面](E:/project-funny/mianban-develop/work/live-session-ui-focus-r10-1.json)／[准备](E:/project-funny/mianban-develop/work/live-session-ui-prepare-r10-1.json)／[客户端](E:/project-funny/mianban-develop/work/live-session-ui-clients-r10-1.json)／[截图](E:/project-funny/mianban-develop/work/live-session-ui-focus-r10-1.png)。
[第2次页面](E:/project-funny/mianban-develop/work/live-session-ui-focus-r10-2.json)／[准备](E:/project-funny/mianban-develop/work/live-session-ui-prepare-r10-2.json)／[客户端](E:/project-funny/mianban-develop/work/live-session-ui-clients-r10-2.json)／[截图](E:/project-funny/mianban-develop/work/live-session-ui-focus-r10-2.png)。
[第3次页面](E:/project-funny/mianban-develop/work/live-session-ui-focus-r10-3.json)／[准备](E:/project-funny/mianban-develop/work/live-session-ui-prepare-r10-3.json)／[客户端](E:/project-funny/mianban-develop/work/live-session-ui-clients-r10-3.json)／[截图](E:/project-funny/mianban-develop/work/live-session-ui-focus-r10-3.png)。
root保持可见工作台打开；上述成功notice与历史消息不等于实时任务完成。

## 历史失败继续保留

[原始证据账本](E:/project-funny/mianban-develop/work/live-session-stability-delivery-r10-draft.md)原样保留全部旧红和原始链接，不把旧报告事后改为PASS：
[R9 REVISE／PLAN_DEFECT](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/review_notes_impl_r9_1.md)、[167项首红](E:/project-funny/mianban-develop/work/live-session-root-tests-r9-1.json)、
[235ms unknown](E:/project-funny/mianban-develop/work/live-session-capabilities-r9-1.json)及[第三轮409 busy](E:/project-funny/mianban-develop/work/live-session-capabilities-r9-trace-1.json)仍是失败；unknown根因未证。
[原69中11个Win10053](E:/project-funny/mianban-develop/work/live-session-gateway-rejection-diagnostic-r8.json)、[H1隔离3ERROR](E:/project-funny/mianban-develop/work/gateway-rejection-h1-symptom-red-1.json)、[H1产品3ERROR](E:/project-funny/mianban-develop/work/gateway-rejection-h1-product-red-1.json)均未覆盖。
[R8三个late](E:/project-funny/mianban-develop/work/live-session-focus-stress-r8-1.json)、[R6失败与空stdout](E:/project-funny/mianban-develop/work/live-session-native-main-stress-r6-before.json)、[Git128](E:/project-funny/mianban-develop/work/live-session-git-state-r8.json)和两Pydantic警告继续保留。
其它首启动marker误判、Gate2／cycle诊断红、首161 HTTP失败及同字节后绿、H1 owner审计误判见账本及[本轮实施记录](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/impl_report_r10.md)。
工具错误与产品失败分别记录：AX误定位、错误路径／未生成文件检查、读取截断和容量拒绝不算产品验证。
175重读80df05误含base64导致截断，a10576定向补读退出码／hash／全部警告；本稿聚合输出也已定向补读，未称截断输出为完整raw。

## 尚未证明的能力

Codex仍metadata-only，没有正文／实时活动接入；activity／task_completion未知，动画、粒子和关系链不代表真实合作。
远端仅覆盖授权来源 `ubuntu@175.24.135.125:/home/ubuntu/.claude`，不是全部用户／SSH会话普查。
48角色连续样本仍为35.11 FPS／p95 60.9ms，目标未达；[性能原记录](E:/project-funny/mianban-develop/work/robot-cockpit-fixture-r1-2026-10-04T19-25-43-946Z.json)保留。
当前13角色近期163–165 FPS／p95 6.1–6.5ms只是页面窗口，不能替代上述连续高负载样本。
旧owned失败回收、父Q6原生三工具加载／调用、Codex活动及真实自动协作仍缺证，旧BLOCKED不据本轮有限绿自动关闭。
H1针对已测试的可靠小成帧早拒绝；大／慢／chunked请求、一般网络稳定性及合法读取等待仍在范围外。

## 最终独立审查与发布

[正式本轮实施记录](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/impl_report_r10.md)已写；最终fresh ReviewImpl结论：**协议PASS／业务PASS，RELEASED**；仅覆盖唯一§13／S1、S2的当前固定实例有限验收。[独立正式审查](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/review_notes_impl_r10_1.md)，SHA `2C659CAEE8FC4948278267C66503738A74E7C7EF0E837080ABCF40D201AC4A57`。
root全文读取正式审查后独立核对29产品／12输入及审查哈希，[发布前46项核对](E:/project-funny/mianban-develop/work/live-session-release-audit-r10-1.json)全部true／exit0。随后只更新本特性README的状态与交付链接，产品和唯一方案不变；不声明“整体稳定”。
工作目录不是Git checkout，未初始化、commit或push；英文提交建议：`fix(gateway): preserve early rejection responses for bounded request bodies`，`perf(terminal): overlap fresh sampling within the original focus budget`。

本轮reviewer的标题路径假设5155db及tab检查器700b5e首次exit1，均只读工具／检查器错误，修正后独立复算；具体保留在正式审查，不当产品失败。发布前文件存在性查询bf4580在两个待生成文件尚未生成时exit1，随后确实生成并全文读取。

交付文件核对首5e4ab2/exit1仅因root错误设定截图必须大于100KB；实际浏览器截图为52,441字节JPEG、1265×712，已实际视觉查看。d7fa88误以PNG字段解析，结果无效；e45974按JPEG标记取得准确尺寸并核字节，保留原截图、增加完全相同字节的正确.jpg副本，没有重拍或改像素。原失败记录保留于work/live-session-published-verification-r10-1.json。
