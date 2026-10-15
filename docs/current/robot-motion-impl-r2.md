# 机器人视角：最短重置角补实施 r2

2026-10-04；实施者 `/root/robot_motion_impl`。root 转达 fresh review 的实际实现缺陷：自动环绕累积超过整圈后，直接将目标 yaw 设为 -0.28 会让缓动经过整圈/多圈，造成快速扫转。按原有界展示合同作最小修正；r1 报告及证据保留。

仅 `web/robot3d.js` 的 `rotate(delta)` 目标角一行变化：重置使用当前 yaw 最近的默认等价角 `yaw + Math.atan2(Math.sin(-0.28 - yaw), Math.cos(-0.28 - yaw))`。仍沿原阻尼路径，保留 elevation/zoom reset、8 秒交互暂停、箭头相对旋转、UUID-only 选择。没有逐帧角度归一、抽象、API、配置或外部依赖；没有改 cockpit、harness、app/style/HTML 或其它作者文件。

最终 robot3d SHA256：`DF4EC428FF0898B770E8A73711B92E37C567A1864EA2764D0BC19DCCF44BBD33`。

## 作者红绿验证

验证脚本 `work/verify-robot-motion-r2.cjs` 从实际产品文件精确截取 `rotate(delta)` 方法，在本地 Node VM 内执行其原始函数体，只有调度/交互暂停计数使用本地 callback。不是复制公式替代产品函数。无 HTTP、浏览器、GUI、SSH 或真实平台执行。

1. 实际命令 `node work/verify-robot-motion-r2.cjs --red`：对修正前 r1 副本 `work/robot-motion-r2-before.js` 执行 13 案例，7 失败，进程退出码 1。失败均为重置超过最短 π 弧度；旧实现语法检查退出码 0。完整 stdout 与各失败保存在 `work/robot-motion-r2-red.json`，没有忽略这次失败。
2. 实际命令 `node work/verify-robot-motion-r2.cjs --green`：对当前产品源码执行同一 13 案例，0 失败，进程退出码 0；module `node --input-type=module --check` 退出码 0，完整 stdout/stderr 为空，error=null。记录 `work/robot-motion-r2-green.json`。

10 个 reset yaw 覆盖 ±1000、负多圈、完整一圈、默认角、零和 π 边界；断言目标弧度差不超过 π、目标与默认朝向三角等价、不直接跳当前 yaw、elevation/zoom 回默认、原暂停与调度各执行一次。另验 ±0.3 箭头保持相对目标，disposed 时原方法无动作。两次完整输出和退出码均已由实施者读取。

完整 r1→r2 差异 `work/robot-motion-author-r2.patch`，SHA256 `2A7DCCCD507A4A519B7758B9F748047C87A25FF6CB3AA77EC22A3AFB525ACCA9`；仅增 1 行、删 1 行。差异生成实际退出码 0，实施者读过完整输出。相关输入/证据哈希在 `work/robot-motion-r2-hashes.json`；r1 产品 patch、语法记录与实施报告内容未改。报告初稿误填了差异哈希，已依据该生成命令的实际输出改正，未据误填值作验收判断。

## 交回 root

本地函数验证支持最短目标角修正和保留原控制行为，不能替代真实 WebGL 长时间环绕后的平滑重置。root 承接唯一 harness 的实际 Renderer＋受控 RAF timestamp 多圈回归、完整 fixture、现场页与 fresh review；缺少这些证据时对应真实展示验收仍未验证。

可直接回滚本批一行差异，不能撤销其它作者改动。建议英文提交信息：`fix(cockpit): reset orbit along the shortest arc`。无跨功能事实。
