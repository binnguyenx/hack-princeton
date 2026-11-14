"""Live mechanical foreground-volume measurement over ApplicationRepository."""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import math
import re
import zlib
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

OPERATION_ID = "measure.candidate"
METHOD_ID = "candidate.foreground-volume.label-voxel.v1"
MEASURE_KIND = "foreground-volume"
LIMITATIONS = [
    "Labelmap foreground occupancy only (voxel values > 0); not cavity, implant, cranial-cavity, or missing-bone volume.",
    "v1 accepts orthogonal cardinal grids or spacings-only when space directions are entirely absent; oblique grids are unsupported.",
    "Intrinsic NRRD-grid volume is independent of candidate placement pose.",
    "No clinical pass/fail or fit-score claim.",
]
IN_PROGRESS_WAIT_MS = 2000
IN_PROGRESS_POLL_MS = 50
MAX_GRID_BYTES = 256 * 1024 * 1024


class MeasurementError(ValueError):
    """Coordination or transport-mapped measurement failure (not a terminal result envelope)."""

    def __init__(self, code: str, message: str, status: int = 409, details: dict | None = None):
        self.code = code
        self.status = status
        self.details = details or {}
        super().__init__(message)


class MeasurementOutcome(Exception):
    """Terminal measurement envelope with an HTTP status."""

    def __init__(self, status_code: int, body: dict):
        self.status_code = status_code
        self.body = body
        super().__init__(body.get("status", "failed"))


class MeasurementCommand(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    request_id: str = Field(min_length=1, max_length=256)
    project_id: str = Field(min_length=1, max_length=256)
    case_id: str = Field(min_length=1, max_length=256)
    candidate_id: str = Field(min_length=1, max_length=256)
    expected_revision_id: str = Field(min_length=1, max_length=256)
    parameters: dict

    @field_validator("request_id", "project_id", "case_id", "candidate_id", "expected_revision_id")
    @classmethod
    def identity(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Identity must not be blank")
        return value

    @field_validator("parameters")
    @classmethod
    def measure_kind(cls, value: dict) -> dict:
        if value != {"measure_kind": MEASURE_KIND}:
            raise ValueError("parameters.measure_kind must be foreground-volume")
        return value


def canonical_measurement_identity(command: MeasurementCommand) -> str:
    payload = {
        "path_kind": "mechanical.measure.candidate",
        "project_id": command.project_id,
        "case_id": command.case_id,
        "candidate_id": command.candidate_id,
        "expected_revision_id": command.expected_revision_id,
        "operation_id": OPERATION_ID,
        "measure_kind": MEASURE_KIND,
        "method_id": METHOD_ID,
    }
    content = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return f"sha256:{hashlib.sha256(content).hexdigest()}"


def _det3(matrix):
    a, b, c = matrix
    return (
        a[0] * (b[1] * c[2] - b[2] * c[1])
        - a[1] * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * c[1] - b[1] * c[0])
    )


def _cardinal_axis(vector):
    finite = [float(v) for v in vector]
    if len(finite) != 3 or any(not math.isfinite(v) for v in finite):
        return None
    nonzero = [i for i, v in enumerate(finite) if abs(v) > 1e-12]
    if len(nonzero) != 1:
        return None
    return nonzero[0]


def _validate_directions(directions):
    if len(directions) != 3:
        raise MeasurementOutcome(422, _unsupported("grid-orientation", "space directions must provide three vectors"))
    axes = []
    for vector in directions:
        axis = _cardinal_axis(vector)
        if axis is None:
            raise MeasurementOutcome(422, _unsupported("grid-orientation", "v1 requires cardinal orthogonal space directions"))
        axes.append(axis)
    if len(set(axes)) != 3:
        raise MeasurementOutcome(422, _unsupported("grid-orientation", "space directions must map one-to-one onto cardinal axes"))
    for i in range(3):
        for j in range(i + 1, 3):
            if abs(sum(directions[i][k] * directions[j][k] for k in range(3))) > 1e-6:
                raise MeasurementOutcome(422, _unsupported("grid-orientation", "space directions must be mutually orthogonal"))
    det = _det3(directions)
    if not math.isfinite(det) or abs(det) <= 1e-12:
        raise MeasurementOutcome(422, _unsupported("grid-orientation", "space directions basis is singular"))
    return abs(det)


def _parse_vectors(field: str):
    return [[float(part) for part in chunk.split(",")] for chunk in re.findall(r"\(([^()]*)\)", field)]


def decode_labelmap_nrrd(data: bytes):
    if len(data) > MAX_GRID_BYTES:
        raise MeasurementOutcome(422, _unsupported("payload", "Compressed volume exceeds supported limits"))
    match = re.search(br"\r?\n\r?\n", data[:65536])
    if not match or not re.fullmatch(br"NRRD000[1-5]", data.splitlines()[0]):
        raise MeasurementOutcome(422, _unsupported("header", "Unsupported NRRD header"))
    header, payload = data[: match.end()], data[match.end() :]
    fields: dict[str, str] = {}
    try:
        for line in header.decode("ascii").splitlines()[1:]:
            if not line or line.startswith("#"):
                continue
            key, value = line.split(":", 1)
            key = key.strip().lower()
            if key in fields:
                raise MeasurementOutcome(422, _unsupported("header", "Duplicate NRRD header field"))
            fields[key] = value.strip()
        if fields.get("type") not in ("unsigned char", "uchar"):
            raise MeasurementOutcome(422, _unsupported("datatype", "Foreground-volume requires unsigned char voxels"))
        if fields.get("dimension") != "3":
            raise MeasurementOutcome(422, _unsupported("dimension", "Foreground-volume requires dimension 3"))
        if any(key in fields for key in ("data file", "datafile", "byte skip", "line skip")):
            raise MeasurementOutcome(422, _unsupported("encoding", "Detached or skipped NRRD payloads are unsupported"))
        sizes = tuple(int(value) for value in fields["sizes"].split())
        if len(sizes) != 3 or any(value <= 0 for value in sizes):
            raise MeasurementOutcome(422, _unsupported("dimension", "Invalid NRRD sizes"))
        count = math.prod(sizes)
        if count > MAX_GRID_BYTES:
            raise MeasurementOutcome(422, _unsupported("payload", "Decoded volume exceeds supported limits"))
        encoding = fields.get("encoding", "raw").lower()
        if encoding in ("gzip", "gz"):
            with gzip.GzipFile(fileobj=io.BytesIO(payload)) as stream:
                voxels = stream.read(count + 1)
        elif encoding == "raw":
            voxels = payload
        else:
            raise MeasurementOutcome(422, _unsupported("encoding", "Only raw/gzip NRRD is supported"))
        if len(voxels) != count:
            raise MeasurementOutcome(422, _unsupported("payload", "NRRD payload length must equal the product of sizes"))
        return sizes, voxels, fields
    except MeasurementOutcome:
        raise
    except (ValueError, KeyError, UnicodeError, OSError, EOFError, zlib.error) as error:
        raise MeasurementOutcome(422, _unsupported("header", "Unreadable NRRD volume")) from error


def _unsupported(reason: str, message: str) -> dict:
    return {
        "run_id": None,
        "request_id": None,
        "case_id": None,
        "operation_id": OPERATION_ID,
        "status": "unsupported",
        "input_revisions": {"expected_revision_id": None},
        "output_candidate_id": None,
        "output_revision_id": None,
        "artifacts": [],
        "output": None,
        "source": None,
        "limitations": [],
        "error": {"code": "operation-unsupported", "message": message, "details": {"reason": reason}},
    }


def compute_voxel_volume_mm3(fields: dict, spatial: dict) -> float:
    sizes = [int(value) for value in fields["sizes"].split()]
    if list(spatial.get("sizes", [])) != sizes:
        raise MeasurementOutcome(422, _unsupported("metadata", "NRRD sizes do not match verified application metadata"))
    spacings = spatial.get("spacings")
    if not isinstance(spacings, (list, tuple)) or len(spacings) != 3:
        raise MeasurementOutcome(422, _unsupported("spacing", "Verified millimetre spacings are required"))
    try:
        spacing_values = [float(value) for value in spacings]
    except (TypeError, ValueError) as error:
        raise MeasurementOutcome(422, _unsupported("spacing", "Verified millimetre spacings are required")) from error
    if any(not math.isfinite(value) or value <= 0 for value in spacing_values):
        raise MeasurementOutcome(422, _unsupported("spacing", "Spacings must be positive and finite"))

    if "spacings" in fields:
        try:
            header_spacings = [float(value) for value in fields["spacings"].split()]
        except ValueError as error:
            raise MeasurementOutcome(422, _unsupported("spacing", "Invalid NRRD spacings")) from error
        if len(header_spacings) != 3 or any(abs(a - b) > 1e-6 for a, b in zip(header_spacings, spacing_values)):
            raise MeasurementOutcome(422, _unsupported("metadata", "NRRD spacings do not match verified application metadata"))

    if "space directions" in fields:
        try:
            header_directions = _parse_vectors(fields["space directions"])
        except ValueError as error:
            raise MeasurementOutcome(422, _unsupported("grid-orientation", "Malformed space directions")) from error
        if len(header_directions) != 3:
            raise MeasurementOutcome(422, _unsupported("grid-orientation", "Present space directions are incomplete"))
        manifest_directions = spatial.get("spaceDirections")
        if manifest_directions is not None:
            try:
                expected = [[float(v) for v in col] for col in manifest_directions]
            except (TypeError, ValueError) as error:
                raise MeasurementOutcome(422, _unsupported("metadata", "Invalid application spaceDirections")) from error
            if len(expected) != 3 or any(
                len(col) != 3 or any(abs(a - b) > 1e-6 for a, b in zip(col, wanted))
                for col, wanted in zip(header_directions, expected)
            ):
                raise MeasurementOutcome(422, _unsupported("metadata", "NRRD directions do not match verified application metadata"))
        return _validate_directions(header_directions)

    # Directions entirely absent: spacings-only product.
    return spacing_values[0] * spacing_values[1] * spacing_values[2]


def _envelope(
    *,
    run_id: str,
    request_id: str,
    case_id: str,
    status: str,
    expected_revision_id: str,
    output=None,
    error=None,
    source=None,
    limitations=None,
):
    return {
        "run_id": run_id,
        "request_id": request_id,
        "case_id": case_id,
        "operation_id": OPERATION_ID,
        "status": status,
        "input_revisions": {"expected_revision_id": expected_revision_id},
        "output_candidate_id": None,
        "output_revision_id": None,
        "artifacts": [],
        "output": output,
        "source": source,
        "limitations": limitations or [],
        "error": error,
    }


class ForegroundVolumeService:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, candidate_id: str, command: MeasurementCommand) -> tuple[int, dict]:
        command = MeasurementCommand.model_validate({**command.model_dump(), "candidate_id": candidate_id})
        if command.candidate_id != candidate_id:
            raise MeasurementError("candidate-mismatch", "Candidate id does not match route.", 422)
        identity = canonical_measurement_identity(command)
        claim = self.repository.claim_measurement_reservation(
            case_id=command.case_id,
            request_id=command.request_id,
            canonical_identity=identity,
        )
        if claim["action"] == "replay":
            return 200, claim["result"]
        if claim["action"] == "conflict":
            raise MeasurementError("request-id-conflict", "request_id is bound to a different measurement identity.")
        if claim["action"] == "reconciliation":
            raise MeasurementError(
                "reconciliation-required",
                "The canonical request already has an incomplete owner requiring reconciliation.",
            )
        if claim["action"] == "in_progress":
            replay = self.repository.wait_for_measurement_result(
                command.case_id,
                command.request_id,
                timeout_ms=IN_PROGRESS_WAIT_MS,
                poll_ms=IN_PROGRESS_POLL_MS,
            )
            if replay is not None:
                return 200, replay
            raise MeasurementError(
                "request-in-progress",
                "The canonical request already has an incomplete owner.",
            )

        run_id = claim["run_id"]
        try:
            context = self.repository.load_measurement_volume(
                project_id=command.project_id,
                case_id=command.case_id,
                candidate_id=command.candidate_id,
                expected_revision_id=command.expected_revision_id,
            )
        except MeasurementOutcome as outcome:
            body = dict(outcome.body)
            body["run_id"] = run_id
            body["request_id"] = command.request_id
            body["case_id"] = command.case_id
            body["input_revisions"] = {"expected_revision_id": command.expected_revision_id}
            self.repository.finish_measurement_reservation(
                case_id=command.case_id, request_id=command.request_id, result=body
            )
            return outcome.status_code, body
        except MeasurementError:
            self.repository.mark_measurement_reservation_incomplete(command.case_id, command.request_id)
            raise

        digest = hashlib.sha256(context["bytes"]).hexdigest()
        if digest != context["volume_hash"]:
            body = _envelope(
                run_id=run_id,
                request_id=command.request_id,
                case_id=command.case_id,
                status="failed",
                expected_revision_id=command.expected_revision_id,
                error={
                    "code": "artifact-integrity-failure",
                    "message": "Revision volume bytes do not match the stored volume hash.",
                    "details": {},
                },
            )
            self.repository.finish_measurement_reservation(
                case_id=command.case_id, request_id=command.request_id, result=body
            )
            return 500, body

        try:
            _sizes, voxels, fields = decode_labelmap_nrrd(context["bytes"])
            voxel_mm3 = compute_voxel_volume_mm3(fields, context["spatial"])
        except MeasurementOutcome as outcome:
            body = dict(outcome.body)
            body["run_id"] = run_id
            body["request_id"] = command.request_id
            body["case_id"] = command.case_id
            body["input_revisions"] = {"expected_revision_id": command.expected_revision_id}
            self.repository.finish_measurement_reservation(
                case_id=command.case_id, request_id=command.request_id, result=body
            )
            return outcome.status_code, body

        foreground = sum(1 for value in voxels if value > 0)
        value = foreground * voxel_mm3
        result_id = str(uuid4())
        output = {
            "kind": "candidate-measurement",
            "method_id": METHOD_ID,
            "measure_kind": MEASURE_KIND,
            "value": int(round(value)) if abs(value - round(value)) <= 1e-12 else value,
            "unit": "mm3",
            "measured_revision_id": command.expected_revision_id,
            "volume_hash": digest,
            "foreground_voxel_count": foreground,
            "voxel_volume_mm3": float(int(round(voxel_mm3))) if abs(voxel_mm3 - round(voxel_mm3)) <= 1e-12 else voxel_mm3,
        }
        body = _envelope(
            run_id=run_id,
            request_id=command.request_id,
            case_id=command.case_id,
            status="completed",
            expected_revision_id=command.expected_revision_id,
            output=output,
            source="real-operation",
            limitations=list(LIMITATIONS),
            error=None,
        )
        completed = self.repository.complete_measurement_reservation(
            case_id=command.case_id,
            request_id=command.request_id,
            candidate_id=command.candidate_id,
            expected_revision_id=command.expected_revision_id,
            result_id=result_id,
            run_id=run_id,
            result=body,
        )
        if completed["action"] == "stale":
            return 409, completed["result"]
        return 200, completed["result"]

    def list_for_revision(self, candidate_id: str, revision_id: str) -> list:
        return self.repository.list_measurement_results(candidate_id, revision_id)
