"""Quiesced application backup/restore verification, separate from sandbox storage.

Callers must stop writers before snapshot(). Verification is read-only. The backup
contains SQLite plus the complete volume tree and a canonical row/hash manifest.
"""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3

TABLES = ('users', 'projects', 'cases', 'volume_assets', 'samples', 'candidates', 'candidate_revisions')


def inspect(root):
    root = Path(root).resolve()
    database = root / 'app-model.sqlite'
    with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as connection:
        connection.row_factory = sqlite3.Row
        integrity = [row[0] for row in connection.execute('PRAGMA integrity_check')]
        if integrity != ['ok']:
            raise ValueError(f'Database integrity failed: {integrity}')
        if connection.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('Database foreign keys failed')
        records = {}
        for table in TABLES:
            records[table] = sorted([dict(row) for row in connection.execute(f'SELECT * FROM {table}')],
                                    key=lambda row: json.dumps(row, sort_keys=True))
    files = {}
    volumes = root / 'volumes'
    if not volumes.is_dir():
        raise ValueError('Volume directory is missing')
    for entry in sorted(volumes.rglob('*')):
        if entry.is_file():
            if not entry.resolve().is_relative_to(volumes.resolve()):
                raise ValueError('Volume escaped storage root')
            files[str(entry.relative_to(root))] = hashlib.sha256(entry.read_bytes()).hexdigest()
    for asset in records['volume_assets']:
        if files.get(asset['rel_path']) != asset['sha256']:
            raise ValueError('Missing volume or asset hash mismatch')
        if (root / asset['rel_path']).stat().st_size != asset['byte_size']:
            raise ValueError('Volume byte size mismatch')
    volume_rows = {row['id']: row for row in records['volume_assets']}
    revisions = {row['id']: row for row in records['candidate_revisions']}
    for candidate in records['candidates']:
        revision = revisions.get(candidate['current_revision_id'])
        if not revision or revision['candidate_id'] != candidate['id']:
            raise ValueError('Invalid current revision pointer')
    for row in records['samples'] + records['candidate_revisions']:
        volume = volume_rows.get(row['volume_id'])
        if not volume or files.get(volume['rel_path']) != row['volume_hash']:
            raise ValueError('Missing volume or hash mismatch')
    return {'tables': records, 'volume_files': files, 'integrity_check': 'ok', 'foreign_key_check': []}


def snapshot(root, destination):
    root, destination = Path(root).resolve(), Path(destination).resolve()
    if destination == root or destination.is_relative_to(root):
        raise ValueError('Backup must be outside source storage')
    expected = inspect(root)
    destination.mkdir(parents=True, exist_ok=False)
    with closing(sqlite3.connect((root / 'app-model.sqlite').as_uri() + '?mode=ro', uri=True)) as source:
        with closing(sqlite3.connect(destination / 'app-model.sqlite')) as target:
            source.backup(target)
    shutil.copytree(root / 'volumes', destination / 'volumes')
    actual = inspect(destination)
    if expected != actual:
        raise ValueError('Backup differs from quiesced source')
    (destination / 'snapshot-manifest.json').write_text(json.dumps(actual, indent=2, sort_keys=True) + '\n')
    return actual
