import { it, expect } from "vitest";
import { describeImage, imageFileName } from "../src/lib/images";
it("resolves imported images against workspace paths without treating arbitrary schemes or blob URLs as trusted assets", () => {
  const assets = {
    "Docs/image space.svg": "blob:local-id",
    "root.png": "blob:root-id",
  };
  expect(
    describeImage("image%20space.svg#shape", "Shape", "Docs/Readme.md", assets),
  ).toMatchObject({
    source: "imported",
    url: "blob:local-id#shape",
    path: "Docs/image space.svg",
  });
  expect(describeImage("/root.png", "Root", "Docs/Readme.md", assets).url).toBe(
    "blob:root-id",
  );
  for (const reference of [
    "blob:unknown",
    "javascript:alert(1)",
    "data:image/png;base64,aaa",
    "file:///private/picture.png",
  ])
    expect(
      describeImage(reference, "", "Docs/R.md", assets).url,
    ).toBeUndefined();
  expect(describeImage("missing.png", "", "Docs/R.md", assets).source).toBe(
    "unavailable",
  );
});
it("labels remote URLs for consent and derives safe original download names", () => {
  const image = describeImage(
    "//images.example.test/photo?size=2",
    "Photo",
    "R.md",
    {},
  );
  expect(image).toMatchObject({
    source: "remote",
    host: "images.example.test",
    url: "https://images.example.test/photo?size=2",
  });
  expect(imageFileName(image, "image/jpeg")).toBe("photo.jpg");
  expect(
    describeImage(
      "https://user:secret@images.example.test/photo",
      "",
      "R.md",
      {},
    ).url,
  ).toBeUndefined();
  expect(
    imageFileName({
      reference: "",
      alt: "",
      source: "imported",
      path: "Docs/bad%2Fname.svg",
    }),
  ).toBe("bad_name.svg");
  expect(describeImage("asset:alpine-lake", "", "R.md", {}).source).toBe(
    "bundled",
  );
});
