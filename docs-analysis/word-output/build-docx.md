# Regenerate the Complete Guide DOCX

**Final output:** `Contract-Testing-Business-Demo-Complete-Guide.docx` (this folder)

## What was installed (project-local)

| Package | Where | Purpose |
|---------|-------|---------|
| `@mermaid-js/mermaid-cli@11.4.2` | `_work/node_tools/` | Render Mermaid → PNG (brings Puppeteer) |
| `python-docx` | Already present (user Python 3.14) | Build/style DOCX |
| PyMuPDF | Already present | Optional PDF page preview |

**Not installed:** Pandoc (unavailable) — used python-docx fallback instead.

## Exact regenerate commands (Windows PowerShell)

From the repo workspace root (`Contract testing`):

```powershell
$ROOT = "contract-testing-business-demo\docs-analysis\word-output\_work"

# 1) Ensure mermaid-cli is installed (once)
Set-Location "$ROOT\node_tools"
if (-not (Test-Path "node_modules\@mermaid-js\mermaid-cli")) {
  npm init -y
  npm install @mermaid-js/mermaid-cli@11.4.2 --no-fund --no-audit
}
Set-Location ..\..\..\..\..   # back to workspace root — adjust if needed

# Safer: use absolute paths
$WORK = Resolve-Path "contract-testing-business-demo\docs-analysis\word-output\_work"

# 2) Extract Mermaid blocks + render PNGs
python "$WORK\extract_and_render.py"

# 3) Build DOCX (cover, TOC field, tables, figures, header/footer)
python "$WORK\build_docx.py"

# 4) Optional verify
python "$WORK\verify_docx.py"
```

## Absolute one-liner (after tools exist)

```powershell
python "C:\Users\SatyamChouksey\Desktop\Shubham\avinash\Contract testing\contract-testing-business-demo\docs-analysis\word-output\_work\extract_and_render.py"; python "C:\Users\SatyamChouksey\Desktop\Shubham\avinash\Contract testing\contract-testing-business-demo\docs-analysis\word-output\_work\build_docx.py"
```

## Notes

- Original Markdown under `docs-analysis/*.md` is **never modified**.
- Diagram syntax fixes apply only to copies under `_work/mmd/`.
- After opening the DOCX in Word, if TOC looks stale: right-click TOC → **Update Field**.
  (`w:updateFields` is set so Word usually refreshes on open.)
- Optional PDF used for QA only; primary deliverable is the `.docx`.
