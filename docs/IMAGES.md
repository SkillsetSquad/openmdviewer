# Local image gallery

Click a displayed image, or focus it and press Enter/Space, to open the full-viewport image viewer. The gallery lists the document's sanitized image references, including references inside tables. Repeated source references share one entry. Previous/next buttons, the image chooser, and Left/Right keys navigate without prefetching neighboring images.

Drag to pan, scroll or use `+` / `-` to zoom, and press `0` or **Fit image** to reset. Shift + arrow keys pan. Zoom is relative to the image fitted to the available canvas, not a claim about physical display pixels. Touch users can drag and use the visible zoom buttons. Escape closes the viewer and restores focus where possible.

## Files and metadata

The viewer reports dimensions from the browser's loaded image. For imported/bundled images it reads file type and byte size locally. Remote images expose their dimensions after loading; **Read file metadata**, download, or image copying requests their bytes explicitly. Unknown metadata stays unavailable. Camera/EXIF metadata is not parsed.

**Download image** retains the original bytes and format. **Copy image** converts the displayed file to PNG for compatible image clipboards; SVG remains in a non-executing image context during conversion. Copying is limited to 16 million pixels, and browser permissions or format support can prevent it. The original imported file remains unchanged.

**Copy image URL** copies the displayed URL. Imported files use browser-local blob URLs that expire when the workspace's asset URLs are replaced or the page reloads. The original Markdown reference is also shown in the metadata for reuse in documents.

## Remote images and privacy

Remote images stay blocked until individually allowed. Navigating to a blocked gallery entry does not load it. The app shows the host before loading and omits the referrer. Permission is local to the currently rendered document session; it is not a permanent global allow-list.

A remote image can display even when its server does not permit browser access to its bytes. Copying, downloading, or reading metadata may therefore fail under CORS, CSP, mixed-content, or clipboard policy. The app reports the limitation and provides no hidden proxy. Byte requests omit credentials. Local blob reads are permitted by the application's connection policy; arbitrary `blob:`, `data:`, `file:`, and executable addresses in imported Markdown are not treated as trusted imported images.

Missing local images show an import hint. Failed displayed images offer a retry. SVGs are displayed as images, never inserted as executable document markup. Source Markdown, imported assets, and workspace exports retain their original bytes.

The viewer is loaded lazily and included in the application cache for offline use. Browser tests cover local PNG/SVG, measured dimensions and bytes, image copying, original downloads, mobile overflow, image isolation, and per-image remote consent in Chromium. Other browsers and large image collections remain to be verified.
