"""Current application error compatibility, pending D1–D5 decisions."""
import json
import re
from fastapi.responses import HTMLResponse, JSONResponse


def strict_json(value):
    def reject_constant(token):
        raise ValueError('Invalid JSON token')
    return json.loads(value, parse_constant=reject_constant)


def parser_response(status_code: int):
    # Preserve the baseline media type/status without exposing stack traces or paths.
    title = {413: 'Payload Too Large', 415: 'Unsupported Media Type', 500: 'Internal Server Error'}.get(status_code, 'Bad Request')
    return HTMLResponse(f'<!doctype html><html><body>{title}</body></html>', status_code=status_code)


def public_error(error: Exception):
    message = 'ENOENT: volume file not found' if isinstance(error, FileNotFoundError) else str(error)
    if re.search(r'ENOENT|not found', message, re.I):
        status = 404
    elif re.search(r'required', message, re.I):
        status = 400
    elif re.search(r'verified', message, re.I):
        status = 409
    else:
        status = 500
    return JSONResponse({'error': message}, status_code=status)
