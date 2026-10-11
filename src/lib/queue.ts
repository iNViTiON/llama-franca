/**
 * Fork: page blocks wait in a queue for a free request slot. Ordering it by where each block is at that moment, not
 * by when it scrolled into view, makes the next request follow the reader: scroll away mid-translation and what is
 * on screen now goes next. Requests already sent keep running.
 */
export interface Place {
  /** Viewport coordinates, as from getBoundingClientRect. */
  top: number;
  bottom: number;
  /** Inside main or article content, which goes before navigation and sidebars on the same screen. */
  main: boolean;
}

/**
 * Sorts `queue` in place: blocks on screen first (main content, then the rest, each top to bottom), then off-screen
 * blocks nearest first, then blocks that left the page (`place` returns undefined).
 */
export function rankByScreen<T>(
  queue: T[],
  place: (item: T) => Place | undefined,
  viewportHeight: number,
) {
  const keys = new Map(queue.map((item) => [item, rank(place(item), viewportHeight)] as const));
  return queue.sort((a, b) => {
    const [tierA, orderA] = keys.get(a)!;
    const [tierB, orderB] = keys.get(b)!;
    return tierA - tierB || orderA - orderB;
  });
}

function rank(place: Place | undefined, height: number): [number, number] {
  if (!place) return [3, 0];
  const { top, bottom, main } = place;
  if (bottom > 0 && top < height) return [main ? 0 : 1, top];
  return [2, top >= height ? top - height : -bottom];
}
