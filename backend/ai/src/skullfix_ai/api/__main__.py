"""Explicit local server launch; never selects a live root implicitly."""
import argparse
import os
from pathlib import Path

from .app import create_app


def main():
    parser = argparse.ArgumentParser(description='Run the application API against an explicit storage root')
    parser.add_argument('--storage-root', default=os.environ.get('HACK_STORAGE_ROOT'))
    parser.add_argument('--frontend-dir', type=Path)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    if not args.storage_root:
        parser.error('--storage-root or an explicit HACK_STORAGE_ROOT is required')
    import uvicorn
    uvicorn.run(create_app(Path(args.storage_root), frontend_dir=args.frontend_dir), host=args.host, port=args.port)


if __name__ == '__main__':
    main()
