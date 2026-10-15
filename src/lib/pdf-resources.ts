import { unzipSync } from "fflate";
let resources: Promise<Record<string, Uint8Array>> | undefined;
/** Public PDF.js BinaryDataFactory API. Only packaged, fixed-origin assets can be requested. */
export class PdfResourceFactory {
  async fetch({ kind, filename }: { kind: string; filename: string }) {
    const folder =
      kind === "cMapUrl"
        ? "cmaps"
        : kind === "standardFontDataUrl"
          ? "standard_fonts"
          : null;
    if (
      !folder ||
      !filename ||
      /[\\/\0]/.test(filename) ||
      filename.includes("..")
    )
      throw new Error("Unsupported PDF resource request.");
    resources ||= fetch(new URL("./pdf-resources.zip", self.location.href), {
      credentials: "omit",
      mode: "same-origin",
    }).then(async (response) => {
      if (!response.ok)
        throw new Error(
          "The local PDF resources are unavailable. Finish caching the app before retrying offline.",
        );
      return unzipSync(new Uint8Array(await response.arrayBuffer()));
    });
    const data = (await resources)[`${folder}/${filename}`];
    if (!data)
      throw new Error(
        "A required PDF character map or standard font is unavailable.",
      );
    return data.slice();
  }
}
