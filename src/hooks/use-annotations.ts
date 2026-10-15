"use client";
import { useEffect, useState, type RefObject } from "react";
import { readingText, locateQuote } from "@/lib/annotation-dom";
import type { ReaderAnnotation } from "@/lib/types";
export type AnnotationLocation =
  "found" | "missing" | "ambiguous" | "document" | "source";
export function useAnnotations(
  root: RefObject<HTMLElement | null>,
  annotations: ReaderAnnotation[] | undefined,
  content: string,
  rendered: boolean,
  documentId: string,
) {
  const [locations, setLocations] = useState<
    Record<string, AnnotationLocation>
  >(() => Object.create(null) as Record<string, AnnotationLocation>);
  useEffect(() => {
    const element = root.current;
    let frame = 0;
    const refresh = () => {
      const next = Object.create(null) as Record<string, AnnotationLocation>;
      const ranges: Range[] = [];
      const index =
        element && annotations?.length ? readingText(element) : null;
      for (const item of annotations || []) {
        if (!rendered || !element || !index) {
          next[item.id] = "source";
          continue;
        }
        if (item.quote) {
          const match = locateQuote(index, item.quote);
          next[item.id] = match.status;
          if (match.range && item.kind === "highlight")
            ranges.push(match.range);
        } else if (item.kind === "bookmark" && item.heading) {
          next[item.id] = Array.from(element.querySelectorAll("[id]")).some(
            (e) => e.id === item.heading,
          )
            ? "found"
            : "missing";
        } else next[item.id] = "document";
      }
      if (typeof Highlight !== "undefined" && CSS.highlights) {
        CSS.highlights.delete("reader-notes");
        if (ranges.length)
          CSS.highlights.set("reader-notes", new Highlight(...ranges));
      }
      setLocations((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refresh);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    if (element && annotations?.length)
      observer.observe(element, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (typeof CSS !== "undefined" && CSS.highlights)
        CSS.highlights.delete("reader-notes");
    };
  }, [root, annotations, content, rendered, documentId]);
  return locations;
}
