/** Reveal every native disclosure containing a navigation target before measuring/scrolling it. */
export function revealElement(element: Element | null | undefined) {
  for (
    let parent = element?.parentElement;
    parent;
    parent = parent.parentElement
  )
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  return element;
}
