import { expect, test } from "vitest";
import { rankByScreen, type Place } from "./queue";

const HEIGHT = 800;

/** Blocks as they sit in a page scrolled to `scrollY`: id -> page position. */
function page(blocks: Record<string, [top: number, main?: boolean]>, scrollY: number) {
  return (id: string): Place | undefined => {
    const block = blocks[id];
    if (!block) return undefined;
    const [top, main = true] = block;
    return { top: top - scrollY, bottom: top - scrollY + 100, main };
  };
}

const article: Record<string, [number, boolean?]> = {
  intro: [0],
  p1: [200],
  p2: [400],
  middle1: [3000],
  middle2: [3200],
  middle3: [3400],
  end: [9000],
};

test("scrolling back up moves the screen's blocks ahead of the ones queued first", () => {
  // Translation started mid-page, so the middle was queued first; then the reader scrolled to the top.
  const queue = ["middle1", "middle2", "middle3", "intro", "p1", "p2"];
  rankByScreen(queue, page(article, 0), HEIGHT);
  expect(queue).toEqual(["intro", "p1", "p2", "middle1", "middle2", "middle3"]);
});

test("off-screen blocks wait, nearest first, above or below", () => {
  const queue = ["end", "intro", "middle3", "middle1"];
  // Screen shows 3000-3800: middle1 and middle3 are on it; intro ends 2900 px above it, end starts 5200 px below.
  rankByScreen(queue, page(article, 3000), HEIGHT);
  expect(queue).toEqual(["middle1", "middle3", "intro", "end"]);
});

test("main content goes before navigation on the same screen, and blocks that left the page go last", () => {
  const blocks: Record<string, [number, boolean?]> = {
    nav: [10, false],
    text: [300],
    below: [900],
  };
  const queue = ["gone", "below", "nav", "text"];
  rankByScreen(queue, page(blocks, 0), HEIGHT);
  expect(queue).toEqual(["text", "nav", "below", "gone"]);
});

test("a block cut by the top of the screen counts as on screen", () => {
  const blocks: Record<string, [number, boolean?]> = { reading: [-50], next: [600] };
  const queue = ["next", "reading"];
  rankByScreen(queue, page(blocks, 0), HEIGHT);
  expect(queue).toEqual(["reading", "next"]);
});
