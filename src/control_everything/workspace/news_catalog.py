"""Curated source catalogue offered by the 专栏 editor.

Every entry was fetched and parsed with ``news_feeds.probe`` and checked against public mainland-China
reachability data (GreatFire) on 2026-10-28. Hosts that are blocked or unreliable behind the GFW
(Google, OpenAI, Hugging Face, X, Reddit, Medium, BBC, NYT, Guardian, DW, Al Jazeera, Economist, Forbes, SCMP, CNA ...)
are intentionally absent. ``docs/guides/news-sources.md`` documents the method and the rejected sources.
"""
from urllib.parse import urlsplit

CATEGORIES = (('tech', '科技'), ('ai', 'AI'), ('dev', '开发'), ('science', '科学'),
              ('design', '产品与设计'), ('business', '商业'), ('world', '国际'))

# (id, name, url, category, language, note)
_ROWS = (
    ('sspai', '少数派', 'https://sspai.com/feed', 'tech', 'zh', ''),
    ('ifanr', '爱范儿', 'https://www.ifanr.com/feed', 'tech', 'zh', ''),
    ('tmtpost', '钛媒体', 'https://www.tmtpost.com/rss.xml', 'tech', 'zh', ''),
    ('ithome', 'IT之家', 'https://www.ithome.com/rss/', 'tech', 'zh', ''),
    ('geekpark', '极客公园', 'https://www.geekpark.net/rss', 'tech', 'zh', ''),
    ('solidot', 'Solidot', 'https://www.solidot.org/index.rss', 'tech', 'zh', ''),
    ('landian', '蓝点网', 'https://www.landiannews.com/feed', 'tech', 'zh', ''),
    ('theverge', 'The Verge', 'https://www.theverge.com/rss/index.xml', 'tech', 'en', ''),
    ('techcrunch', 'TechCrunch', 'https://techcrunch.com/feed/', 'tech', 'en', ''),
    ('qbitai', '量子位', 'https://www.qbitai.com/feed', 'ai', 'zh', ''),
    ('aiera', '新智元', 'https://aiera.com.cn/feed/', 'ai', 'zh', ''),
    ('infoq_cn', 'InfoQ 中文', 'https://www.infoq.cn/feed', 'ai', 'zh', ''),
    ('msr', 'Microsoft Research', 'https://www.microsoft.com/en-us/research/feed/', 'ai', 'en', ''),
    ('ollama', 'Ollama Blog', 'https://ollama.com/blog/rss.xml', 'ai', 'en', ''),
    ('simon_ai', 'Simon Willison · AI', 'https://simonwillison.net/tags/ai.atom', 'ai', 'en', ''),
    ('ruanyifeng', '阮一峰的网络日志', 'https://www.ruanyifeng.com/blog/atom.xml', 'dev', 'zh', '每期周刊'),
    ('oschina', '开源中国', 'https://www.oschina.net/news/rss', 'dev', 'zh', ''),
    ('meituan_tech', '美团技术团队', 'https://tech.meituan.com/rss.xml', 'dev', 'zh', ''),
    ('segmentfault', '思否 SegmentFault', 'https://segmentfault.com/feeds', 'dev', 'zh', ''),
    ('rust_blog', 'Rust Blog', 'https://blog.rust-lang.org/feed.xml', 'dev', 'en', ''),
    ('cloudflare', 'Cloudflare Blog', 'https://blog.cloudflare.com/rss/', 'dev', 'en', ''),
    ('simonwillison', 'Simon Willison', 'https://simonwillison.net/atom/everything/', 'dev', 'en', ''),
    ('stackoverflow', 'Stack Overflow Blog', 'https://stackoverflow.blog/feed/', 'dev', 'en', ''),
    ('realpython', 'Real Python', 'https://realpython.com/atom.xml', 'dev', 'en', ''),
    ('nodejs', 'Node.js Blog', 'https://nodejs.org/en/feed/blog.xml', 'dev', 'en', ''),
    ('github_trending', 'GitHub Trending（每日）', 'https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml', 'dev', 'en',
     'github.io 在国内偶有波动'),
    ('sciencedaily', 'ScienceDaily', 'https://www.sciencedaily.com/rss/all.xml', 'science', 'en', ''),
    ('physorg', 'Phys.org', 'https://phys.org/rss-feed/', 'science', 'en', ''),
    ('newscientist', 'New Scientist', 'https://www.newscientist.com/feed/home/', 'science', 'en', ''),
    ('ieee_spectrum', 'IEEE Spectrum', 'https://spectrum.ieee.org/feeds/feed.rss', 'science', 'en', ''),
    ('nasa', 'NASA', 'https://www.nasa.gov/feed/', 'science', 'en', '国内偶有波动'),
    ('alistapart', 'A List Apart', 'https://alistapart.com/main/feed/', 'design', 'en', ''),
    ('nngroup', 'Nielsen Norman Group', 'https://www.nngroup.com/feed/rss/', 'design', 'en', ''),
    ('producthunt', 'Product Hunt', 'https://www.producthunt.com/feed', 'design', 'en', ''),
    ('css_tricks', 'CSS-Tricks', 'https://css-tricks.com/feed/', 'design', 'en', ''),
    ('woshipm', '人人都是产品经理', 'https://www.woshipm.com/feed', 'design', 'zh', ''),
    ('fastcompany', 'Fast Company', 'https://www.fastcompany.com/latest/rss', 'business', 'en', ''),
    ('jiemian', '界面新闻', 'https://a.jiemian.com/index.php?m=article&a=rss', 'business', 'zh', ''),
    ('cnbc', 'CNBC Top News', 'https://www.cnbc.com/id/100003114/device/rss/rss.html', 'business', 'en', '国内偶有波动'),
    ('un_zh', '联合国新闻', 'https://news.un.org/feed/subscribe/zh/news/all/rss.xml', 'world', 'zh', ''),
    ('xinhua_world', '新华社 · 国际', 'https://www.news.cn/world/news_world.xml', 'world', 'zh', ''),
    ('cgtn_world', 'CGTN World', 'https://www.cgtn.com/subscribe/rss/section/world.xml', 'world', 'en', ''),
)

CATALOG = tuple({'id': row[0], 'name': row[1], 'url': row[2], 'category': row[3], 'language': row[4], 'note': row[5]}
                for row in _ROWS)
BY_ID = {row['id']: row for row in CATALOG}
BY_URL = {row['url']: row for row in CATALOG}

# Preset 专栏 shipped on first use. 'ai' and 'hn' keep their fixed worker-backed sources; the user may rename,
# recolour, reorder or delete them (and restore them) but cannot change their sources.
PRESETS = (
    {'id': 'ai', 'name': 'AI 新闻', 'emoji': '', 'color': 'teal', 'preset': 'ai'},
    {'id': 'hn', 'name': 'Hacker News', 'emoji': '', 'color': 'orange', 'preset': 'hn'},
)

# Hosts that must never be offered by default: blocked or throttled behind the GFW, or fragile.
UNREACHABLE_HOSTS = frozenset({
    'blog.google', 'deepmind.google', 'openai.com', 'huggingface.co', 'x.com', 'twitter.com', 'reddit.com',
    'medium.com', 'feeds.feedburner.com', 'bbc.com', 'bbc.co.uk', 'bbci.co.uk', 'nytimes.com', 'theguardian.com',
    'dw.com', 'aljazeera.com', 'economist.com', 'forbes.com', 'scmp.com', 'channelnewsasia.com',
    'raw.githubusercontent.com', 'rsshub.app', 'youtube.com', 'blogspot.com', 'v2ex.com', 'ftchinese.com'})


def host_of(url):
    return (urlsplit(url).hostname or '').lower()


def categories():
    return [{'id': key, 'name': name} for key, name in CATEGORIES]
