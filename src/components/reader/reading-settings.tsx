"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "./modal";
import {
  contrastRatio,
  defaultPreferences,
  validPalette,
  type CustomPalette,
} from "@/lib/preferences";
import type { Preferences, ReaderTheme } from "@/lib/types";
export function ReadingSettings({
  preferences,
  onChange,
  onClose,
}: {
  preferences: Preferences;
  onChange: (change: Partial<Preferences>) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Make yourself at home" onClose={onClose}>
      <p className="dialog-description">
        A reading space that feels like yours. Preferences stay on this device.
      </p>
      <div className="settings-form">
        <label>
          Appearance
          <select
            value={preferences.theme}
            onChange={(e) => onChange({ theme: e.target.value as ReaderTheme })}
          >
            <option value="dark">Midnight · Dark</option>
            <option value="light">Daylight · Light</option>
            <option value="sepia">Warm paper · Sepia</option>
            <option value="paper">Paper · Neutral</option>
            <option value="oled">Lights out · OLED</option>
            <option value="contrast">High contrast</option>
            <option value="system">Match system</option>
            <option value="custom">Custom colors</option>
          </select>
        </label>
        {preferences.theme === "custom" && (
          <PaletteEditor
            palette={preferences.customPalette}
            onApply={(customPalette) => onChange({ customPalette })}
          />
        )}
        <label>
          Body font
          <select
            value={preferences.fontFamily}
            onChange={(e) =>
              onChange({
                fontFamily: e.target.value as "sans" | "serif" | "mono",
              })
            }
          >
            <option value="sans">Sans serif</option>
            <option value="serif">Literary serif</option>
            <option value="mono">Monospace</option>
          </select>
        </label>
        <label>
          Heading font
          <select
            value={preferences.headingFont}
            onChange={(e) =>
              onChange({
                headingFont: e.target.value as Preferences["headingFont"],
              })
            }
          >
            <option value="sans">Sans serif</option>
            <option value="serif">Literary serif</option>
            <option value="mono">Monospace</option>
          </select>
        </label>
        <label>
          Code font
          <select
            value={preferences.codeFont}
            onChange={(e) =>
              onChange({ codeFont: e.target.value as Preferences["codeFont"] })
            }
          >
            <option value="geist">Geist Mono · Bundled</option>
            <option value="system">System monospace</option>
            <option value="courier">Courier</option>
          </select>
        </label>
        <label>
          Text size <span>{preferences.fontSize}px</span>
          <input
            type="range"
            min="12"
            max="24"
            value={preferences.fontSize}
            onChange={(e) => onChange({ fontSize: +e.target.value })}
          />
        </label>
        <label>
          Line spacing <span>{preferences.lineHeight}</span>
          <input
            type="range"
            min="1.3"
            max="2.2"
            step="0.05"
            value={preferences.lineHeight}
            onChange={(e) => onChange({ lineHeight: +e.target.value })}
          />
        </label>
        <label>
          Reading width <span>{preferences.readingWidth}px</span>
          <input
            type="range"
            min="600"
            max="1400"
            step="20"
            value={preferences.readingWidth}
            onChange={(e) => onChange({ readingWidth: +e.target.value })}
          />
        </label>
        <label>
          Paragraph spacing <span>{preferences.paragraphSpacing}em</span>
          <input
            type="range"
            min="0.3"
            max="1.5"
            step="0.1"
            value={preferences.paragraphSpacing}
            onChange={(e) => onChange({ paragraphSpacing: +e.target.value })}
          />
        </label>
        <label>
          Document padding <span>{preferences.documentPadding}px</span>
          <input
            type="range"
            min="12"
            max="64"
            step="2"
            value={preferences.documentPadding}
            onChange={(e) => onChange({ documentPadding: +e.target.value })}
          />
        </label>
      </div>
      <div className="dialog-buttons">
        <Button
          variant="outline"
          onClick={() => onChange({ ...defaultPreferences })}
        >
          Reset defaults
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}

function PaletteEditor({
  palette,
  onApply,
}: {
  palette: CustomPalette;
  onApply: (palette: CustomPalette) => void;
}) {
  const [draft, setDraft] = useState(palette);
  const valid = validPalette(draft);
  const textRatio = contrastRatio(draft.background, draft.text);
  const linkRatio = contrastRatio(draft.background, draft.accent);
  const ratioLabel = (value: number) =>
    (Math.floor(value * 100) / 100).toFixed(2);
  return (
    <fieldset className="custom-palette">
      <legend>Custom colors</legend>
      <p className="dialog-description">
        Choose reading and interface colors. Text and links need at least 4.5:1
        contrast against the background. Code highlighting keeps its light or
        dark palette.
      </p>
      {(
        [
          ["background", "Background color"],
          ["text", "Text color"],
          ["accent", "Accent color"],
        ] as const
      ).map(([key, label]) => (
        <div className="palette-color" key={key}>
          <label>
            {label}
            <input
              value={draft[key]}
              maxLength={7}
              spellCheck={false}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
          <input
            type="color"
            aria-label={`${label} picker`}
            value={
              /^#[0-9a-f]{6}$/i.test(draft[key]) ? draft[key] : palette[key]
            }
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          />
        </div>
      ))}
      <p role="status">
        Text contrast {ratioLabel(textRatio)}:1 · Link contrast{" "}
        {ratioLabel(linkRatio)}:1.{" "}
        {!valid &&
          "Use six-digit hex colors with at least 4.5:1 contrast before applying."}
      </p>
      <Button
        variant="outline"
        disabled={!valid}
        onClick={() => onApply({ ...draft })}
      >
        Apply custom colors
      </Button>
    </fieldset>
  );
}
