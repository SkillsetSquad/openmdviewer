# Reading appearance

Open **Reading settings** in the navigation or command palette (`Ctrl/Cmd + K`). Choices apply immediately and remain in this browser's lightweight preferences. They do not change Markdown, annotations, repository files, or workspace ZIP metadata.

## Themes and colors

Built-in themes are Midnight (dark), Daylight (light), Warm paper (sepia), Paper (neutral), OLED, high contrast and system. Custom colors add a background, text and accent palette. Enter six-digit hexadecimal colors or use the native color pickers, then select **Apply custom colors**. Unapplied color drafts are discarded when settings close. The last applied custom palette is retained when another theme is selected.

Custom text and accent colors must each have at least 4.5:1 contrast against the chosen background. Ratios use the sRGB relative-luminance calculation; displayed values round down and validation uses the unrounded value. The threshold follows [WCAG's ordinary-text contrast criterion](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Derived interface surfaces preserve both checks, and custom-theme document links are underlined. These checks cover the selected pairs, not a claim that every rendered image, diagram, code token or UI state has been certified for complete WCAG conformance.

Code highlighting retains the existing light or dark syntax palette on a matching code background. The custom background selects the matching editor/diagram mode. Printing keeps the reader's neutral white/black palette, including folded content; it does not print custom dark backgrounds. HTML/Word/website exports retain their existing independent layouts.

## Typography and spacing

- Body and heading fonts can be selected separately: bundled sans serif, local Georgia serif, or bundled monospace.
- Code uses bundled Geist Mono, the system monospace stack, or Courier. Local fallback fonts apply where a system font is unavailable. No font service is contacted.
- Body size: 12–24 px; line spacing: 1.3–2.2; maximum reading width: 600–1,400 px.
- Paragraph spacing: 0.3–1.5 em; document padding: 12–64 px. Padding is capped in narrower and split layouts to preserve the reading area. Presentation and print retain their own layout spacing.

Older saved body-font choices are initially used for headings too, preserving their prior appearance.

**Reset defaults** restores the original dark appearance and all typography/spacing controls. Preferences are shared by workspaces in the same browser origin. Browser storage clearing removes them. Saved values are parsed through explicit font/theme allowlists, bounded numbers and validated colors; arbitrary CSS, URLs and font sources are not accepted.

## Verification

Unit tests cover old/malformed preferences, numeric bounds, unknown fields, CSS-like payloads, known contrast ratios, both palette modes and derived-surface contrast near the threshold. Browser checks cover actual computed typography/spacing, source preservation, reload, custom-color validation, syntax palette selection, neutral printing, reset, mobile overflow and serious/critical axe findings in settings. These checks do not certify every device, shipping browser or full accessibility standard.
