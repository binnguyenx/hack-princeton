"""Read authoritative app context without mirroring its database in Python."""

import json
from typing import Mapping, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

from pydantic import ValidationError

from skullfix_ai.schemas.workspace import AppObjectContext, AppProjectManifest


class WorkspaceError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


class AppManifestReader(Protocol):
    def get_project(self, project_id: str) -> Mapping[str, object]: ...


class HttpAppManifestReader:
    """GET-only client for the same /api/projects/:id endpoint as the UI."""

    def __init__(self, origin: str, *, timeout: float = 10):
        parsed = urlsplit(origin)
        if (parsed.scheme not in {"http", "https"} or not parsed.netloc
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in {"", "/"}):
            raise ValueError("Use an HTTP(S) app origin without a path or credentials.")
        if timeout <= 0:
            raise ValueError("timeout must be positive")
        self.origin = origin.rstrip("/")
        self.timeout = timeout

    def get_project(self, project_id: str) -> Mapping[str, object]:
        request = Request(
            f"{self.origin}/api/projects/{quote(project_id, safe='')}",
            headers={"Accept": "application/json"}, method="GET",
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                payload = json.load(response)
        except HTTPError as error:
            code = "project-not-found" if error.code == 404 else "workspace-read-failed"
            raise WorkspaceError(code, "App backend rejected the project read.") from error
        except (URLError, OSError, ValueError) as error:
            raise WorkspaceError("workspace-read-failed", "App backend could not be read.") from error
        if not isinstance(payload, dict):
            raise WorkspaceError("workspace-contract-invalid", "Expected a project manifest object.")
        return payload


class AppWorkspaceAdapter:
    """Resolve selection against a fresh UI manifest; never write candidates."""

    def __init__(self, reader: AppManifestReader):
        self.reader = reader

    def load_context(self, project_id: str, object_id: str, *,
                     case_id: str | None = None,
                     expected_revision_id: str | None = None) -> AppObjectContext:
        try:
            manifest = AppProjectManifest.model_validate(self.reader.get_project(project_id))
        except ValidationError as error:
            raise WorkspaceError("workspace-contract-invalid", "App manifest does not match the UI contract.") from error
        if manifest.project.id != project_id:
            raise WorkspaceError("workspace-contract-invalid", "Returned project identity differs.")
        cases = self._unique(manifest.cases, "id")
        samples = self._unique(manifest.samples, "id")
        candidates = self._unique(manifest.candidates, "object_id")
        revisions = self._unique(manifest.revisions, "id")
        sources = self._unique([sample.source_anatomy for sample in manifest.samples], "object_id")
        for case in cases.values():
            if case.project_id != project_id:
                self._invalid()
        for sample in samples.values():
            if sample.case_id not in cases or sample.source_anatomy.sample_id != sample.id:
                self._invalid()
        for candidate in candidates.values():
            revision = revisions.get(candidate.current_revision_id)
            if (candidate.sample_id not in samples or revision is None
                    or revision.candidate_id != candidate.object_id):
                self._invalid()
        if any(revision.candidate_id not in candidates for revision in revisions.values()):
            self._invalid()
        if set(candidates) & (set(samples) | set(sources)) or set(samples) & set(sources):
            self._invalid()

        candidate = candidates.get(object_id)
        revision = revisions[candidate.current_revision_id] if candidate else None
        sample = samples[candidate.sample_id] if candidate else samples.get(object_id)
        if sample is None:
            sample = next((item for item in samples.values()
                           if item.source_anatomy.object_id == object_id), None)
        if sample is None:
            raise WorkspaceError("object-not-found", "Selected object does not belong to the project.")
        if case_id is not None and sample.case_id != case_id:
            raise WorkspaceError("cross-case-reference", "Selected object belongs to another case.")
        if expected_revision_id is not None and (
            revision is None or revision.id != expected_revision_id
        ):
            raise WorkspaceError("stale-revision", "Expected revision is not current.")
        source = sample.source_anatomy
        return AppObjectContext(
            project_id=project_id, case_id=sample.case_id, sample_id=sample.id,
            selected_object_id=object_id, source_object_id=source.object_id,
            candidate_id=candidate.object_id if candidate else None,
            revision_id=revision.id if revision else None,
            volume_id=revision.volume_id if revision else source.volume_id,
            volume_hash=revision.volume_hash if revision else source.volume_hash,
            pose=revision.pose if revision else None, spatial=source.spatial,
            spatially_verified=sample.spatially_verified,
        )

    def execute_mutation(self, operation: str, parameters: Mapping[str, object]):
        raise WorkspaceError(
            "app-mutation-contract-missing",
            "App AI mutation requires atomic revision/idempotency and publication support.",
        )

    @staticmethod
    def _unique(records, field):
        result = {getattr(item, field): item for item in records}
        if len(result) != len(records):
            AppWorkspaceAdapter._invalid()
        return result

    @staticmethod
    def _invalid():
        raise WorkspaceError("workspace-contract-invalid", "App manifest ownership or revision links are inconsistent.")
