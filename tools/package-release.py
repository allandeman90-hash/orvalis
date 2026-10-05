"""Package existing production output, verify source identity and extract a check copy."""
import hashlib
import json
import shutil
import zipfile
from datetime import datetime
from pathlib import Path

root = Path(__file__).resolve().parent.parent
stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
out = root.parent / 'outputs'
out.mkdir(exist_ok=True)
release = out / ('Orvalis-v4-' + stamp)
release.mkdir()

sources = sorted([p.relative_to(root).as_posix() for p in (root / 'src').rglob('*') if p.is_file()] + ['package.json', 'package-lock.json', 'tools/build.mjs'])
digest = hashlib.sha256()
for name in sources:
    digest.update((name + '\0').encode())
    digest.update((root / name).read_bytes())
build = json.loads((root / 'dist/build-info.json').read_text())
assert digest.hexdigest() == build['sourceHash'], 'Production build is stale'
assert build['mode'] == 'production'

for directory in ['src', 'assets', 'tools', 'tests', 'docs']:
    shutil.copytree(root / directory, release / directory)
for name in ['README.md', 'package.json', 'package-lock.json']:
    shutil.copy2(root / name, release / name)
(release / 'dist').mkdir()
for name in ['Jouer-Orvalis.html', 'test.html', 'orvalis.html', 'build-info.json']:
    shutil.copy2(root / 'dist' / name, release / 'dist' / name)
for directory in ['refit', 'catalogue', 'world', 'gameplay', 'peers', 'soak', 'dungeon', 'final', 'final-lifecycle']:
    source = root / 'validation' / directory
    if source.exists():
        shutil.copytree(source, release / 'validation' / directory, ignore=shutil.ignore_patterns('video', 'results-recording.json', 'results-sector-lod.json'))

manifest = {'build': build, 'files': []}
for p in sorted(release.rglob('*')):
    if p.is_file():
        manifest['files'].append({'path': p.relative_to(release).as_posix(), 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
(release / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
archive = out / (release.name + '.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for p in release.rglob('*'):
        if p.is_file():
            z.write(p, 'Orvalis-v4/' + p.relative_to(release).as_posix())
check = out / ('archive-check-' + stamp)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    z.extractall(check)
extracted = check / 'Orvalis-v4'
for entry in manifest['files']:
    assert hashlib.sha256((extracted / entry['path']).read_bytes()).hexdigest() == entry['sha256'], entry['path']
result = {'release': str(release), 'zip': str(archive), 'extracted': str(extracted), 'sourceHash': build['sourceHash'], 'zipSha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'filesVerified': len(manifest['files']), 'zipBytes': archive.stat().st_size}
(out / 'latest-release.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
