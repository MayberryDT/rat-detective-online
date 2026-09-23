"""Shared export defaults and destination resolution for the helper, UI and CLI."""
from datetime import datetime
from pathlib import Path
import os
from . import paths
from .export import ExportError


def settings(raw=None):
    result = dict(folder=str(paths.videos_root() / 'Exports'), dated=True,
                  size='original', quality='standard', sound=True)
    if raw is None:
        return result
    if not isinstance(raw, dict):
        raise ExportError('Export settings must be an object.')
    for key, value in raw.items():
        if key not in result:
            raise ExportError('Unknown export setting.')
        if key in {'dated', 'sound'} and type(value) is not bool:
            raise ExportError('Export switches must be true or false.')
        if key == 'size' and value not in {'original', '1080p', '720p'}:
            raise ExportError('Choose original, 1080p or 720p video.')
        if key == 'quality' and value not in {'standard', 'high'}:
            raise ExportError('Choose standard or high quality.')
        if key == 'folder':
            if not isinstance(value, str) or not value.strip() or '\x00' in value:
                raise ExportError('Choose an export folder.')
            folder = Path(value).expanduser()
            if not folder.is_absolute() or (folder.exists() and not folder.is_dir()):
                raise ExportError('Export folder must be an absolute directory path.')
            value = str(folder.resolve())
        result[key] = value
    return result


def defaults(timestamp=None, reel=False):
    stamp = datetime.fromtimestamp(float(timestamp)) if timestamp else datetime.now()
    return dict(filename=f"Rat Detective{' Reel' if reel else ''} - {stamp:%Y-%m-%d_%H-%M-%S}.mp4",
                datePath=stamp.strftime('%Y/%m/%d'))


def destination(payload, options, naming, occupied=()):
    name = payload.get('filename') or naming['filename']
    folder = Path(payload.get('folder') or options['folder']).expanduser()
    legacy = payload.get('destination')
    if legacy:
        value = Path(str(legacy)).expanduser()
        if value.is_dir() or value.suffix.lower() != '.mp4':
            folder = value
        else:
            folder, name = value.parent, value.name
    elif options['dated'] and not payload.get('folder'):
        folder /= naming['datePath']
    if not isinstance(name, str) or name in {'.', '..'} or '/' in name or '\\' in name or any(ord(c) < 32 for c in name):
        raise ExportError('Filename must be a name, without folders or control characters.')
    name = name.strip()
    if not name or len(name.encode()) > 220:
        raise ExportError('Enter a filename of at most 220 bytes.')
    if not name.lower().endswith('.mp4'):
        name += '.mp4'
    if not folder.is_absolute():
        raise ExportError('Choose an absolute export folder.')
    try:
        folder.mkdir(parents=True, exist_ok=True)
        folder = folder.resolve()
        if not folder.is_dir() or not os.access(folder, os.W_OK):
            raise OSError()
    except OSError as error:
        raise ExportError('Export folder is unavailable or not writable.') from error
    base = folder / name
    chosen = base
    suffix = 2
    while chosen.exists() or chosen.is_symlink() or str(chosen) in occupied:
        chosen = base.with_name(f'{base.stem} ({suffix}).mp4')
        suffix += 1
        if suffix > 10000:
            raise ExportError('Too many files share this name. Choose another filename.')
    return chosen
