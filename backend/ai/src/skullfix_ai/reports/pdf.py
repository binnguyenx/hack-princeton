"""Case report PDF (ai-case-report R11, R12), laid out after a commercial VSP-style case report.

Only the layout idea is borrowed: no third-party brand, logo, agreement or terms text ever appears;
model-written text is scrubbed of those names before it is laid out.
"""

from __future__ import annotations

import io
import re
from datetime import datetime
from xml.sax.saxutils import escape, quoteattr

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.platypus import (BaseDocTemplate, Frame, Image, KeepTogether, PageBreak, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle)

from skullfix_ai.reports.store import Report

INSTITUTION = "University of South Florida"
REPORT_NAME = "Cranial Reconstruction Case Report"
DISCLAIMER = "Demonstration only, not for clinical use"
# DESIGN.md tokens.
INK = colors.HexColor("#1A1D21")
MUTED = colors.HexColor("#8B929A")
ACCENT = colors.HexColor("#2F6BFF")
BORDER = colors.HexColor("#E4E6EA")
BASE = colors.HexColor("#F0F2F5")

PRESET_CAPTIONS = {"left": "Left lateral", "right": "Right lateral", "anterior": "Anterior", "posterior": "Posterior",
                   "superior": "Superior", "inferior": "Inferior", "hero_oblique": "Oblique"}
_FORBIDDEN = re.compile(r"stryker|3\s*d\s*systems|\bvsp\b", re.IGNORECASE)

_STYLES = {
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=INK),
    "institution": ParagraphStyle("institution", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=ACCENT),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=INK, spaceAfter=8),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=INK, spaceBefore=8, spaceAfter=4),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=13, textColor=INK, alignment=TA_LEFT),
    "muted": ParagraphStyle("muted", fontName="Helvetica", fontSize=8, leading=10, textColor=MUTED),
    "caption": ParagraphStyle("caption", fontName="Helvetica", fontSize=8, leading=10, textColor=MUTED, alignment=1),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.5, leading=11, textColor=INK),
}


def scrub(text: str) -> str:
    """Remove third-party product/brand names from model-written text (R12)."""
    return _FORBIDDEN.sub("[name removed]", str(text or ""))


def _p(text: str, style: str = "body") -> Paragraph:
    return Paragraph(escape(scrub(text)), _STYLES[style])


def _image(data: bytes, max_w: float, max_h: float) -> Image:
    reader = ImageReader(io.BytesIO(data))
    w, h = reader.getSize()
    scale = min(max_w / w, max_h / h)
    return Image(io.BytesIO(data), width=w * scale, height=h * scale)


def _figure(data: bytes, caption: str, max_w: float, max_h: float) -> Table:
    table = Table([[_image(data, max_w, max_h)], [_p(caption, "caption")]], colWidths=[max_w])
    table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("BOX", (0, 0), (-1, 0), 0.5, BORDER),
                               ("BACKGROUND", (0, 0), (-1, 0), BASE), ("TOPPADDING", (0, 0), (-1, -1), 3),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    return table


def _grid(figures: list[Table], columns: int, cell_w: float) -> Table:
    rows = [figures[i:i + columns] for i in range(0, len(figures), columns)]
    rows[-1] += [""] * (columns - len(rows[-1]))
    table = Table(rows, colWidths=[cell_w] * columns)
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 3),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return table


def _kv_table(rows: list[tuple[str, str]], width: float) -> Table:
    data = [[_p(k, "muted"), _p(v, "cell")] for k, v in rows]
    table = Table(data, colWidths=[width * 0.28, width * 0.72])
    table.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    return table


class _NumberedCanvas(pdf_canvas.Canvas):
    """Defers page output so every footer can say "Page n of N"."""

    def __init__(self, *args, footer_left: str = "", **kwargs):
        super().__init__(*args, **kwargs)
        self._pages: list[dict] = []
        self._footer_left = footer_left

    def showPage(self):
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._pages)
        for state in self._pages:
            self.__dict__.update(state)
            self._decorate(total)
            super().showPage()
        super().save()

    def _decorate(self, total: int) -> None:
        width, height = self._pagesize
        self.setFillColor(ACCENT)
        self.rect(0, height - 6, width, 6, stroke=0, fill=1)
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(INK)
        self.drawString(0.6 * inch, height - 0.45 * inch, INSTITUTION)
        self.setFont("Helvetica", 8)
        self.setFillColor(MUTED)
        self.drawRightString(width - 0.6 * inch, height - 0.45 * inch, REPORT_NAME)
        self.setStrokeColor(BORDER)
        self.line(0.6 * inch, 0.62 * inch, width - 0.6 * inch, 0.62 * inch)
        self.setFont("Helvetica", 7.5)
        self.drawString(0.6 * inch, 0.45 * inch,
                        f"{INSTITUTION} · Case {self._footer_left} · Page {self._pageNumber} of {total} · {DISCLAIMER}")


def build_report_pdf(report: Report, captures: dict[str, bytes], *, generated_at: datetime) -> tuple[bytes, int]:
    """Lay out the report; returns (pdf bytes, page count)."""
    plan = report.plan
    buffer = io.BytesIO()
    margin = 0.6 * inch
    doc = BaseDocTemplate(buffer, pagesize=letter, leftMargin=margin, rightMargin=margin, topMargin=0.75 * inch,
                          bottomMargin=0.8 * inch, title=f"{REPORT_NAME} — {scrub(plan.title)}", author=INSTITUTION)
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame])])
    width = doc.width
    shots = {section: [s for s in plan.shots if s.section == section]
             for section in ("hero", "anatomy", "repair", "annotated", "slices")}
    context = report.context
    story: list = []

    # Cover.
    story += [_p(INSTITUTION, "institution"), Spacer(1, 4), _p(REPORT_NAME, "title"), Spacer(1, 2),
              _p(plan.title, "h2"), Spacer(1, 6)]
    story.append(_kv_table([
        ("Project", str(context.get("project_name") or context.get("project_id") or "—")),
        ("Case", report.case_name),
        ("Object", str(context.get("selected_object_name") or context.get("selected_object_id") or "—")),
        ("Revision", str(context.get("revision_id") or "—")),
        ("Generated", generated_at.strftime("%Y-%m-%d %H:%M %Z").strip()),
    ], width))
    # The literal phrase is part of the cover contract (S3).
    story += [Spacer(1, 2), _p("Generated by: AI assistant (demo)", "muted"), Spacer(1, 10)]
    heroes = [s for s in shots["hero"] if s.id in captures][:3]
    if heroes:
        cell = width / 3
        story.append(_grid([_figure(captures[s.id], s.title or PRESET_CAPTIONS.get(s.preset, s.preset), cell - 8, 2.1 * inch)
                            for s in heroes], 3, cell))
    story += [_p("Case summary", "h2"), _p(plan.summary)]

    def grid_page(heading: str, items) -> None:
        figures = [_figure(captures[s.id], s.title or PRESET_CAPTIONS.get(s.preset, s.preset), width / 3 - 8, 2.6 * inch)
                   for s in items if s.id in captures]
        if figures:
            story.extend([PageBreak(), _p(heading, "h1"), _grid(figures, 3, width / 3)])

    grid_page("Preoperative Anatomy", shots["anatomy"])
    grid_page("Defect and Proposed Repair", shots["repair"])

    for shot in shots["annotated"]:
        if shot.id not in captures:
            continue
        legend = Table([[_p(c.label, "cell"), _p(f"Annotation {c.annotation_id}", "muted")] for c in shot.callouts],
                       colWidths=[width * 0.4, width * 0.6])
        legend.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER)]))
        story += [PageBreak(), _p("Annotated Findings", "h1"),
                  _figure(captures[shot.id], shot.title or PRESET_CAPTIONS.get(shot.preset, shot.preset), width, 5.4 * inch),
                  Spacer(1, 8), legend]

    for shot in shots["slices"]:
        if shot.id not in captures:
            continue
        centre = shot.centre
        where = ("the defect centre" if centre == "defect" else "the volume centre" if centre == "volume"
                 else f"annotation {centre.get('annotation_id')}")
        story += [PageBreak(), _p("Cross-sections", "h1"),
                  _figure(captures[shot.id], f"Axial · Sagittal · Coronal through {where}", width, 3.4 * inch)]

    # Findings and conversation.
    story += [PageBreak(), _p("Findings and Conversation", "h1")]
    if plan.findings:
        story += [_p("Findings", "h2")] + [_p(f"• {item}") for item in plan.findings]
    if plan.measurements:
        rows = [[_p("Measurement", "muted"), _p("Value", "muted"), _p("Source", "muted")]]
        rows += [[_p(m.name, "cell"), _p(f"{m.value} {m.unit}".strip(), "cell"), _p(m.source or "—", "cell")]
                 for m in plan.measurements]
        table = Table(rows, colWidths=[width * 0.45, width * 0.2, width * 0.35])
        table.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER), ("BACKGROUND", (0, 0), (-1, 0), BASE)]))
        story += [_p("Measurements", "h2"), table]
    if plan.conversation_summary:
        story += [_p("Conversation summary", "h2"), _p(plan.conversation_summary)]
    sources = [s for s in plan.sources if not _FORBIDDEN.search(s.url)]
    if sources:
        story.append(_p("Sources", "h2"))
        for index, source in enumerate(sources, start=1):
            # The href is an attribute value, so quotes must be escaped too (quoteattr adds the quotes).
            story.append(Paragraph(f"[{index}] {escape(scrub(source.title))} — "
                                   f'<link href={quoteattr(source.url)} color="#2F6BFF">{escape(source.url)}</link>',
                                   _STYLES["body"]))
    story += [Spacer(1, 12), KeepTogether([_p(f"{DISCLAIMER}. This report was assembled by an AI assistant from "
                                              "workspace data and conversation; verify every value before use.", "muted")])]

    case_label = scrub(report.case_name)
    made: list[_NumberedCanvas] = []

    def canvasmaker(*args, **kwargs):
        made.append(_NumberedCanvas(*args, footer_left=case_label, **kwargs))
        return made[-1]

    doc.build(story, canvasmaker=canvasmaker)
    return buffer.getvalue(), len(made[-1]._pages)
