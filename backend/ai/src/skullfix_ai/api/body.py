"""Bounded Express-compatible JSON content decoding."""
import zlib

import brotli
import zstandard

JSON_LIMIT = 10 * 1024 * 1024


class BodyReadError(Exception):
    def __init__(self, status_code):
        self.status_code = status_code


async def read_json_bytes(request):
    encoding = request.headers.get('content-encoding', 'identity').lower()
    if encoding not in {'identity', 'gzip', 'deflate', 'br', 'zstd'}:
        raise BodyReadError(415)
    decoder = None
    if encoding in {'gzip', 'deflate'}:
        decoder = zlib.decompressobj(16 + zlib.MAX_WBITS if encoding == 'gzip' else zlib.MAX_WBITS)
    elif encoding == 'br':
        decoder = brotli.Decompressor()
    elif encoding == 'zstd':
        decoder = zstandard.ZstdDecompressor().decompressobj()
    chunks = []
    total = 0

    def append(data):
        nonlocal total
        total += len(data)
        if total > JSON_LIMIT:
            raise BodyReadError(413)
        chunks.append(data)

    try:
        async for chunk in request.stream():
            if not chunk:
                continue
            if decoder is None:
                append(chunk)
            elif encoding == 'br':
                append(decoder.process(chunk, output_buffer_limit=JSON_LIMIT - total + 1))
                while not decoder.can_accept_more_data():
                    append(decoder.process(b'', output_buffer_limit=JSON_LIMIT - total + 1))
            elif encoding == 'zstd':
                # Small compressed pieces bound transient output from the decoder,
                # which lacks a max_length argument (Zstandard blocks are <=128KiB).
                for offset in range(0, len(chunk), 32):
                    append(decoder.decompress(chunk[offset:offset + 32]))
            else:
                append(decoder.decompress(chunk, JSON_LIMIT - total + 1))
        if encoding in {'gzip', 'deflate', 'zstd'}:
            append(decoder.flush())
            if not decoder.eof:
                raise BodyReadError(400)
        elif encoding == 'br' and not decoder.is_finished():
            raise BodyReadError(400)
    except (zlib.error, brotli.error, zstandard.ZstdError):
        raise BodyReadError(400) from None
    return b''.join(chunks)
