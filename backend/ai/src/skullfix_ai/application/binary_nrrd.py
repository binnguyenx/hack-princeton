"""Bounded binary uint8 NRRD codec for the explicit manual voxel prototype."""
from dataclasses import dataclass
import gzip
import io
import math
import re
import zlib

MAX_GRID_BYTES = 256 * 1024 * 1024

class VoxelError(ValueError):
    def __init__(self, message, status=422):
        self.status = status
        super().__init__(message)

@dataclass(frozen=True)
class BinaryGrid:
    header: bytes
    encoding: str
    sizes: tuple[int, int, int]
    voxels: bytes
    fields: dict[str, str]

    def encode(self, voxels):
        if len(voxels) != len(self.voxels):
            raise VoxelError('Voxel adapter returned a different grid')
        return self.header + (gzip.compress(voxels, compresslevel=6, mtime=0) if self.encoding in ('gzip', 'gz') else voxels)


def decode_binary_nrrd(data):
    if len(data) > MAX_GRID_BYTES:
        raise VoxelError('Compressed volume exceeds 256 MiB')
    match = re.search(br'\r?\n\r?\n', data[:65536])
    if not match or not re.fullmatch(br'NRRD000[1-5]', data.splitlines()[0]):
        raise VoxelError('Unsupported NRRD header')
    header, payload = data[:match.end()], data[match.end():]
    fields = {}
    try:
        for line in header.decode('ascii').splitlines()[1:]:
            if not line or line.startswith('#'):
                continue
            key, value = line.split(':', 1)
            key = key.strip().lower()
            if key in fields:
                raise VoxelError('Duplicate NRRD header field')
            fields[key] = value.strip()
        if fields.get('type') not in ('unsigned char', 'uchar', 'uint8', 'uint8_t') or fields.get('dimension') != '3':
            raise VoxelError('Voxel tools require a 3D uint8 binary mask')
        if any(key in fields for key in ('data file', 'datafile', 'byte skip', 'line skip')):
            raise VoxelError('Detached or skipped NRRD payloads are unsupported')
        sizes = tuple(int(value) for value in fields['sizes'].split())
        if len(sizes) != 3 or any(value <= 0 for value in sizes):
            raise VoxelError('Invalid NRRD dimensions')
        count = math.prod(sizes)
        if count > MAX_GRID_BYTES:
            raise VoxelError('Decoded volume exceeds 256 MiB')
        encoding = fields.get('encoding', 'raw').lower()
        if encoding in ('gzip', 'gz'):
            with gzip.GzipFile(fileobj=io.BytesIO(payload)) as stream:
                voxels = stream.read(count + 1)
        elif encoding == 'raw':
            voxels = payload
        else:
            raise VoxelError('Only raw/gzip NRRD is supported')
        if len(voxels) != count or max(voxels, default=0) > 1:
            raise VoxelError('Voxel tools require exact 0/1 binary source voxels')
        return BinaryGrid(header, encoding, sizes, voxels, fields)
    except VoxelError:
        raise
    except (ValueError, KeyError, UnicodeError, OSError, EOFError, zlib.error) as error:
        raise VoxelError('Unreadable binary NRRD volume') from error


def verify_header_spatial(grid, spatial):
    """Explicit NRRD physical fields may not contradict verified application metadata."""
    fields = grid.fields
    origin = spatial.get('spaceOrigin', [0, 0, 0])
    spacing = spatial['spacings']
    expected = spatial.get('spaceDirections', [[spacing[0], 0, 0], [0, spacing[1], 0], [0, 0, spacing[2]]])
    def numbers(value):
        return [float(number) for number in value.strip().strip('()').split(',')]
    def equal(actual, wanted):
        return len(actual) == len(wanted) and all(math.isfinite(a) and abs(a-b) <= 1e-6 for a,b in zip(actual, wanted))
    try:
        if 'space origin' in fields and not equal(numbers(fields['space origin']), origin):
            raise VoxelError('NRRD origin differs from verified source metadata')
        if 'space directions' in fields:
            vectors = re.findall(r'\(([^()]*)\)', fields['space directions'])
            if len(vectors) != 3 or any(not equal(numbers(value), column) for value,column in zip(vectors,expected)):
                raise VoxelError('NRRD directions differ from verified source metadata')
        if 'spacings' in fields and not equal([float(value) for value in fields['spacings'].split()], spacing):
            raise VoxelError('NRRD spacing differs from verified source metadata')
        if 'space' in fields:
            basis = spatial.get('patientBasis') or ('RAS' if spatial.get('space','').lower() in ('ras','right-anterior-superior') else 'LPS')
            allowed = ('ras','right-anterior-superior') if basis == 'RAS' else ('lps','left-posterior-superior')
            if fields['space'].lower() not in allowed:
                raise VoxelError('NRRD patient basis differs from verified source metadata')
    except (ValueError, TypeError, OverflowError) as error:
        if isinstance(error, VoxelError):
            raise
        raise VoxelError('Invalid physical NRRD header') from error
