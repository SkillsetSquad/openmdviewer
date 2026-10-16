import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  customPaletteDark,
  customPaletteVariables,
  defaultPreferences,
  parsePreferences,
  validPalette,
} from "../src/lib/preferences";

describe("local reading preferences", () => {
  it("migrates older preferences and tolerates malformed storage values", () => {
    for (const value of [null, [], "oops", 42, false])
      expect(parsePreferences(value)).toEqual(defaultPreferences);
    const old = parsePreferences({
      theme: "sepia",
      fontFamily: "serif",
      fontSize: 18,
      lineHeight: 2,
      readingWidth: 900,
    });
    expect(old).toMatchObject({
      theme: "sepia",
      fontFamily: "serif",
      fontSize: 18,
      headingFont: "serif",
      codeFont: "geist",
      documentPadding: 28,
      paragraphSpacing: 0.6,
    });
    expect(parsePreferences({ theme: "paper" }).theme).toBe("paper");
  });
  it("accepts only fixed fonts and clamps every numeric control", () => {
    expect(
      parsePreferences({
        theme: "url(evil)",
        fontFamily: "__proto__",
        headingFont: "toString",
        codeFont: "url(evil)",
        fontSize: 100,
        lineHeight: 0,
        readingWidth: -1,
        documentPadding: 1000,
        paragraphSpacing: -5,
      }),
    ).toMatchObject({
      theme: "dark",
      fontFamily: "sans",
      headingFont: "sans",
      codeFont: "geist",
      fontSize: 24,
      lineHeight: 1.3,
      readingWidth: 600,
      documentPadding: 64,
      paragraphSpacing: 0.3,
    });
    expect(
      parsePreferences({
        fontSize: NaN,
        lineHeight: Infinity,
        readingWidth: "1200",
      }),
    ).toEqual(defaultPreferences);
  });
  it("measures known contrast ratios symmetrically and rejects CSS payloads", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBe(21);
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#123456", "#123456")).toBe(1);
    for (const color of [
      "red",
      "#fff",
      "url(https://evil.invalid)",
      "#fff; color:red",
      null,
      {},
      "#gggggg",
    ]) {
      expect(
        validPalette({ background: color, text: "#000000", accent: "#000000" }),
      ).toBe(false);
    }
    expect(
      validPalette({
        background: "#ffffff",
        text: "#eeeeee",
        accent: "#000000",
      }),
    ).toBe(false);
    expect(
      validPalette({
        background: "#ffffff",
        text: "#000000",
        accent: "#eeeeee",
      }),
    ).toBe(false);
    expect(
      parsePreferences({
        theme: "custom",
        customPalette: {
          background: "#ffffff",
          text: "#eeeeee",
          accent: "#eeeeee",
        },
      }).customPalette,
    ).toEqual(defaultPreferences.customPalette);
  });
  it("preserves contrast on derived surfaces for dark, light and near-threshold palettes", () => {
    const palettes = [
      defaultPreferences.customPalette,
      { background: "#ffffff", text: "#111111", accent: "#245ea1" },
      { background: "#ffffff", text: "#767676", accent: "#767676" },
      { background: "#000000", text: "#757575", accent: "#757575" },
      { background: "#24183b", text: "#f5eaff", accent: "#e2b8ff" },
    ];
    for (const palette of palettes) {
      expect(validPalette(palette)).toBe(true);
      const vars = customPaletteVariables(palette);
      for (const key of [
        "--app-bg",
        "--sidebar-bg",
        "--elevated",
        "--elevated-hover",
        "--selection-bg",
        "--callout-bg",
      ]) {
        expect(contrastRatio(vars[key], palette.text)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrastRatio(vars[key], palette.accent)).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
    expect(customPaletteDark(palettes[0])).toBe(true);
    expect(customPaletteDark(palettes[1])).toBe(false);
  });
  it("copies only recognized color keys from saved input", () => {
    const value = {
      ...defaultPreferences.customPalette,
      untrusted: "url(https://evil.invalid)",
    };
    const parsed = parsePreferences({ customPalette: value });
    expect(parsed.customPalette).toEqual(defaultPreferences.customPalette);
  });
});
