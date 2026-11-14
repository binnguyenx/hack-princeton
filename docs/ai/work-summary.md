# Tóm tắt công việc AI/backend

File này nằm trên branch `feat/ai-missing-contract-result`. Nó mô tả workstream AI đã chuẩn bị, không phải những gì đang có trên `main`. Chưa merge pull request nào. Intent và spec vẫn là draft.

## Mục tiêu và phạm vi

AI/backend của SkullFix nhận một selection và một yêu cầu, gọi operation đã đăng ký, rồi giải thích kết quả của tool. Phạm vi này không định nghĩa frontend 3D và không gán người sở hữu thuật toán geometry thật.

Milestone tích hợp thật vẫn là: chọn candidate, yêu cầu một phép đo, chạy operation thật, hiện kết quả trên frontend. Milestone đó chưa làm.

## Cấu trúc đã tạo

- `backend/ai/src/skullfix_ai/`: scaffold `api`, `schemas`, `agent`, `tools`, `operations`, `integrations/bedrock`, `integrations/workspace`, `integrations/geometry`, `storage`.
- `backend/ai/tests/unit/`, `tests/integration/`, `tests/live/`, và `backend/ai/evaluation/`.
- `docs/ai/`: architecture, workflow, contracts, setup.
- `features/ai-workspace-assistant/intent.md` và `spec.md`, tách riêng.
- `features/ai-workspace-assistant/preflight.md` là template. Record theo task nằm ở `preflights/`.
- `.agents/assignments/ai/`: bốn brief và bảng ownership.
- `features/measure-candidate/` giữ bản draft cũ, đã gộp vào assistant. Không triển khai riêng.
- `docs/project.md` và `AGENTS.md` chỉ thêm ngoại lệ workflow của AI và index feature.

## Quyết định đã chốt

- Reconstruction có thể dùng mock trước, gắn nhãn `mock` hoặc `test-double`, qua adapter geometry. Mock không chờ mechanical tool hay measurement contract, và không hoàn thành milestone đo thật. Inspect, edit, compare không được mở rộng thành mock nếu chưa có contract.
- Schema kết quả dùng chung. Agent, API và storage không phụ thuộc field chỉ có trên mock. Đổi implementation bằng cách đổi adapter khi schema còn tương thích. Package `schemas/` hiện vẫn là scaffold.
- Intent và spec là hai file Markdown riêng. Có thể sửa cùng một vòng tài liệu, nhưng không gộp thành một file.
- Preflight là checklist trước khi code, một record cho một task, một người sửa. Checklist không tự cho phép triển khai và không phải cổng duyệt thêm.
- Sau khi người dùng chấp nhận cả intent và spec, viết plan rồi triển khai. Không cần duyệt plan riêng trừ khi người dùng yêu cầu. Chưa có acceptance, nên chưa có `plan.md`.

## Code và test đang có

Chỉ trên branch này, chưa có trên `main` hay trên `feat/ai-backend-foundation`:

- `backend/ai/src/skullfix_ai/operations/execute.py`: `execute_operation` trả `unavailable`, reason `operation-contract-missing`, `value` là `None` khi operation id không nằm trong tập agreed. Nhánh id đã agreed ném `NotImplementedError` và chưa có test.
- `backend/ai/tests/unit/operations/test_missing_contract.py`: một unit test cho ba trường trên.
- Record `features/ai-workspace-assistant/preflights/r7-s6-missing-contract.md`.
- `AGENTS.md` và `docs/ai/setup.md` ghi lệnh test của lát cắt này.

Chưa có dịch vụ FastAPI, tích hợp Bedrock, persistence, hay reconstruction chạy được. Mock reconstruction chưa được viết.

## Chưa triển khai và contract còn mở

Chưa có agreed contract cho `measure.candidate`, `generate.candidate`, `inspect.candidate`, `edit.local`, hay `compare.revisions`. `generate.candidate.from_contour` vẫn unavailable.

Còn mở: phép đo nào và đơn vị nào, local edit nào, ai cấp id, định dạng artifact và metadata tọa độ, workspace đọc in-process hay HTTP, và Bedrock model id. Không gán owner cho geometry thật.

## Verification

Trên branch này, từ repo root:

```
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/unit/operations/test_missing_contract.py
```

Lần chạy gần nhất in `Ran 1 test` và `OK`. Test chỉ kiểm tra status, reason và `value` `None`. Nó không chứng minh không ghi database, không hoàn tất toàn bộ S6, và không phải integration test hay geometry thật.

`python3 .agents/skills/intent-spec-plan/scripts/check_features.py .` báo 2 feature, 0 error, 0 warning trên cả hai branch. `git diff --check` sạch.

## Branch và thứ tự review

1. `feat/ai-backend-foundation`, base `main`. Draft PR nền tảng: https://github.com/binnguyenx/hack-princeton/pull/3. Gồm scaffold, tài liệu, intent/spec draft, workflow, preflight template, assignment. Chưa có operation code.
2. `feat/ai-missing-contract-result`, base là branch ở trên. Draft PR lát cắt: https://github.com/binnguyenx/hack-princeton/pull/4. Thêm missing-contract, record R7/S6, lệnh test, và file tóm tắt này.

Review và merge dự kiến PR nền tảng trước, rồi PR lát cắt. PR lát cắt không lặp lại toàn bộ diff của PR nền tảng vì base của nó là branch nền tảng. Cả hai đều chưa nằm trên `main`.
