import { cleanDiagramSVG, diagramResourceError } from "./diagram-svg";
let queue: Promise<unknown> = Promise.resolve();
export function renderDiagram(id: string, source: string, dark: boolean) {
  const work = queue.then(async () => {
    if (source.length > 50000)
      throw new Error(
        "Diagram source exceeds the 50,000-character rendering limit.",
      );
    const blocked = diagramResourceError(source);
    if (blocked) throw new Error(blocked);
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: dark ? "dark" : "neutral",
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      fontFamily: "Arial, sans-serif",
      maxTextSize: 50000,
      maxEdges: 500,
      suppressErrorRendering: true,
      secure: [
        "secure",
        "dompurifyConfig",
        "securityLevel",
        "startOnLoad",
        "theme",
        "themeVariables",
        "themeCSS",
        "htmlLabels",
        "flowchart",
        "fontFamily",
        "maxTextSize",
        "maxEdges",
      ],
    });
    const { svg } = await mermaid.render(id, source);
    return cleanDiagramSVG(svg, id);
  });
  queue = work.catch(() => {});
  return work;
}
