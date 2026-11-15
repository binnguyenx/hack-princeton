"""Case report captures, PDF and per-conversation listing (features/ai-case-report R10, R13, R14)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile

from skullfix_ai.reports.pdf import build_report_pdf
from skullfix_ai.reports.store import ReportError

MAX_FORM_FILES = 32


def create_reports_router():
    router = APIRouter(prefix='/api/ai')

    def store(request: Request):
        return request.app.state.report_store

    def error(err: ReportError):
        return JSONResponse({'error': str(err), 'code': err.code}, status_code=err.status)

    @router.post('/reports/{report_id}/captures')
    async def upload_captures(report_id: str, request: Request):
        try:
            form = await request.form(max_files=MAX_FORM_FILES, max_fields=MAX_FORM_FILES + 4)
        except Exception:
            return JSONResponse({'error': 'Invalid capture upload', 'code': 'invalid-upload'}, status_code=400)
        conversation_id = form.get('conversation_id')
        if not isinstance(conversation_id, str) or not conversation_id:
            return JSONResponse({'error': 'conversation_id is required', 'code': 'invalid-upload'}, status_code=422)
        captures: dict[str, bytes] = {}
        for key, value in form.multi_items():
            if isinstance(value, UploadFile):
                if key in captures:
                    return error(ReportError('duplicate-shot', f'Duplicate capture {key!r}.', 422))
                captures[key] = await value.read()
        reports = store(request)
        try:
            report = reports.check_captures(report_id, conversation_id, captures)
        except ReportError as err:
            return error(err)
        try:
            pdf, pages = await run_in_threadpool(build_report_pdf, report, captures,
                                                 generated_at=datetime.now(timezone.utc))
        except Exception:
            reports.mark_failed(report_id, 'pdf-build-failed')
            return JSONResponse({'error': 'The PDF could not be built.', 'code': 'pdf-build-failed',
                                 'report': reports.get(report_id).public()}, status_code=500)
        return {'report': reports.set_pdf(report_id, pdf, pages=pages).public()}

    @router.get('/reports/{report_id}.pdf')
    async def report_pdf(report_id: str, request: Request, conversation_id: str | None = None):
        # R14: another conversation's id (or none) gets the same 404 as an unknown id.
        report = store(request).get(report_id)
        if (report is None or report.conversation_id != conversation_id or report.status != 'ready'
                or report.pdf is None):
            return JSONResponse({'error': 'Report not found', 'code': 'report-not-found'}, status_code=404)
        return Response(report.pdf, media_type='application/pdf',
                        headers={'Content-Disposition': f'inline; filename="case-report-{report_id[:8]}.pdf"',
                                 'Cache-Control': 'no-store'})

    @router.get('/conversations/{conversation_id}/reports')
    async def conversation_reports(conversation_id: str, request: Request):
        return {'reports': [report.public() for report in store(request).list(conversation_id)]}

    return router
