import test from "node:test";
import assert from "node:assert/strict";
import {
  decorationsEqual,
  parseHighlights,
  resolveOverlappingHighlights,
  segmentText,
  TAG_MARKER,
} from "./highlighting.mjs";

test("resolveOverlappingHighlights picks priority then longest", () => {
  const resolved = resolveOverlappingHighlights([
    {
      id: "a",
      entityType: "movie",
      entityId: "m1",
      start: 0,
      end: 6,
      displayText: "abc123",
      source: "title",
      priority: 1,
    },
    {
      id: "b",
      entityType: "book",
      entityId: "b1",
      start: 0,
      end: 4,
      displayText: "abc1",
      source: "title",
      priority: 2,
    },
    {
      id: "c",
      entityType: "movie",
      entityId: "m2",
      start: 8,
      end: 12,
      displayText: "tail",
      source: "title",
      priority: 0,
    },
  ]);

  assert.equal(resolved.length, 2);
  assert.equal(resolved[0].id, "b");
  assert.equal(resolved[1].id, "c");
});

test("parseHighlights is deterministic and non-overlapping", () => {
  const text = `Watched ${TAG_MARKER}Dune then ${TAG_MARKER}Dune: Part Two`;
  const entities = [
    {
      id: "e1",
      entityType: "movie",
      entityId: "dune-2",
      terms: ["Dune: Part Two", "Dune"],
      priority: 2,
      source: "title",
    },
  ];

  const first = parseHighlights(text, entities);
  const second = parseHighlights(text, entities);

  assert.ok(decorationsEqual(first, second));
  assert.equal(first.length, 2);
  assert.equal(first[0].displayText, "Dune");
  assert.equal(first[1].displayText, "Dune: Part Two");
});

test("segmentText preserves all characters and boundaries", () => {
  const text = `I loved ${TAG_MARKER}The Bear and ${TAG_MARKER}The Bear S1E1`;
  const decorations = parseHighlights(text, [
    {
      id: "tv-1",
      entityType: "tv",
      entityId: "the-bear",
      terms: ["The Bear", "The Bear S1E1"],
      priority: 2,
      source: "title",
    },
  ]);

  const segments = segmentText(text, decorations);
  const rebuilt = segments.map((segment) => segment.text).join("");
  assert.equal(rebuilt, text);
  assert.ok(segments.some((segment) => segment.type === "highlight"));
});

test("partial edit simulation drops invalid intersecting highlight", () => {
  const original = `Read ${TAG_MARKER}Project Hail Mary`;
  const entities = [
    {
      id: "book-1",
      entityType: "book",
      entityId: "project-hail-mary",
      terms: ["Project Hail Mary"],
      priority: 1,
      source: "title",
    },
  ];

  const before = parseHighlights(original, entities);
  assert.equal(before.length, 1);

  const edited = "Read Project h Mary";
  const after = parseHighlights(edited, entities);
  assert.equal(after.length, 0);
});


test("parseHighlights ignores untagged duplicate words", () => {
  const text = `I drove through Nebraska and listened to ${TAG_MARKER}Nebraska`;
  const entities = [{
    id: "music-1",
    entityType: "music",
    entityId: "nebraska",
    terms: ["Nebraska"],
    priority: 1,
    source: "title",
  }];

  const decorations = parseHighlights(text, entities);
  assert.equal(decorations.length, 1);
  assert.equal(decorations[0].displayText, "Nebraska");
  assert.equal(text.slice(decorations[0].start, decorations[0].end), "Nebraska");
});
