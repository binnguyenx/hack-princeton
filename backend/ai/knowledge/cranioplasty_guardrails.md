# Cranioplasty design guardrails

Scope: quantitative checks the workspace applies to implant *design* inputs. These are
**workspace design-policy defaults**: configurable engineering guardrails for a planning
tool. They are **not validated clinical standards** and do not replace surgeon judgement,
manufacturer instructions for use, or institutional protocol. Evidence labels:

- `literature` — a cited study reports this finding.
- `manufacturer` — a vendor specification, not an outcome study.
- `policy-default` — a workspace default chosen for conservative screening; no source in
  this knowledge base establishes it as a clinical threshold.

The numeric defaults below are mirrored exactly in `skullfix_ai/tools/clinical_calc_tools.py`
(`POLICY`); a regression test keeps the two in sync.

## Calvarial thickness context
Keywords: skull thickness, calvarium, bone thickness, temporal, parietal, frontal, occipital, screw purchase
Evidence: literature

Calvarial thickness varies substantially by region, population and measurement method, so a
single "normal" value should not be assumed. A CT series of 100 adults reported mean
thickness of frontal 8.02 ± 1.97 mm, parietal 7.04 ± 1.43 mm, temporal 4.71 ± 1.34 mm and
occipital 7.98 ± 2.47 mm; the temporal squama was the thinnest region [1]. A study of 281 dry
skulls reported an overall mean of 6.32 mm (range of site means 5.3–7.5 mm) [2]. Temporal
regions are therefore where fixation-depth checks are most likely to fail.

Sources:
1. Morphometric measurement of cranial vault thickness (CT, 100 patients). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8827567/
2. Hamman-Todd collection skull thickness study (281 dry skulls), as summarised in literature search; full text not verified.

## Screw fixation depth and minimum bone thickness
Keywords: screw, micro-screw, fixation, screw length, bone thickness, inner table, dural breach, titanium screw, fixation safety
Evidence: policy-default (rule structure informed by literature)

Rules applied by the fixation check:
- **Minimum local bone thickness at a fixation site: ≥ 2.0 mm** (`policy-default`).
- **Screw length must not exceed local bone thickness** (margin = thickness − length ≥ 0 mm),
  so the screw cannot pass the inner table toward the dura (`policy-default`; principle of
  matching screw length to local bone thickness is described in the literature [1][2]).

Context: cranial micro-screws are commonly about 4–5 mm long [3]. Pediatric work found that
adult screw-placement guidelines for 4 mm screws may be insufficiently safe in children,
because cortical thickness and distance to dura/venous sinuses are smaller [1]. Patient-specific
systems pre-plan screw position, direction and length from the patient's own bone thickness,
often using tangential directions [2]. Treat any PASS here as a screen on supplied numbers,
not as clearance for surgery.

Sources:
1. Pediatric 4 mm screw safety: cortical thickness and distance to dura/sinuses. https://pmc.ncbi.nlm.nih.gov/articles/PMC7797988
2. Xilloc InterFix: pre-planned screw locations, directions and lengths based on bone thickness. https://www.xilloc.com/interfix/
3. Cranial fixation patents describing ~4 mm and ~5 mm screws. https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7637929

## Venous and air sinus clearance
Keywords: sinus, superior sagittal sinus, transverse sinus, venous sinus, venous lakes, frontal sinus, air sinus, clearance, no-fly zone
Evidence: policy-default

- **Minimum clearance from a fixation point or implant feature to a major venous sinus
  (superior sagittal, transverse) or the frontal/air sinus: ≥ 5.0 mm** (`policy-default`).

Context: PEEK implant design reports position perimeter fixation holes to avoid the superior
sagittal sinus and venous lakes [1]. No source in this knowledge base establishes 5.0 mm as a
clinical threshold; it is a conservative screening default. Frontal sinus breach is a recognised
infection concern and should be reviewed by the surgeon whatever this check returns.

Sources:
1. PEEK cranial implant design report (hole placement avoiding SSS and venous lakes), as summarised in literature search. https://turkishneurosurgery.org.tr/pdf.php?id=2442

## Dura clearance and margin overlap
Keywords: dura, dura mater, penetration, dural clearance, overlap, margin, rim, onlay, inlay, fit tolerance, rim gap
Evidence: policy-default

Rules applied by the implant-fit check:
- **Maximum allowable dural penetration: 0.0 mm** (any positive inward intrusion fails).
- **Circumferential margin overlap onto native bone: 4.0–5.0 mm inclusive.**
- **Mean rim gap (implant edge to defect rim): ≤ 1.0 mm.**

All three are `policy-default`. No source in this knowledge base establishes an overlap band or
rim-gap tolerance; many patient-specific implants are designed as edge-to-edge inlays, for
which an overlap rule does not apply. Use these checks only for onlay-style designs, and state
which design type is assumed.

## Drainage and dural tack-up holes
Keywords: drainage hole, perfusion hole, tack-up, dural suspension, suture hole, epidural collection, perforation, hole diameter, hole spacing
Evidence: manufacturer + literature (outcomes) + policy-default (spacing)

- Hole purposes described in the literature: fluid exchange, tissue integration, fixation,
  dural re-expansion/tack-up sutures and temporalis resuspension [1].
- One commercial PEEK system offers suture/drainage holes of **2 mm or 3 mm diameter** in 1–6
  pairs or a full pattern (`manufacturer`) [2].
- Workspace screening default: **diameter 1.5–2.0 mm, grid spacing ≈ 10 mm** (`policy-default`).
- A retrospective series of 94 adults comparing smooth vs perforated implants found no
  statistically significant difference in healing (`literature`, small study) [3].
- No source here validates a hole diameter or spacing that prevents epidural fluid collection.

Sources:
1. Cranioplasty technical paper on implant holes (Springer). https://link.springer.com/10.1007/s10006-017-0668-4
2. Stryker Cranial iD brochure (suture/drainage hole options). https://www.stryker.com/content/dam/stryker/craniomaxillofacial/products/cranialid/resources/eu/Cranial%20iD%20-%20Brochure%20-EN.pdf
3. Smooth vs perforated implant healing study, as reported. https://www.eurekalert.org/news-releases/1114909
