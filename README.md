# Conference Badge Reader

## Overview

* Find QR code and bounding coordinates
* Extrapolate out to the badge area
* Correct for perspective distortion
* OCR text in badge area


## Experimental Web API: Shape Detection

* Docs: https://developer.chrome.com/docs/capabilities/shape-detection#barcodedetector
* Issues: https://github.com/WICG/shape-detection-api/issues
* `about://flags` - `#enable-experimental-web-platform-features`
* `BarcodeDetector` not working on Windows or non-Chromium browsers -- uses a polyfill as a fallback.
* `TextDetector` not used as less reliable: not working fully on Mac (text regions but not content?), or non-Chromium browsers -- using an OCR library instead.

Feb 2025, Chrome 132:
* TextDetector:     Android ✅  Mac *️⃣  Win ✅   (* location but not content?!)
* BarcodeDetector:  Android ✅  Mac ✅  Win ❌  - fixed with polyfill
