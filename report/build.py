"""Build report.pdf from report.md.

Converts the Markdown to a styled HTML page, prints it to PDF with headless
Chrome, then rewrites the PDF metadata so the author and title are set and no
build-path leaks into the document properties.

Usage:
    python build.py

Set CHROME to a Chrome/Chromium binary if it is not on PATH.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

import markdown
from pypdf import PdfReader, PdfWriter

HERE = Path(__file__).resolve().parent
AUTHOR = "Alvaro Nieto"
EMAIL = "alvaronietosilva_1994@hotmail.com"
TITLE = "Auditing our fraud performance"

CSS = """
@page { size: A4; margin: 20mm 18mm; }
* { box-sizing: border-box; }
body {
  font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1a1a1a; font-size: 10.5pt; line-height: 1.5; margin: 0;
}
h1, h2, h3 { color: #10233f; line-height: 1.25; }
h1 { font-size: 22pt; margin: 0 0 8px; letter-spacing: -0.01em; }
h2 { font-size: 15pt; margin: 26px 0 10px; padding-bottom: 6px;
     border-bottom: 2px solid #4F7CFF; }
h3 { font-size: 12pt; margin: 18px 0 4px; color: #333; font-weight: 600; }
p { margin: 0 0 9px; }
strong { color: #10233f; }
ul { margin: 0 0 10px; padding-left: 20px; }
li { margin: 0 0 5px; }
a { color: #2a5db0; text-decoration: none; }
.pb { page-break-before: always; }
.cover { min-height: 245mm; display: flex; flex-direction: column;
         justify-content: center; }
.cover h1 { font-size: 30pt; max-width: 15cm; }
.cover h3 { color: #4F7CFF; text-transform: uppercase; letter-spacing: 0.08em;
            font-size: 11pt; margin: 0 0 30px; }
.cover strong { display: block; font-size: 15pt; margin: 20px 0 0; }
.cover-contact { color: #2a5db0; font-size: 10.5pt; margin-top: 4px; }
.cover-meta { color: #666; font-size: 10pt; margin-top: 14px; white-space: pre-line; }
.fig { margin: 14px 0 6px; text-align: center; page-break-inside: avoid; }
.fig img { max-width: 100%; max-height: 92mm; border: 1px solid #e3e3e3;
           border-radius: 6px; }
.cap { color: #777; font-size: 9pt; margin-top: 5px; font-style: italic; }
.repo-note { color: #666; font-size: 9.5pt; margin-top: 28px; padding-top: 12px;
             border-top: 1px solid #ddd; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin: 10px 0; }
th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left;
         vertical-align: top; }
th { color: #10233f; border-bottom: 2px solid #bbb; }
tr { page-break-inside: avoid; }
"""

HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>{title}</title>
<meta name="author" content="{author}" />
<style>{css}</style>
</head>
<body>
{body}
</body>
</html>
"""


def find_chrome() -> str:
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        found = shutil.which(name)
        if found:
            return found
    sys.exit("No Chrome/Chromium found. Set CHROME to a browser binary.")


def main() -> None:
    md_text = (HERE / "report.md").read_text()
    body = markdown.markdown(md_text, extensions=["tables", "attr_list", "md_in_html"])
    html = HTML.format(title=TITLE, author=AUTHOR, css=CSS, body=body)
    html_path = HERE / "report.html"
    html_path.write_text(html)

    raw_pdf = HERE / "report.raw.pdf"
    chrome = find_chrome()
    subprocess.run(
        [chrome, "--headless=new", "--no-sandbox", "--no-pdf-header-footer",
         f"--print-to-pdf={raw_pdf}", html_path.as_uri()],
        check=True, capture_output=True,
    )

    # Rewrite with clean, explicit metadata (no build path in the properties).
    reader = PdfReader(str(raw_pdf))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.add_metadata(
        {"/Author": f"{AUTHOR} <{EMAIL}>", "/Title": TITLE, "/Creator": AUTHOR, "/Producer": ""}
    )
    out = HERE / "report.pdf"
    with out.open("wb") as fh:
        writer.write(fh)
    raw_pdf.unlink()
    print(f"built {out} ({len(reader.pages)} pages)")


if __name__ == "__main__":
    main()
