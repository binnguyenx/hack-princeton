"""Explicit local server launch; never selects a live root implicitly."""
import argparse
import os
from pathlib import Path

from .app import create_app


def _load_dotenv(path: Path) -> None:
    """Load KEY=VALUE lines into os.environ when the key is not already set."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def main():
    _load_dotenv(Path(__file__).resolve().parents[3] / '.env')
    parser = argparse.ArgumentParser(description='Run the application API against an explicit storage root')
    parser.add_argument('--storage-root', default=os.environ.get('HACK_STORAGE_ROOT'))
    parser.add_argument('--frontend-dir', type=Path)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    has_key = bool(os.environ.get('GOOGLE_API_KEY') or os.environ.get('GEMINI_API_KEY'))
    parser.add_argument('--chat-provider', choices=['gemini'],
                        default=os.environ.get('SKULLFIX_CHAT_PROVIDER') or 'gemini',
                        help='Chat model (Gemini only; requires GOOGLE_API_KEY or GEMINI_API_KEY)')
    parser.add_argument('--cors-origins', default=os.environ.get('HACK_CORS_ORIGINS'),
                        help='Comma-separated browser origins (default: localhost/127.0.0.1 on 5173 and 5174)')
    args = parser.parse_args()
    if not args.storage_root:
        parser.error('--storage-root or an explicit HACK_STORAGE_ROOT is required')
    if args.chat_provider != 'gemini':
        parser.error('Only --chat-provider gemini is supported')
    if not has_key:
        parser.error('Gemini chat requires GOOGLE_API_KEY or GEMINI_API_KEY (set in backend/ai/.env or the environment)')
    from skullfix_ai.agent.gemini_graph import GeminiChatAgent
    chat_agent = GeminiChatAgent()
    options = {}
    if args.cors_origins is not None:
        options['cors_origins'] = tuple(origin.strip() for origin in args.cors_origins.split(',') if origin.strip())
    print('Chat provider: gemini', flush=True)
    import uvicorn
    uvicorn.run(create_app(Path(args.storage_root), frontend_dir=args.frontend_dir, chat_agent=chat_agent, **options),
                host=args.host, port=args.port)


if __name__ == '__main__':
    main()
