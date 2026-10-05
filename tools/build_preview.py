"""Make a single-file copy of the site for a Claude artifact preview.

Run from the repo root:  python3 tools/build_preview.py
Writes preview/vamos.html (git-ignored). The artifact host adds its own <html>/<head>/<body>,
so this strips them, inlines the scripts and embeds the map data.
"""
import base64, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'docs')
read = lambda p, m='r': open(os.path.join(D, p), m).read()

html = read('index.html')
phys, game, worker = read('phys.js'), read('game.js'), read('worker.js')
inline = {
    'grid': base64.b64encode(read('data/grid.bin', 'rb')).decode(),
    'base': 'data:image/webp;base64,' + base64.b64encode(read('data/basemap.webp', 'rb')).decode(),
    'borders': json.loads(read('data/borders.json')),
    'physSrc': phys,
    'workerSrc': worker,
}
head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
head = re.sub(r'<meta[^>]*>\s*', '', head)  # the host supplies charset and viewport
safe = lambda s: s.replace('</script', '<\\/script')
scripts = (f'<script>window.VAMOS_INLINE = {safe(json.dumps(inline))};</script>\n'
           f'<script>\n{safe(phys)}\n</script>\n<script>\n{safe(game)}\n</script>\n')
body = re.sub(r'<script src="phys.js"></script>\s*<script src="game.js"></script>\s*', lambda m: scripts, body)
os.makedirs(os.path.join(ROOT, 'preview'), exist_ok=True)
out = os.path.join(ROOT, 'preview', 'vamos.html')
open(out, 'w').write(head.strip() + '\n' + body.strip() + '\n')
print('Wrote', out, f'({os.path.getsize(out) // 1024} KB)')
