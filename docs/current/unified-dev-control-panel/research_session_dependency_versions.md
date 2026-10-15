# 会话读取与 MCP 依赖补证

时间：2026-10-03T08:00:27UTC。用途：应 LW 作者的 `DELEGATE_ACTION` 补充只读依赖事实，不构成安装或实施记录。

## 远端实际环境

通过既有 SSH 主机 `175.24.135.125` 的 `ubuntu` 用户，在标准 `python3` 中只调用 `sys`、`platform` 与 `importlib.metadata`，命令 exit0：Python 3.12.3、x86_64；`claude-agent-sdk`、`mcp` 均未安装在该解释器环境。未扫描其它虚拟环境，不能推导整个主机从未安装过这些包。

因此消息阅读仍有明确的环境前置，当前探针没有证明消息 API 可运行。后续若准备远端独立 venv，须验证安装、导入及真实只读 API；不替换现有 Claude CLI 或修改用户 PATH。SDK 不可用时应返回明确错误，不能以空对话伪装成功或宣称首批验收满足。

## 官方 Claude Agent SDK：0.2.163

读取 [固定版本 PyPI metadata](https://pypi.org/pypi/claude-agent-sdk/0.2.163/json)，PowerShell exit0：Python >=3.10；核心依赖包括 `mcp>=1.23.0,<3.0.0`。2026-09-30 发布；存在 manylinux x86_64 wheel，没有 Windows wheel。本批在远端 Linux 调用 reader，避免本机 Windows 源码包安装成为阅读链路前置；系统 wheel 兼容性仍需安装阶段验证。

Linux wheel：`claude_agent_sdk-0.2.163-py3-none-manylinux_2_17_x86_64.whl`；SHA256 `260cb955d237b7e1897f1dbf9ee5efbf815d8622d0c7459a05409c56432d8501`，上传时间 2026-09-30T19:46:53.144807Z。

核对 [固定提交 sessions.py](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/_internal/sessions.py) 与 [公开导出](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/__init__.py)，PowerShell exit0：

- `list_sessions` 接收 directory、limit、offset、include_worktrees；默认 worktree 扩展开启，本批限定当前目录时应显式关闭。
- `get_session_messages` 接收 session_id、directory、limit、offset；没有公共 configDir 参数，配置来源由进程环境 `CLAUDE_CONFIG_DIR` 决定。
- 阅读函数从现有磁盘记录还原会话；不能用 query/resume/continue 代替只读 API。分页限制返回结果，源码仍读取所选 JSONL 全文，因此不能以分页宣称磁盘读取量已受限。分支、压缩与内部消息过滤边界见 research_session_interfaces.md。

这里只核对发布和源代码，未实际导入或执行 SDK，未读取对话正文。

## 官方 MCP Python SDK：1.26.0

读取 [固定版本 PyPI metadata](https://pypi.org/pypi/mcp/1.26.0/json)，PowerShell exit0：Python >=3.10；2026-01-24 发布，存在 `mcp-1.26.0-py3-none-any.whl`，Windows 条件依赖包括 pywin32>=310。wheel SHA256 `904a21c33c25aa98ddbeb47273033c435e595bbacfdb177f4bd87f6dceebe1ca`。

核对 [官方 v1.26.0 FastMCP 源码](https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/v1.26.0/src/mcp/server/fastmcp/server.py)，PowerShell exit0：该版本包含 FastMCP，支持 tool 装饰器及 stdio transport 的 run 入口。规划可固定此已核对版本；最新 PyPI 已是 2.3.0，但本轮没有验证其 API，不能假设与 1.x 相同。未安装或运行 MCP。

## 失败、恢复与未验证边界

- web 打开 GitHub v1.26.0 tree 返回 Internal Error；改用同版本官方 raw 源码核对成功。没有用失败页面推断 API。
- 一次源代码正则提取 `run_stdio_async` 误跨越至后续函数；只以精确 run/tool 签名与 stdio dispatch 核对结果为依据，不把该过长匹配作为 API 签名。
- 批量读取技能的总输出再次截断；已随后分段完整重读 development-workflow 与 plan-review，未据截断内容推进状态。
- 发布包、版本和 API 存在并不代表本机安装、远端 SDK、MCP 握手、当前 Codex 工具加载或产品消息验收已验证；这些由后续实施与 coordinator 环境承接验证负责。
