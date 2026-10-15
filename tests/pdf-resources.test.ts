import { expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import { PdfResourceFactory } from "../src/lib/pdf-resources";
it("loads one fixed-origin resource pack, rejects arbitrary requests and returns independent bytes for repeated parser calls", async () => {
  const zip = zipSync({
    "cmaps/Known.bcmap": new Uint8Array([1, 2, 3]),
    "standard_fonts/Known.pfb": new Uint8Array([4, 5]),
  });
  const fetcher = vi.fn(
    async () => new Response(new Blob([zip as BlobPart]), { status: 200 }),
  );
  vi.stubGlobal("self", {
    location: {
      href: "https://reader.invalid/openmdviewer/conversion-worker.js",
    },
  });
  vi.stubGlobal("fetch", fetcher);
  try {
    const factory = new PdfResourceFactory();
    await expect(
      factory.fetch({ kind: "cMapUrl", filename: "../../private" }),
    ).rejects.toThrow("Unsupported");
    await expect(
      factory.fetch({ kind: "wasmUrl", filename: "unknown.wasm" }),
    ).rejects.toThrow("Unsupported");
    expect(fetcher).not.toHaveBeenCalled();
    const first = await factory.fetch({
      kind: "cMapUrl",
      filename: "Known.bcmap",
    });
    first[0] = 99;
    expect(
      await factory.fetch({ kind: "cMapUrl", filename: "Known.bcmap" }),
    ).toEqual(new Uint8Array([1, 2, 3]));
    expect(
      await factory.fetch({
        kind: "standardFontDataUrl",
        filename: "Known.pfb",
      }),
    ).toEqual(new Uint8Array([4, 5]));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://reader.invalid/openmdviewer/pdf-resources.zip"),
      { credentials: "omit", mode: "same-origin" },
    );
    await expect(
      factory.fetch({ kind: "cMapUrl", filename: "Missing.bcmap" }),
    ).rejects.toThrow("unavailable");
  } finally {
    vi.unstubAllGlobals();
  }
});
