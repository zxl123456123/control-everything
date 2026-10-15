"""Subset OFL Source Han Sans for the authored text; freeze GSAP for rendering."""
import argparse
import json
import shutil
from pathlib import Path
from urllib.request import urlopen
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--font-dir', type=Path)
args = parser.parse_args()
text = ''.join(p.read_text(encoding='utf-8') for p in [root/'content.json', root/'STORYBOARD.md'])
text += ''.join(p.read_text(encoding='utf-8') for p in (root/'compositions').rglob('*.html'))
text += 'Control Everything WORKSPACE CONTEXT DELIVERY 0123456789·/年月日界面演示数据当前能力持续迭代项目任务待办负责人手工状态会话关联工具与接入按需消息来源独立核验用量与额度公开资讯复核收据产物验收已实现待验收本地面板真实执行接入进度以仓库记录为准让开发回到一个工作空间'
folder=root/'assets/fonts'; folder.mkdir(parents=True,exist_ok=True)
cache=root/'capture/fonts'; cache.mkdir(parents=True,exist_ok=True)
base='https://raw.githubusercontent.com/adobe-fonts/source-han-sans/release/'
for weight in ['Regular','Bold']:
    source=args.font_dir/f'SourceHanSansCN-{weight}.ttf' if args.font_dir else cache/f'SourceHanSansSC-{weight}.otf'
    if not source.exists():
        source.write_bytes(urlopen(base+f'OTF/SimplifiedChinese/SourceHanSansSC-{weight}.otf',timeout=90).read())
    font=TTFont(source)
    options=subset.Options(); options.flavor='woff2'
    sub=subset.Subsetter(options=options); sub.populate(text=text); sub.subset(font)
    for record in font['name'].names:
        if record.nameID in {1,4,6,16}: record.string=f'DemoSans-{weight}'.encode(record.getEncoding(),errors='replace')
    font.flavor='woff2'; font.save(folder/f'DemoSans-{weight}.woff2')
license_path=folder/'OFL.txt'
if not license_path.exists(): license_path.write_bytes(urlopen(base+'LICENSE.txt',timeout=30).read())
shutil.copyfile(root/'node_modules/gsap/dist/gsap.min.js',root/'assets/gsap.min.js')
(root/'assets/FONT_SOURCE.json').write_text(json.dumps({'font':'Source Han Sans CN / SC','subset_family':'Demo Sans','license':'SIL Open Font License 1.1','upstream':'https://github.com/adobe-fonts/source-han-sans','note':'Renamed subset of OFL source; regenerate after changing narration or scene text.'},indent=2),encoding='utf-8')
print('Font subsets and GSAP frozen locally')
