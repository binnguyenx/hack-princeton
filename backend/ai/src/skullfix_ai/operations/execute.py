from dataclasses import dataclass


@dataclass(frozen=True)
class OperationResult:
    status: str
    reason: str | None
    value: object | None


def execute_operation(operation_id, agreed_operation_ids):
    if operation_id in agreed_operation_ids:
        raise NotImplementedError(operation_id)
    return OperationResult(status="unavailable", reason="operation-contract-missing", value=None)
