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
    ai_root = Path(__file__).resolve().parents[3]
    repo_root = ai_root.parents[1]
    # Prefer backend/ai/.env; fall back to repo-root .env for unset keys.
    _load_dotenv(ai_root / '.env')
    _load_dotenv(repo_root / '.env')
    parser = argparse.ArgumentParser(description='Run the application API against an explicit storage root')
    parser.add_argument('--storage-root', default=os.environ.get('HACK_STORAGE_ROOT'))
    parser.add_argument('--frontend-dir', type=Path)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--chat-provider', choices=['bedrock', 'gemini'],
                        default=os.environ.get('SKULLFIX_CHAT_PROVIDER') or 'bedrock',
                        help='Chat model provider: bedrock (AWS credentials + region; SKULLFIX_BEDROCK_MODEL) or gemini (GOOGLE_API_KEY)')
    parser.add_argument('--cors-origins', default=os.environ.get('HACK_CORS_ORIGINS'),
                        help='Comma-separated browser origins (default: localhost/127.0.0.1 on 5173 and 5174)')
    args = parser.parse_args()
    if not args.storage_root:
        parser.error('--storage-root or an explicit HACK_STORAGE_ROOT is required')
    from skullfix_ai.agent.gemini_graph import PROVIDERS, bedrock_model_id
    ready, reason = PROVIDERS[args.chat_provider][2]()
    if not ready:
        parser.error(f'{args.chat_provider} chat is not ready: {reason} (see backend/ai/.env)')
    from skullfix_ai.agent.gemini_graph import chat_agent_for
    chat_agent = chat_agent_for(args.chat_provider)
    options = {}
    if args.cors_origins is not None:
        options['cors_origins'] = tuple(origin.strip() for origin in args.cors_origins.split(',') if origin.strip())
    model = bedrock_model_id() if args.chat_provider == 'bedrock' else os.environ.get('SKULLFIX_GEMINI_MODEL')
    print(f'Chat provider: {args.chat_provider} ({model or "default model"})', flush=True)
    import uvicorn
    uvicorn.run(create_app(Path(args.storage_root), frontend_dir=args.frontend_dir, chat_agent=chat_agent, **options),
                host=args.host, port=args.port)


if __name__ == '__main__':
    main()
