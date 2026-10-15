export const fileName = (path: string) => path.split("/").pop() || path;
export function safePath(path: string): string {
  return (
    path
      .replace(/\\/g, "/")
      .split("/")
      .filter((s) => s && s !== "." && s !== "..")
      .join("/") || "Untitled.md"
  );
}
export function resolvePath(from: string, href: string) {
  const stack = href.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const part of decodeURIComponent(href).split("/")) {
    if (part === "..") stack.pop();
    else if (part && part !== ".") stack.push(part);
  }
  return stack.join("/");
}
