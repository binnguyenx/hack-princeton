#!/usr/bin/env python3
"""Mechanical consistency checks for features/<name>/{intent,spec,plan}.md.

Usage: python check_features.py <repo-root> [--features-dir features] [--project-doc docs/project.md]

Checks what a script can check: missing files, leftover template placeholders,
duplicate requirement IDs, plan references to requirements that don't exist,
requirements with no proof in the plan, "Where it lives" paths that don't exist,
and features missing from the project index. Meaning is for a human to judge.
Exit code is 1 if any errors were found, otherwise 0.
"""
import argparse
import re
import sys
from pathlib import Path


def section(text, heading):
    m = re.search(rf"^##\s+{re.escape(heading)}\s*$(.*?)(?=^##\s|\Z)", text, re.M | re.S)
    return m.group(1) if m else ""


def status_of(text):
    m = re.search(r"Status:\s*([A-Za-z-]+)", text)
    return m.group(1).lower() if m else None


def placeholders(text):
    found = []
    for line in text.splitlines():
        s = line.strip()
        if "<YYYY-MM-DD>" in s or re.fullmatch(r"<[^<>]{10,}>", s):
            found.append(s[:60])
    return found


def check_feature(root, fdir):
    errors, warnings = [], []
    files = {n: fdir / f"{n}.md" for n in ("intent", "spec", "plan")}
    text = {n: p.read_text(encoding="utf-8") for n, p in files.items() if p.exists()}
    status = {n: status_of(t) for n, t in text.items()}

    if "intent" not in text:
        errors.append("intent.md is missing")
    if "spec" not in text:
        if status.get("intent") == "accepted":
            errors.append("intent is accepted but spec.md is missing")
    if "plan" not in text and status.get("spec") == "accepted":
        warnings.append("spec is accepted but there is no plan.md (fine for tiny changes)")

    for name, t in text.items():
        if status[name] is None:
            warnings.append(f"{name}.md has no Status in its header")
        ph = placeholders(t)
        if ph:
            msg = f"{name}.md still has template placeholders, e.g. {ph[0]!r}"
            (errors if status[name] in ("accepted", "done") else warnings).append(msg)

    spec_ids = []
    if "spec" in text:
        spec_ids = re.findall(r"^\s*[-*]\s*(R\d+)\.", text["spec"], re.M)
        dupes = sorted({i for i in spec_ids if spec_ids.count(i) > 1})
        if dupes:
            errors.append(f"spec.md has duplicate requirement IDs: {', '.join(dupes)}")
        if not spec_ids and status["spec"] == "accepted":
            errors.append("spec.md is accepted but lists no numbered requirements (R1, R2, ...)")

        if status["spec"] == "accepted" and re.search(r"^\s*[-*]\s+\S", section(text["spec"], "Open questions"), re.M):
            warnings.append("spec.md is accepted but still has Open questions")

        for m in re.findall(r"`([^`\n]+)`", section(text["spec"], "Where it lives")):
            p = m.split("::")[0].strip()
            if not p or " " in p or "<" in p or "..." in p or not ("/" in p or "." in p):
                continue
            hit = list(root.glob(p)) if any(c in p for c in "*?[") else ([root / p] if (root / p).exists() else [])
            if not hit:
                warnings.append(f"spec.md 'Where it lives' path not found: {p}")

    if "plan" in text and "spec" in text:
        removed = set(re.findall(r"^\s*[-*]\s*(R\d+)\.\s*\(removed\)", text["spec"], re.M))
        live = [i for i in dict.fromkeys(spec_ids) if i not in removed]
        plan_refs = set(re.findall(r"\bR\d+\b", text["plan"]))
        missing = sorted(plan_refs - set(spec_ids), key=lambda s: int(s[1:]))
        if missing:
            errors.append(f"plan.md refers to requirements not in spec.md: {', '.join(missing)}")
        proof = section(text["plan"], "Proof")
        unproven = [i for i in live if not re.search(rf"\b{i}\b", proof)]
        if unproven:
            warnings.append(f"no proof listed in plan.md for: {', '.join(unproven)}")
    return errors, warnings


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", help="repository root")
    ap.add_argument("--features-dir", default="features")
    ap.add_argument("--project-doc", default="docs/project.md")
    a = ap.parse_args()

    root = Path(a.root).resolve()
    fdir = root / a.features_dir
    if not fdir.is_dir():
        print(f"No {a.features_dir}/ folder in {root}. Nothing to check.")
        return 0

    project = root / a.project_doc
    project_text = project.read_text(encoding="utf-8") if project.exists() else None
    if project_text is None:
        print(f"WARN  {a.project_doc} not found")

    total_e = total_w = 0
    features = sorted(p for p in fdir.iterdir() if p.is_dir() and not p.name.startswith("."))
    for f in features:
        errors, warnings = check_feature(root, f)
        if project_text is not None and f.name not in project_text:
            warnings.append(f"not listed in {a.project_doc}")
        mark = "FAIL" if errors else ("WARN" if warnings else "ok")
        print(f"[{mark}] {f.name}")
        for e in errors:
            print(f"    error:   {e}")
        for w in warnings:
            print(f"    warning: {w}")
        total_e += len(errors)
        total_w += len(warnings)

    print(f"\n{len(features)} feature(s), {total_e} error(s), {total_w} warning(s)")
    return 1 if total_e else 0


if __name__ == "__main__":
    sys.exit(main())
