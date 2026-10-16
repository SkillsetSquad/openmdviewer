import type { Preferences, ReaderTheme } from "./types";

export const fontStacks = {
  sans: "var(--font-geist-sans), sans-serif",
  serif: "Georgia, serif",
  mono: "var(--font-geist-mono), monospace",
};
export const codeFonts = {
  geist: "var(--font-geist-mono), monospace",
  system: "ui-monospace, SFMono-Regular, Consolas, monospace",
  courier: '"Courier New", monospace',
};
export type CustomPalette = {
  background: string;
  text: string;
  accent: string;
};
export const defaultPreferences: Preferences = {
  theme: "dark",
  fontSize: 15,
  lineHeight: 1.75,
  readingWidth: 1100,
  fontFamily: "sans",
  headingFont: "sans",
  codeFont: "geist",
  paragraphSpacing: 0.6,
  documentPadding: 28,
  customPalette: { background: "#101419", text: "#e7ebf2", accent: "#65adff" },
};
const themes: ReaderTheme[] = [
  "dark",
  "light",
  "sepia",
  "paper",
  "oled",
  "contrast",
  "system",
  "custom",
];
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const color = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => {
    const n = parseInt(hex.slice(i, i + 2), 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
export function contrastRatio(a: string, b: string) {
  if (!color(a) || !color(b)) return 0;
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function validPalette(value: unknown): value is CustomPalette {
  const p = record(value);
  return (
    color(p.background) &&
    color(p.text) &&
    color(p.accent) &&
    contrastRatio(p.background, p.text) >= 4.5 &&
    contrastRatio(p.background, p.accent) >= 4.5
  );
}
export function parsePreferences(
  value: unknown,
  current = defaultPreferences,
): Preferences {
  const p = record(value);
  const number = (key: keyof Preferences, min: number, max: number) =>
    typeof p[key] === "number" && Number.isFinite(p[key])
      ? Math.max(min, Math.min(max, p[key] as number))
      : current[key];
  const font = (value: unknown, fallback: Preferences["fontFamily"]) =>
    typeof value === "string" && Object.hasOwn(fontStacks, value)
      ? (value as Preferences["fontFamily"])
      : fallback;
  const bodyFont = font(p.fontFamily, current.fontFamily);
  return {
    theme: themes.includes(p.theme as ReaderTheme)
      ? (p.theme as ReaderTheme)
      : current.theme,
    fontFamily: bodyFont,
    headingFont: font(
      p.headingFont,
      Object.hasOwn(p, "headingFont") ? current.headingFont : bodyFont,
    ),
    codeFont:
      typeof p.codeFont === "string" && Object.hasOwn(codeFonts, p.codeFont)
        ? (p.codeFont as Preferences["codeFont"])
        : current.codeFont,
    fontSize: number("fontSize", 12, 24) as number,
    lineHeight: number("lineHeight", 1.3, 2.2) as number,
    readingWidth: number("readingWidth", 600, 1400) as number,
    paragraphSpacing: number("paragraphSpacing", 0.3, 1.5) as number,
    documentPadding: number("documentPadding", 12, 64) as number,
    customPalette: validPalette(p.customPalette)
      ? {
          background: p.customPalette.background,
          text: p.customPalette.text,
          accent: p.customPalette.accent,
        }
      : { ...current.customPalette },
  };
}
export function customPaletteDark(palette: CustomPalette) {
  return (
    contrastRatio(palette.background, "#ffffff") >
    contrastRatio(palette.background, "#000000")
  );
}
function mix(a: string, b: string, weight: number) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(a.slice(i, i + 2), 16) * (1 - weight) +
            parseInt(b.slice(i, i + 2), 16) * weight,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function customPaletteVariables(
  p: CustomPalette,
): Record<string, string> {
  // Surfaces stay within the user's text/link contrast envelope.
  let surface = p.background;
  for (let weight = 0.08; weight >= 0; weight -= 0.01) {
    const candidate = mix(p.background, p.text, weight);
    if (
      contrastRatio(candidate, p.text) >= 4.5 &&
      contrastRatio(candidate, p.accent) >= 4.5
    ) {
      surface = candidate;
      break;
    }
  }
  const dark = customPaletteDark(p);
  return {
    "--app-bg": p.background,
    "--sidebar-bg": p.background,
    "--foreground": p.text,
    "--muted-foreground": p.text,
    "--accent-blue": p.accent,
    "--ring": p.accent,
    "--elevated": surface,
    "--elevated-hover": surface,
    "--secondary": surface,
    "--secondary-foreground": p.text,
    "--muted": surface,
    "--input": p.text,
    "--border": mix(p.background, p.text, 0.5),
    "--selection-bg": surface,
    "--callout-bg": surface,
    "--primary": p.text,
    "--primary-foreground": p.background,
    // Syntax highlighting uses tested light/dark code palettes rather than recoloring tokens.
    "--code-bg": dark ? "#0d1218" : "#f5f7fa",
    "--code-foreground": dark ? "#e7ebf2" : "#202b3c",
    "--callout-tip-ink": p.text,
    "--callout-warning-ink": p.text,
  };
}
export function readingStyle(p: Preferences) {
  return {
    ...(p.theme === "custom" ? customPaletteVariables(p.customPalette) : {}),
    "--reader-size": `${p.fontSize}px`,
    "--reader-leading": p.lineHeight,
    "--reader-width": `${p.readingWidth}px`,
    "--reader-font": fontStacks[p.fontFamily],
    "--heading-font": fontStacks[p.headingFont],
    "--reader-code-font": codeFonts[p.codeFont],
    "--paragraph-spacing": `${p.paragraphSpacing}em`,
    "--document-padding": `${p.documentPadding}px`,
  };
}
