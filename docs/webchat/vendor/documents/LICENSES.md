# Vendored libraries: Documents tab (`docs.reader`)

| Library | Version | Source | Licence | Files |
|---|---|---|---|---|
| PDF.js (pdfjs-dist) | 6.5.438 | https://github.com/mozilla/pdf.js (npm: pdfjs-dist) | Apache-2.0, Copyright 2024 Mozilla Foundation | `pdf.mjs`, `pdf.worker.mjs` |
| mammoth.js | 1.13.0 | https://github.com/mwilliamson/mammoth.js (npm: mammoth) | BSD-2-Clause, Copyright (c) 2013, Michael Williamson | `mammoth.mjs` |

- `pdf.mjs` and `pdf.worker.mjs` are the unmodified `build/pdf.min.mjs` and `build/pdf.worker.min.mjs` of the npm package with a header comment added. PDF.js runs its parser in a Web Worker, so the library is **two files** (the second one is loaded by the first through `GlobalWorkerOptions.workerSrc`). The Mozilla licence notice is kept at the top of each file.
- `mammoth.mjs` is one ES module made with `npx esbuild --bundle --format=esm --platform=browser --minify` from the npm package; its dependencies (jszip, underscore, xmlbuilder, @xmldom/xmldom, lop, dingbat-to-unicode, argparse, base64-js, option, and their small helpers) are bundled with their notices inline (`--legal-comments=inline`); all are MIT, BSD-2 or MIT-or-GPL-3.0 and compatible with GPL-3.0.
- Both are loaded lazily by the Documents tab, only when a `.pdf` or `.docx` file is added. Text extraction runs entirely in the browser; the file never leaves the page. No CDN is used.
