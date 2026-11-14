"""Explicit application-server settings; no import-time storage initialization."""
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ApplicationSettings:
    storage_root: Path
    frontend_dir: Path | None = None

    def __post_init__(self):
        object.__setattr__(self, 'storage_root', Path(self.storage_root).resolve())
        if self.frontend_dir is not None:
            directory = Path(self.frontend_dir).resolve()
            if not (directory / 'index.html').is_file():
                raise ValueError('Frontend build directory must contain index.html')
            object.__setattr__(self, 'frontend_dir', directory)
