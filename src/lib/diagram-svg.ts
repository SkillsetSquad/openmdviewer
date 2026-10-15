import DOMPurify from "dompurify";
export function diagramResourceError(source: string) {
  const decoder = document.createElement("textarea");
  let normalized = source;
  for (let i = 0; i < 3; i++) {
    decoder.innerHTML = normalized;
    normalized = decoder.value
      .replace(/#(?:x([a-f\d]+)|(\d+));/gi, (_, hex, decimal) =>
        String.fromCodePoint(
          Math.min(0x10ffff, parseInt(hex || decimal, hex ? 16 : 10)),
        ),
      )
      .replace(
        /\\(?:u([a-f\d]{4})|x([a-f\d]{2})|([a-f\d]{1,6})\s?)/gi,
        (_, unicode, hex, css) =>
          String.fromCodePoint(
            Math.min(0x10ffff, parseInt(unicode || hex || css, 16)),
          ),
      );
  }
  normalized = normalized.replace(/[\u0000-\u001f\u007f]/g, "");
  return /(?:(?:https?|data|file|blob|javascript):(?=\S)|\/\/|@import|url\s*\(|image-set\s*\(|(?:[{,])\s*(?:img|icon)\s*:|<\/?(?:script|style|foreignObject|image|img|iframe|object|embed)\b)/i.test(
    normalized,
  )
    ? "This diagram contains a URL, image, icon, or active resource. Rendering is disabled; its source remains available."
    : "";
}
const properties = new Set(
  "fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin opacity color background-color font-family font-size font-weight font-style text-decoration text-anchor dominant-baseline alignment-baseline white-space visibility display overflow paint-order filter marker-start marker-mid marker-end".split(
    " ",
  ),
);
function safeValue(value: string) {
  if (/[\\@<>]|(?:expression|image-set)\s*\(/i.test(value)) return false;
  return [...value.matchAll(/url\s*\(([^)]*)\)/gi)].every((match) =>
    /^\s*["']?#[\w:.-]+["']?\s*$/.test(match[1]),
  );
}
function cleanStyle(style: CSSStyleDeclaration) {
  for (const property of Array.from(style))
    if (
      !properties.has(property) ||
      !safeValue(style.getPropertyValue(property))
    )
      style.removeProperty(property);
  return style.cssText;
}
export function cleanDiagramSVG(source: string, id: string) {
  const safe = DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [
      "foreignObject",
      "script",
      "image",
      "a",
      "animate",
      "animateMotion",
      "animateTransform",
      "set",
      "mpath",
      "feImage",
    ],
  });
  const parsed = new DOMParser().parseFromString(safe, "image/svg+xml");
  const svg = parsed.documentElement;
  if (svg.localName !== "svg" || parsed.querySelector("parsererror"))
    throw new Error("The diagram did not produce a valid SVG.");
  for (const element of Array.from(svg.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      if (
        /^(href|xlink:href)$/i.test(attribute.name) &&
        !/^#[\w:.-]+$/.test(attribute.value)
      )
        element.removeAttribute(attribute.name);
      if (/url\s*\(/i.test(attribute.value) && !safeValue(attribute.value))
        element.removeAttribute(attribute.name);
    }
    if (element.hasAttribute("style")) {
      const style = document.createElement("span").style;
      style.cssText = element.getAttribute("style") || "";
      element.setAttribute("style", cleanStyle(style));
    }
  }
  for (const style of Array.from(svg.querySelectorAll("style"))) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(style.textContent || "");
    const rules: string[] = [];
    for (const rule of Array.from(sheet.cssRules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      const selectors = rule.selectorText
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value === `#${id}` || value.startsWith(`#${id} `));
      if (selectors.length)
        rules.push(`${selectors.join(",")}{${cleanStyle(rule.style)}}`);
    }
    style.textContent = rules.join("\n");
  }
  // Mermaid's wrapped SVG labels need an explicit word boundary for text extraction.
  for (const row of Array.from(
    svg.querySelectorAll("tspan.text-outer-tspan"),
  )) {
    if (row.previousElementSibling?.matches("tspan.text-outer-tspan"))
      row.parentNode?.insertBefore(parsed.createTextNode(" "), row);
  }
  // Use intrinsic dimensions for exports; the reader controls presentation size.
  const box = svg.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
  if (
    !box ||
    box.length !== 4 ||
    !box.every(Number.isFinite) ||
    box[2] <= 0 ||
    box[3] <= 0
  )
    throw new Error("Diagram dimensions are unavailable.");
  svg.setAttribute("width", String(box[2]));
  svg.setAttribute("height", String(box[3]));
  svg.removeAttribute("style");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return {
    svg: new XMLSerializer().serializeToString(svg),
    width: box[2],
    height: box[3],
  };
}
export async function diagramPNG(
  svg: string,
  width: number,
  height: number,
  background: string,
) {
  const scale = Math.min(
    2,
    4096 / width,
    4096 / height,
    Math.sqrt(16000000 / (width * height)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNG export is unavailable in this browser.");
  const vectorDocument = new DOMParser().parseFromString(svg, "image/svg+xml");
  vectorDocument.documentElement.setAttribute("width", String(canvas.width));
  vectorDocument.documentElement.setAttribute("height", String(canvas.height));
  const rasterSource = new XMLSerializer().serializeToString(vectorDocument);
  const url = URL.createObjectURL(
    new Blob([rasterSource], { type: "image/svg+xml" }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("The browser could not encode PNG.")),
        "image/png",
      ),
    );
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
