"""Subprocess seam used by Node tests against Node-created disposable copies.

The parent harness owns root creation/copy/cleanup. No live/default root exists.
Requests arrive as one JSON object on stdin, responses are JSON on stdout.
"""
import json
from pathlib import Path
import sys

from skullfix_ai.application import ApplicationRepository, IDENTITY_POSE


def main():
    request = json.load(sys.stdin)
    root = Path(request["root"])
    if not root.is_dir() or not (root / "app-model.sqlite").is_file():
        raise ValueError("Bridge requires an existing copied test database")
    repo = ApplicationRepository(root)
    operation = request.get("operation", "inspect")
    project_id = request["projectId"]
    before = repo.get_project_manifest(project_id)
    if operation == "inspect":
        result = {"manifest": before, "projects": repo.list_projects()}
    elif operation == "mutate":
        sample_id = request["sampleId"]
        candidate_id = request["candidateId"]
        restored_revision_id = request["restoredRevisionId"]
        repo.restore_revision(candidate_id, restored_revision_id)
        restored = repo.get_project_manifest(project_id)
        pose = IDENTITY_POSE.copy()
        pose[3] = 77
        revision_id = repo.commit_transform(candidate_id, pose)
        case = repo.add_case(project_id, "Python-created case")
        sample = repo.add_sample(project_id, case["id"], "Python-created sample", True,
                                 request["meta"], b"python synthetic compatibility volume")
        candidate = repo.create_candidate(sample["id"])
        result = {"before": before, "restored": restored, "manifest": repo.get_project_manifest(project_id),
                  "case": case, "sample": sample, "candidate": candidate, "revisionId": revision_id,
                  "sourceBytes": list(repo.read_volume(project_id, repo.find_sample_volume(sample_id)["volumeId"]))}
    else:
        raise ValueError("Unsupported bridge operation")
    json.dump(result, sys.stdout, allow_nan=False)


if __name__ == "__main__":
    main()
