#!/usr/bin/env python3
"""Extract Mermaid blocks from docs-analysis MD files and render to PNG (working copies only)."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DOCS = ROOT.parent.parent  # docs-analysis
DIAG = ROOT / "diagrams"
MMD = ROOT / "mmd"
MMDC = ROOT / "node_tools" / "node_modules" / ".bin" / "mmdc.cmd"

FILES = [
    "00-README-INDEX.md",
    "01-beginner-concepts.md",
    "02-architecture.md",
    "03-file-by-file-guide.md",
    "04-end-to-end-flow.md",
    "05-how-it-runs-explained.md",
    "06-glossary-and-qna.md",
]

# Titles for captions (order matches extraction order within each file)
TITLES = {
    ("00-README-INDEX.md", 0): "How to read these analysis files",
    ("01-beginner-concepts.md", 0): "With vs without contracts",
    ("01-beginner-concepts.md", 1): "Test pyramid speed layers",
    ("01-beginner-concepts.md", 2): "Downstream and upstream example",
    ("01-beginner-concepts.md", 3): "Business problem this demo solves",
    ("02-architecture.md", 0): "System context (C4-style)",
    ("02-architecture.md", 1): "Gateway to six microservices",
    ("02-architecture.md", 2): "Component diagram",
    ("02-architecture.md", 3): "Contract data flow sequence",
    ("02-architecture.md", 4): "Contract mesh CT-00 to CT-17",
    ("02-architecture.md", 5): "Upload-driven filing flow",
    ("02-architecture.md", 6): "Module class diagram",
    ("03-file-by-file-guide.md", 0): "Recommended beginner read order",
    ("04-end-to-end-flow.md", 0): "Contract lifecycle sequence",
    ("04-end-to-end-flow.md", 1): "Happy path verification",
    ("04-end-to-end-flow.md", 2): "Contract broken path",
    ("04-end-to-end-flow.md", 3): "Filing happy path sequence",
    ("05-how-it-runs-explained.md", 0): "test:contracts check flow",
    ("06-glossary-and-qna.md", 0): "Learning path progression",
}

MERMAID_RE = re.compile(r"```mermaid\s*\n(.*?)```", re.DOTALL)


def detect_type(src: str) -> str:
    first = src.strip().splitlines()[0].strip() if src.strip() else ""
    for t in (
        "C4Context",
        "C4Container",
        "C4Component",
        "sequenceDiagram",
        "classDiagram",
        "stateDiagram",
        "erDiagram",
        "gantt",
        "pie",
        "flowchart",
        "graph",
    ):
        if first.startswith(t):
            return t
    return first[:40] or "unknown"


def fix_mermaid(src: str, fig_no: int, source_file: str) -> tuple[str, list[str]]:
    """Return fixed source + list of fixes applied (on COPY only)."""
    fixes: list[str] = []
    out = src

    # C4Context may fail on some mermaid builds — convert to flowchart equivalent
    if out.lstrip().startswith("C4Context"):
        # Keep trying native first; conversion applied only on retry
        pass

    # Undefined sink node X in component diagram — give it a label
    if 'Broker["Pact Broker"]' in out and "|Not found in repo| X" in out:
        if "X[" not in out and "X(" not in out:
            out = out.replace(
                'Broker["Pact Broker"] -.->|Not found in repo| X\n  CI["GitHub Actions / Jenkins"] -.->|Not found in repo| X',
                'X["Not in this repo"]\n  Broker["Pact Broker"] -.->|Not found| X\n  CI["GitHub Actions / Jenkins"] -.->|Not found| X',
            )
            fixes.append(f"fig-{fig_no:02d}: defined sink node X for Broker/CI edges")

    # Fancy quotes in Notes can break parsers
    if "\u201c" in out or "\u201d" in out:
        out = out.replace("\u201c", '"').replace("\u201d", '"')
        fixes.append(f"fig-{fig_no:02d}: normalized curly quotes to ASCII")

    # Nested double quotes inside [node labels] break flowchart parser
    def strip_inner_label_quotes(text: str) -> str:
        def repl(m: re.Match) -> str:
            inner = m.group(1).replace('"', "'")
            return "[" + inner + "]"

        return re.sub(r"\[([^\]]*)\]", repl, text)

    if re.search(r'\[[^\]]*"[^\]]*\]', out):
        out = strip_inner_label_quotes(out)
        fixes.append(f"fig-{fig_no:02d}: removed/normalized quotes inside node labels")

    # Ellipsis character sometimes OK; leave unless fail

    return out, fixes


def c4_to_flowchart(src: str) -> str:
    """Fallback rewrite of the TaxMesh C4Context diagram."""
    return """flowchart TB
  user["Tax analyst / QA\\nUses browser UI"]
  dev["Developer\\nRuns npm scripts"]
  subgraph taxmesh["TaxMesh demo"]
    gw["Gateway :4100\\nSPA + proxy + filing"]
    clm["CLM :4101\\nClient Management"]
    mdm["MDM :4102\\nMaster Data"]
    acc["ACC :4103\\nAccounting"]
    tax["TAX :4104\\nTax Computation"]
    alc["ALC :4105\\nAllocations"]
    doc["DOC :4106\\nForms and Documents"]
  end
  user --> gw
  dev --> gw
  gw --> clm
  gw --> mdm
  gw --> acc
  gw --> tax
  gw --> alc
  gw --> doc
"""


def render(mmd_path: Path, png_path: Path, scale: float = 2.0) -> tuple[bool, str]:
    cmd = [
        str(MMDC),
        "-i",
        str(mmd_path),
        "-o",
        str(png_path),
        "-s",
        str(scale),
        "-b",
        "white",
        "-w",
        "1600",
    ]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        ok = p.returncode == 0 and png_path.exists() and png_path.stat().st_size > 100
        msg = (p.stderr or p.stdout or "").strip()
        return ok, msg
    except Exception as e:
        return False, str(e)


def main() -> int:
    DIAG.mkdir(parents=True, exist_ok=True)
    MMD.mkdir(parents=True, exist_ok=True)
    if not MMDC.exists():
        print(f"ERROR: mmdc not found at {MMDC}", file=sys.stderr)
        return 1

    figures = []
    all_fixes: list[str] = []
    fig_no = 0

    for fname in FILES:
        text = (DOCS / fname).read_text(encoding="utf-8")
        blocks = MERMAID_RE.findall(text)
        for idx, raw in enumerate(blocks):
            fig_no += 1
            title = TITLES.get((fname, idx), f"Diagram from {fname} #{idx+1}")
            fixed, fixes = fix_mermaid(raw, fig_no, fname)
            all_fixes.extend(fixes)
            dtype = detect_type(fixed)
            mmd_path = MMD / f"fig-{fig_no:02d}.mmd"
            png_path = DIAG / f"fig-{fig_no:02d}.png"
            mmd_path.write_text(fixed.strip() + "\n", encoding="utf-8")

            ok, msg = render(mmd_path, png_path, scale=2.0)
            notes = ""

            if not ok and dtype.startswith("C4"):
                fixed2 = c4_to_flowchart(fixed)
                mmd_path.write_text(fixed2.strip() + "\n", encoding="utf-8")
                ok, msg = render(mmd_path, png_path, scale=2.0)
                fix_msg = f"fig-{fig_no:02d}: C4Context rewritten to flowchart fallback"
                all_fixes.append(fix_msg)
                notes = fix_msg
                dtype = "flowchart (from C4)"

            if not ok:
                # retry with ASCII-safe replacements
                safe = (
                    fixed.replace("…", "...")
                    .replace("→", "->")
                    .replace("←", "<-")
                    .replace("—", "-")
                    .replace("–", "-")
                )
                if safe != fixed:
                    mmd_path.write_text(safe.strip() + "\n", encoding="utf-8")
                    ok2, msg2 = render(mmd_path, png_path, scale=2.0)
                    if ok2:
                        ok, msg = ok2, msg2
                        all_fixes.append(f"fig-{fig_no:02d}: unicode arrows/ellipsis ASCII-normalized")
                        notes = (notes + "; " if notes else "") + "unicode normalized"

            if not ok:
                # larger width retry
                ok3, msg3 = render(mmd_path, png_path, scale=1.5)
                if ok3:
                    ok, msg = ok3, msg3
                    notes = (notes + "; " if notes else "") + "retry scale 1.5"

            figures.append(
                {
                    "fig": fig_no,
                    "file": fname,
                    "index_in_file": idx,
                    "type": dtype,
                    "title": title,
                    "png": str(png_path.name),
                    "ok": ok,
                    "notes": notes or (msg[:200] if not ok else ""),
                }
            )
            status = "OK" if ok else "FAIL"
            print(f"fig-{fig_no:02d} [{status}] {fname} {dtype} — {title}")
            if not ok:
                print(f"  ERR: {msg[:500]}")

    meta = {"figures": figures, "fixes": all_fixes}
    (ROOT / "figures.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    failed = sum(1 for f in figures if not f["ok"])
    print(f"\nRendered {len(figures) - failed}/{len(figures)}; fixes={len(all_fixes)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
