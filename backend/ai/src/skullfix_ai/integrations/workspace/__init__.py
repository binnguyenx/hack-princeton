"""Read-only integration with the authoritative UI app backend."""

from .app import AppManifestReader, AppWorkspaceAdapter, HttpAppManifestReader, WorkspaceError

__all__ = ["AppManifestReader", "AppWorkspaceAdapter", "HttpAppManifestReader", "WorkspaceError"]
