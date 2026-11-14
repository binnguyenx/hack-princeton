"""Versioned portable project ZIPs; manual application boundary, never an AI tool."""
from copy import deepcopy
import hashlib
import io
import json
import math
import re
import stat
import zipfile
import zlib

from pydantic import Field, JsonValue, ValidationError
from skullfix_ai.schemas.workspace import AppProjectManifest, AppSample, AppSourceAnatomy, AppSpatialMeta

MAX_ARCHIVE = 64 * 1024 * 1024
MAX_EXPANDED = 256 * 1024 * 1024
MAX_JSON = 4 * 1024 * 1024
MAX_ENTRIES = 512
MARKER = {'format': 'project-package', 'version': 1}
SAFE_ID = re.compile(r'^[A-Za-z0-9_-]{1,128}$')
HASH = re.compile(r'^[0-9a-f]{64}$')


class PackageError(ValueError):
    def __init__(self, code, message, status=422):
        self.code, self.status = code, status
        super().__init__(message)


class PackageSource(AppSourceAnatomy):
    spatial: dict[str, JsonValue]


class PackageSample(AppSample):
    source_anatomy: PackageSource = Field(alias='sourceAnatomy')


class PackageManifest(AppProjectManifest):
    samples: list[PackageSample]
    landmarks: list[dict[str, JsonValue]] | None = None


def _invalid(message='Invalid project package.'):
    raise PackageError('invalid-package', message)


def _json(value):
    def pairs(items):
        result = {}
        for key, item in items:
            if key in result:
                _invalid('Duplicate JSON property.')
            result[key] = item
        return result
    def number(token):
        result = float(token)
        if not math.isfinite(result):
            _invalid('Nonfinite package number.')
        return result
    try:
        return json.loads(value, object_pairs_hook=pairs, parse_float=number,
                          parse_constant=lambda _: _invalid('Nonfinite package number.'))
    except (ValueError, UnicodeError, RecursionError) as error:
        raise PackageError('invalid-package', 'Unreadable package JSON.') from error


def _ids(records, field):
    result = {}
    for item in records:
        value = item[field]
        if not isinstance(value, str) or not SAFE_ID.fullmatch(value) or value in result:
            _invalid('Invalid or duplicate package identity.')
        result[value] = item
    return result


def validate_presentation(presentation, manifest):
    """Return a detached whitelist of portable view settings, not domain metadata."""
    if not isinstance(presentation, dict) or set(presentation) - {'viewState', 'openDocuments', 'activeDocumentId'}:
        _invalid('Invalid package presentation.')
    default_view = {'selectionObjectId': None, 'camera': {'position': [0, 0, 500], 'target': [0, 0, 0]},
                    'visibility': {}, 'inspectionPlane': {'enabled': False, 'axis': 'z', 'offset': 0}}
    view = deepcopy(presentation.get('viewState', default_view))
    if not isinstance(view, dict) or set(view) - {*default_view, 'navigationScheme'} or not set(default_view) <= set(view):
        _invalid('Invalid package view state.')
    camera = view['camera']
    def finite_number(value):
        try:
            return type(value) in (int, float) and math.isfinite(value)
        except OverflowError:
            return False
    def finite_vector(value):
        return isinstance(value, list) and len(value) == 3 and all(finite_number(x) for x in value)
    if (not isinstance(camera, dict) or set(camera) != {'position', 'target'}
            or not finite_vector(camera['position']) or not finite_vector(camera['target'])
            or not math.isfinite(math.dist(camera['position'], camera['target']))
            or math.dist(camera['position'], camera['target']) < 1e-6):
        _invalid('Invalid package camera.')
    sources = {s['sourceAnatomy']['objectId'] for s in manifest['samples']}
    candidates = {c['objectId'] for c in manifest['candidates']}
    objects = sources | candidates
    selection = view['selectionObjectId']
    visibility = view['visibility']
    if (selection is not None and (not isinstance(selection, str) or selection not in objects)) or not isinstance(visibility, dict) or any(
            key not in objects or type(value) is not bool for key, value in visibility.items()):
        _invalid('Package view references an unknown object.')
    if selection is not None and visibility.get(selection) is False:
        _invalid('Package selection is hidden.')
    plane = view['inspectionPlane']
    if (not isinstance(plane, dict) or set(plane) != {'enabled', 'axis', 'offset'} or type(plane['enabled']) is not bool
            or plane['axis'] not in ('x', 'y', 'z') or not finite_number(plane['offset'])):
        _invalid('Invalid package inspection plane.')
    if 'navigationScheme' in view and view['navigationScheme'] not in ('blender-like', 'alternate'):
        _invalid('Invalid package navigation scheme.')
    documents = deepcopy(presentation.get('openDocuments', []))
    if not isinstance(documents, list):
        _invalid('Invalid package documents.')
    sample_objects = {s['id']: s['sourceAnatomy']['objectId'] for s in manifest['samples']}
    opened = {}
    for document in documents:
        if not isinstance(document, dict) or set(document) != {'kind', 'id'}:
            _invalid('Invalid package document.')
        kind, identity = document['kind'], document['id']
        if not isinstance(identity, str) or identity in opened:
            _invalid('Duplicate package document.')
        if kind == 'sample' and identity in sample_objects:
            opened[identity] = sample_objects[identity]
        elif kind == 'candidate' and identity in candidates:
            opened[identity] = identity
        else:
            _invalid('Package document does not belong to the project.')
    active = presentation.get('activeDocumentId')
    if active is not None and (not isinstance(active, str) or active not in opened):
        _invalid('Invalid active package document.')
    if selection is not None and (active is None or opened[active] != selection):
        _invalid('Package selection differs from the active document.')
    return {'viewState': view, 'openDocuments': documents, 'activeDocumentId': active}


def validate_manifest(payload, volumes):
    if not isinstance(payload, dict) or type(payload.get('formatVersion')) is not int or payload.get('formatVersion') != 1:
        _invalid('Unsupported manifest version.')
    try:
        manifest = PackageManifest.model_validate(payload).model_dump(mode='json', by_alias=True, exclude_none=True)
    except (ValidationError, ValueError, TypeError) as error:
        raise PackageError('invalid-package', 'Package manifest does not match the project contract.') from error
    for value in (manifest['user']['id'], manifest['project']['id']):
        if not SAFE_ID.fullmatch(value):
            _invalid('Invalid package identity.')
    if manifest['project']['ownerUserId'] != manifest['user']['id'] or not manifest['project']['name'].strip():
        _invalid('Invalid package project ownership/name.')
    if sum(len(manifest[key]) for key in ('cases', 'samples', 'candidates', 'revisions')) > 10000:
        _invalid('Too many package records.')
    cases = _ids(manifest['cases'], 'id')
    samples = _ids(manifest['samples'], 'id')
    candidates = _ids(manifest['candidates'], 'objectId')
    revisions = _ids(manifest['revisions'], 'id')
    sources = _ids([s['sourceAnatomy'] for s in samples.values()], 'objectId')
    if set(samples) & set(candidates) or set(samples) & set(sources) or set(sources) & set(candidates):
        _invalid('Ambiguous package object identity.')
    if any(c['projectId'] != manifest['project']['id'] for c in cases.values()):
        _invalid('Package case belongs to another project.')
    references = {}
    for sample in samples.values():
        source = sample['sourceAnatomy']
        if sample['caseId'] not in cases or source['sampleId'] != sample['id']:
            _invalid('Invalid package source ownership.')
        if sample['spatiallyVerified']:
            try:
                AppSpatialMeta.model_validate(source['spatial'])
            except ValidationError as error:
                raise PackageError('invalid-package', 'Invalid verified spatial metadata.') from error
        references.setdefault(source['volumeId'], set()).add(source['volumeHash'])
    orders = {identity: [] for identity in candidates}
    for revision in revisions.values():
        if revision['candidateId'] not in candidates:
            _invalid('Package revision belongs to another candidate.')
        orders[revision['candidateId']].append(revision['order'])
        references.setdefault(revision['volumeId'], set()).add(revision['volumeHash'])
    for candidate in candidates.values():
        current = revisions.get(candidate['currentRevisionId'])
        if (candidate['sampleId'] not in samples or current is None or current['candidateId'] != candidate['objectId']
                or sorted(orders[candidate['objectId']]) != list(range(len(orders[candidate['objectId']])))):
            _invalid('Invalid package revision history/current pointer.')
    if set(volumes) != set(references):
        _invalid('Missing or unreferenced package volume.')
    for identity, expected in references.items():
        if (not SAFE_ID.fullmatch(identity) or len(expected) != 1 or not all(HASH.fullmatch(value) for value in expected)
                or hashlib.sha256(volumes[identity]).hexdigest() not in expected):
            _invalid('Package volume hash mismatch.')
    # Model coercion must not repair string/bool poses from a malformed legacy record.
    for revision in payload['revisions']:
        if any(type(x) not in (int, float) or not math.isfinite(x) for x in revision['pose']):
            _invalid('Invalid package pose.')
    from .voxel_operations import validate_provenance
    try:
        for revision in revisions.values():
            if 'provenance' in revision:
                validate_provenance(revision['provenance'], revision, revisions, candidates, samples)
    except (ValueError, KeyError, TypeError) as error:
        raise PackageError('invalid-package', 'Invalid package operation provenance.') from error
    from .landmarks import validate_record, LandmarkError
    points = manifest.get('landmarks', [])
    _ids(points, 'id')
    if len(points) + sum(len(manifest[key]) for key in ('cases', 'samples', 'candidates', 'revisions')) > 10000:
        _invalid('Too many package records.')
    try:
        for point in points:
            validate_record(point, samples)
    except LandmarkError as error:
        raise PackageError('invalid-package', str(error)) from error
    session = validate_presentation({key: payload[key] for key in ('viewState', 'openDocuments', 'activeDocumentId') if key in payload}, manifest)
    manifest.update(session)
    return manifest


def encode_package(manifest, volumes):
    manifest = validate_manifest(manifest, volumes)
    if len(volumes) + 2 > MAX_ENTRIES or sum(map(len, volumes.values())) > MAX_EXPANDED:
        raise PackageError('package-too-large', 'Project package exceeds supported limits.', 413)
    marker = {**MARKER, 'version': 2} if manifest.get('landmarks') or any(r.get('provenance') for r in manifest['revisions']) else MARKER
    document = json.dumps(manifest, allow_nan=False, separators=(',', ':')).encode()
    if len(document) > MAX_JSON:
        raise PackageError('package-too-large', 'Package metadata is too large.', 413)
    if sum(map(len, volumes.values())) + len(document) + len(json.dumps(marker).encode()) > MAX_EXPANDED:
        raise PackageError('package-too-large', 'Expanded package is too large.', 413)
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        archive.writestr('package.json', json.dumps(marker))
        archive.writestr('manifest.json', document)
        for identity, data in sorted(volumes.items()):
            archive.writestr('volumes/' + identity + '.nrrd', data)
    result = output.getvalue()
    if len(result) > MAX_ARCHIVE:
        raise PackageError('package-too-large', 'Compressed package is too large.', 413)
    return result


def decode_package(data):
    if len(data) > MAX_ARCHIVE:
        raise PackageError('package-too-large', 'Compressed package is too large.', 413)
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_ENTRIES or sum(item.file_size for item in entries) > MAX_EXPANDED:
                raise PackageError('package-too-large', 'Expanded package is too large.', 413)
            names = set()
            for item in entries:
                name = item.filename
                volume = name.startswith('volumes/') and name.endswith('.nrrd') and SAFE_ID.fullmatch(name[8:-5])
                if (name in names or item.orig_filename != name or '\\' in name or item.is_dir()
                        or stat.S_ISLNK(item.external_attr >> 16) or item.flag_bits & 1
                        or item.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                        or not (name in ('package.json', 'manifest.json') or volume)):
                    _invalid('Unsafe, duplicate or unsupported package entry.')
                names.add(name)
            if not {'package.json', 'manifest.json'} <= names:
                _invalid('Package metadata is missing.')
            if any(archive.getinfo(name).file_size > MAX_JSON for name in ('package.json', 'manifest.json')):
                raise PackageError('package-too-large', 'Package metadata is too large.', 413)
            marker = _json(archive.read('package.json'))
            if (not isinstance(marker, dict) or set(marker) != {'format', 'version'} or marker.get('format') != MARKER['format']
                    or type(marker.get('version')) is not int or marker['version'] not in (1, 2)):
                _invalid('Unsupported package version.')
            manifest = _json(archive.read('manifest.json'))
            if marker['version'] == 1 and isinstance(manifest, dict) and (manifest.get('landmarks') or any(isinstance(r, dict) and r.get('provenance') for r in manifest.get('revisions', []))):
                _invalid('Landmark annotations require package version2.')
            volumes = {item.filename[8:-5]: archive.read(item) for item in entries if item.filename.startswith('volumes/')}
            return validate_manifest(manifest, volumes), volumes
    except PackageError:
        raise
    except (zipfile.BadZipFile, zlib.error, OSError, ValueError, TypeError, KeyError, OverflowError, RecursionError) as error:
        raise PackageError('invalid-package', 'Unreadable project package.') from error


class PackageService:
    def __init__(self, repository):
        self.repository = repository

    def export(self, project_id, presentation):
        manifest, volumes = self.repository.read_package_snapshot(project_id)
        manifest.update(validate_presentation(presentation, manifest))
        return encode_package(manifest, volumes)

    def import_copy(self, data):
        manifest, volumes = decode_package(data)
        return self.repository.import_package_copy(manifest, volumes)
