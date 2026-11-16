#!/usr/bin/env python3
"""Check that GNOME's installable archive includes the runtime modules."""
import json
from pathlib import Path
import sys
import zipfile

bundle = Path(sys.argv[1])
with zipfile.ZipFile(bundle) as archive:
    names = set(archive.namelist())
    required = {'metadata.json', 'extension.js', 'LICENSE'}
    required.update(path.as_posix() for path in Path('core').glob('*.js'))
    missing = required - names
    if missing:
        raise SystemExit(f'Bundle missing: {sorted(missing)}')
    metadata = json.loads(archive.read('metadata.json'))
    if bundle.name != f"{metadata['uuid']}.shell-extension.zip":
        raise SystemExit('Bundle filename does not match extension UUID')
    corrupt = archive.testzip()
    if corrupt:
        raise SystemExit(f'Corrupt archive member: {corrupt}')
print(f'Validated {bundle} ({len(names)} entries)')
