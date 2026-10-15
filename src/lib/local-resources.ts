import { resolvePath } from "./paths";
export interface LocalResource {
  reference: string;
  url?: string;
  path?: string;
  host?: string;
  source: "imported" | "bundled" | "remote" | "unavailable";
}
export function describeResource(
  reference: string,
  sourcePath: string,
  assets: Record<string, string>,
): LocalResource {
  const item: LocalResource = { reference, source: "unavailable" };
  if (/^(https?:\/\/|\/\/)/i.test(reference)) {
    try {
      const url = new URL(
        reference.startsWith("//") ? `https:${reference}` : reference,
      );
      if (
        !url.username &&
        !url.password &&
        ["http:", "https:"].includes(url.protocol)
      )
        return {
          ...item,
          source: "remote",
          url: url.href,
          host: url.host,
          path: url.pathname,
        };
    } catch {}
    return item;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(reference)) return item;
  try {
    const path = resolvePath(sourcePath, reference.split(/[?#]/)[0]);
    const url = assets[path];
    if (url?.startsWith("blob:"))
      return {
        ...item,
        source: "imported",
        path,
        url:
          url +
          (reference.includes("#")
            ? reference.slice(reference.indexOf("#"))
            : ""),
      };
    return { ...item, path };
  } catch {
    return item;
  }
}
