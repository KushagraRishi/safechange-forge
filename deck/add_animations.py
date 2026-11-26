# Adds slide transitions and soft entrance animations to a pptxgenjs deck.
# Shapes whose name starts with "aN|" fade in automatically after the slide appears,
# group by group in order of N, about a third of a second apart. Slides that already
# have timing (video slides) only get the transition. Run add_transitions.py first.
import re, shutil, sys, zipfile
from xml.sax.saxutils import escape

src = sys.argv[1]
STEP_MS, FADE_MS = 380, 550

def timing(groups):
    ids = [5]
    def nid():
        ids[0] += 1
        return ids[0]
    effects = []
    for k in sorted(groups):
        delay = (k - 1) * STEP_MS
        for spid in groups[k]:
            a, b, c = nid(), nid(), nid()
            effects.append(
                f'<p:par><p:cTn id="{a}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" nodeType="withEffect">'
                f'<p:stCondLst><p:cond delay="{delay}"/></p:stCondLst><p:childTnLst>'
                f'<p:set><p:cBhvr><p:cTn id="{b}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>'
                f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>'
                f'<p:to><p:strVal val="visible"/></p:to></p:set>'
                f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{c}" dur="{FADE_MS}"/>'
                f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:animEffect>'
                f'</p:childTnLst></p:cTn></p:par>')
    return ('<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
            '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
            '<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>'
            '<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
            + ''.join(effects) +
            '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>'
            '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
            '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
            '</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>')

tmp = src + '.tmp'
zin = zipfile.ZipFile(src); zout = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
report = []
for item in zin.infolist():
    if item.filename.endswith('/'):
        continue
    data = zin.read(item.filename)
    m = re.match(r'ppt/slides/slide(\d+)\.xml$', item.filename)
    if m:
        n = int(m.group(1)); x = data.decode('utf-8')
        tr = '<p:transition spd="slow"><p:fade/></p:transition>'
        groups = {}
        for spid, name in re.findall(r'<p:cNvPr id="(\d+)" name="a(\d+)\|', x) and [(i, g) for i, g in re.findall(r'<p:cNvPr id="(\d+)" name="a(\d+)\|', x)]:
            groups.setdefault(int(name), []).append(spid)
        has_timing = '<p:timing' in x
        anim = '' if has_timing or not groups else timing(groups)
        anchor = '</p:clrMapOvr>' if '</p:clrMapOvr>' in x else '</p:cSld>'
        if '<p:transition' not in x:
            x = x.replace(anchor, anchor + tr + anim, 1)
        elif anim:
            # a transition is already there (add_transitions.py ran first): timing goes right after it
            x = re.sub(r'(</p:transition>)', lambda mm: mm.group(1) + anim, x, count=1)
        report.append(f'slide {n}: {sum(len(v) for v in groups.values()) if anim else 0} animated shapes in {len(groups) if anim else 0} steps')
        data = x.encode('utf-8')
    zout.writestr(item, data)
zout.close(); shutil.move(tmp, src)
print('\n'.join(sorted(report, key=lambda r: int(r.split()[1].rstrip(':')))))
