# AI 资讯来源补充调研

2026-10-13，root 承接 architecture 的 DELEGATE_ACTION。用 PowerShell Invoke-WebRequest 对三个固定公开RSS读取，超时10秒，不发送本地项目信息或凭证。命令退出0；完整清洗结果：work/agent-workbench-20261013/feed-probe.json。

| 来源 | URL | 当前响应 | 结构与用途 |
| --- | --- | --- | --- |
| Hugging Face Blog | https://huggingface.co/blog/feed.xml | HTTP200，258580 bytes，876项 | RSS channel/item，title/link/pubDate，含社区作者文章，须标明来源。 |
| Google AI | https://blog.google/technology/ai/rss/ | HTTP200，30344 bytes，20项 | RSS channel/item，title/link/pubDate，来源为Google官方。 |
| OpenAI News | https://openai.com/news/rss.xml | HTTP200，784414 bytes，1287项 | RSS channel/item，title存在CDATA，不能使用PowerShell对象的JSON形状当业务字段；Python应读取文本节点。 |

固定候选来源可以用于本轮实现。实测最大来源超过512KiB，可用1MiB有界响应，超出显式失败，不截半份XML。只提取标题、HTTPS链接、发布时间与来源，限制输出条数并保留抓取时间；单来源失败不能使全部来源清空。缓存是抓取缓存，不代表新闻内容实时更新；不承诺完整覆盖全行业。本文不构成正式实现计划，细节由LW计划定义。
