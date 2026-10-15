"""Generate one Chinese voice clip per sentence; timing comes from actual audio."""
import asyncio
import json
import subprocess
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parent.parent

async def main():
    data = json.loads((ROOT / 'content.json').read_text(encoding='utf-8'))
    output = ROOT / 'assets' / 'voice'
    output.mkdir(parents=True, exist_ok=True)
    clips = []
    for chapter in data['chapters']:
        for index, text in enumerate(chapter['lines']):
            name = f"{chapter['id']}-{index + 1}.mp3"
            target = output / name
            await edge_tts.Communicate(text, data['voice'], rate='+6%').save(str(target))
            duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(target)], text=True))
            clips.append({'chapter': chapter['id'], 'text': text, 'path': f'assets/voice/{name}', 'duration': duration})
    (ROOT / 'voice.json').write_text(json.dumps({'provider': 'Microsoft Edge online TTS', 'voice': data['voice'], 'clips': clips}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Generated {len(clips)} sentence clips; {sum(c['duration'] for c in clips):.2f}s of speech")

asyncio.run(main())
