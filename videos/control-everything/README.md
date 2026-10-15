# 仓库介绍视频

60 秒，1920×1080，中文女声与同步字幕。成片：[intro.mp4](renders/intro.mp4)；字幕：[intro.zh-CN.srt](intro.zh-CN.srt)。

视频使用仓库实际页面及隔离的演示数据。当前素材来自 `44c359f`，不是生产会话、真实额度或实际完成百分比。真实 Agent 执行与 Orca 运行接入仍标为待验收；并行开发中的 profile 功能没有提前写进视频。

## 源码与素材

- `content.json`：九句旁白、章节标题与版本标签。
- `compositions/frames/*.html`：三个可编辑的 HTML/GSAP 动画章节。
- `scripts/capture.mjs`：从指定 Git 提交读取真实页面，全部请求拦截到内存演示数据；不启动生产服务、不读本机业务数据库。
- `scripts/narrate.py`：Microsoft Edge 中文神经语音 `zh-CN-XiaoxiaoNeural`；每句独立音频，使用 FFprobe 实测时长。
- `scripts/build.mjs`：用实际音频时长组装时间轴、字幕和 SRT；镜头时点读取 `window.videoData`。
- `assets/screens`、`assets/voice`、`assets/fonts`：已冻结素材，直接重渲染不依赖语音或字体网络服务。
- `frame.md`、`STORYBOARD.md`：视觉规范、分镜与功能边界。

字体为 SIL OFL 的思源黑体子集，已改名为 Demo Sans，许可证在 `assets/fonts/OFL.txt`。GSAP 随 npm 依赖安装，渲染副本保留其许可证标头。截图仅来自本仓库页面。

## 直接重新渲染

需要 Node.js 22+、FFmpeg/FFprobe，以及 HyperFrames 可用的 Chromium。

```powershell
Set-Location videos/control-everything
npm ci
npm run build
npm run check
npm run render
```

运行 `npx hyperframes@0.8.159 preview --background` 可以打开带时间轴的可编辑预览。

## 更新内容

1. 修改 `content.json` 的旁白与版本标签；页面示例数据在 `scripts/capture.mjs` 中。
2. 执行 `npm run capture -- <commit>` 重新截取指定提交的页面；省略提交即使用 HEAD。首次需要 `npx playwright install chromium`；Windows 也可设置 `$env:DEMO_BROWSER='msedge'` 使用本机 Edge。
3. 创建并激活独立 Python 环境，安装语音与字体处理依赖，再生成旁白。

```powershell
python -m venv .venv
.venv/Scripts/Activate.ps1
python -m pip install -r requirements-voice.txt
npm run voice
npm run fonts
npm run build
npm run check
npm run render
```

语音生成会将九句公开介绍文字发送到 Microsoft Edge TTS 服务；重渲染已有音频无需调用它。修改功能清单时同步调整第三章 HTML 中的已实现/待验收文字，再运行 `fonts`。字体脚本默认从 Adobe 官方仓库下载源字体，也可传 `--font-dir` 使用已有 `SourceHanSansCN-Regular.ttf` 与 Bold 文件。

本版已验证本机源字体方式；默认联网字体下载在当前网络下未验证成功。若下载失败，使用 `python scripts/prepare-assets.py --font-dir <字体目录>`；仅重渲染现有内容可直接使用仓库中的字体子集。

新增章节需提供对应的 HTML，并加入 `content.json`；不必重新实现渲染器。改变旁白长度时，组装器自动调整章节时长、音频与字幕，镜头动画随句子起点移动。最后仍需检查关键帧和成片，确保新的截图布局与镜头裁切一致。

## 本版验证与限制

检查与渲染结果见 [制作记录](PRODUCTION.md)。全片“真实界面 · 演示数据”持续显示。MP4 用于观看，HTML/脚本才是后续更新的源文件；不将生成缓存、浏览器配置或 Python 环境纳入 Git。
