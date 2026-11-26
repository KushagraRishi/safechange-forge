# Adds a smooth transition to every slide: push up at section starts, fade elsewhere.
# Run this before add_animations.py.
# Usage: python3 add_transitions.py deck.pptx [comma separated push slides]
import re, shutil, sys, zipfile
src = sys.argv[1]
PUSH = {int(n) for n in sys.argv[2].split(',')} if len(sys.argv) > 2 else {2, 6, 8, 9}
tmp = src + '.tmp'
zin = zipfile.ZipFile(src); zout = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
for item in zin.infolist():
    if item.filename.endswith('/'):
        continue  # skip folder entries; cloud services choke on them
    data = zin.read(item.filename)
    m = re.match(r'ppt/slides/slide(\d+)\.xml$', item.filename)
    if m:
        n = int(m.group(1)); x = data.decode('utf-8')
        tr = '<p:transition spd="med"><p:push dir="u"/></p:transition>' if n in PUSH else '<p:transition spd="med"><p:fade/></p:transition>'
        x = re.sub(r'<p:transition.*?</p:transition>', '', x, flags=re.S)
        x = x.replace('</p:clrMapOvr>', '</p:clrMapOvr>' + tr, 1) if '</p:clrMapOvr>' in x else x.replace('</p:cSld>', '</p:cSld>' + tr, 1)
        data = x.encode('utf-8')
    zout.writestr(item, data)
zout.close(); shutil.move(tmp, src)
print('transitions added to', src, 'push on slides', sorted(PUSH))
