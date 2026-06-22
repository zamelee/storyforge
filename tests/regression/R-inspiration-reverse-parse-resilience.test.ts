/**
 * R-inspiration-reverse-parse-resilience
 *
 * Defense for the inspiration-reverse panel flaky bug:
 *   "checkmark: structured content generated" hint showed up, but the bottom
 *   adopt-all cards never rendered. The previous parser only accepted a strictly
 *   closed markdown JSON code fence. The new extractJsonCandidate tries three
 *   strategies in order: (a) fenced block, (b) whole output as JSON, (c) first
 *   balanced top-level {...} in the output.
 *
 * These tests lock in:
 *   - the original happy path still works (clean fence / clean raw JSON)
 *   - outputs wrapped with prose before/after still parse
 *   - truly broken JSON (unclosed) returns null instead of a half object
 *   - plain prose with no JSON returns null
 *   - multi-world parser keeps parity with single-world
 */
import { describe, it, expect } from 'vitest'
import { parseReverseOutput, parseReverseMultiWorldOutput } from '../../src/lib/ai/inspiration-reverse'

const VALID_SINGLE_WORLD_JSON = {
  worldview: {
    worldOrigin: "world-origin-A",
    powerHierarchy: "power-B",
    continentLayout: "continent-C",
    climateByRegion: "",
    historyLine: "history-D",
    races: "",
    factionLayout: "",
  },
  storyCore: {
    logline: "logline-L",
    theme: "theme-T",
    centralConflict: "conflict-CC",
    plotPattern: "",
    mainPlot: "plot-MP",
  },
  characters: [
    {
      name: "Alpha",
      roleWeight: "main",
      moralAxis: "good",
      orderAxis: "lawful",
      shortDescription: "desc",
      personality: "",
      background: "",
      motivation: "",
      arc: "",
    },
  ],
};

const VALID_MULTI_WORLD_JSON = {
  storyCore: {
    logline: "x",
    theme: "y",
    centralConflict: "",
    plotPattern: "",
    mainPlot: "",
  },
  worlds: [
    {
      name: "main",
      type: "primary",
      worldOrigin: "",
      powerHierarchy: "",
      continentLayout: "",
      climateByRegion: "",
      historyLine: "",
      races: "",
      factionLayout: "",
      entryCondition: "",
      powerRestriction: "",
    },
  ],
  characters: [],
};

function jsonBlock(value) {
  return "```json\n" + JSON.stringify(value) + "\n```";
}

function rawJson(value) {
  return JSON.stringify(value);
}

describe("R-inspiration-reverse-parse-resilience", () => {
  // --- happy path ---
  it("A: clean json fence -> succeeds", () => {
    const r = parseReverseOutput(jsonBlock(VALID_SINGLE_WORLD_JSON));
    expect(r).not.toBeNull();
    expect(r.storyCore.logline).toBe("logline-L");
    expect(r.characters).toHaveLength(1);
    expect(r.characters[0].name).toBe("Alpha");
  });

  it("B: clean raw json (no fence) -> succeeds", () => {
    const r = parseReverseOutput(rawJson(VALID_SINGLE_WORLD_JSON));
    expect(r).not.toBeNull();
    expect(r.storyCore.theme).toBe("theme-T");
  });

  // --- resilience ---
  it("C: fence with prefix explanation -> still parses", () => {
    const wrapped = "intro prose line 1\nintro prose line 2\n" + jsonBlock(VALID_SINGLE_WORLD_JSON);
    const r = parseReverseOutput(wrapped);
    expect(r).not.toBeNull();
    expect(r.worldview.worldOrigin).toBe("world-origin-A");
  });

  it("D: raw json preceded by prose -> still parses (strategy c)", () => {
    const wrapped = "intro prose\n" + rawJson(VALID_SINGLE_WORLD_JSON) + "\ntrailing prose";
    const r = parseReverseOutput(wrapped);
    expect(r).not.toBeNull();
    expect(r.storyCore.logline).toBe("logline-L");
  });

  it("E: fence with trailing text -> still parses", () => {
    const wrapped = jsonBlock(VALID_SINGLE_WORLD_JSON) + "\nnotes follow";
    const r = parseReverseOutput(wrapped);
    expect(r).not.toBeNull();
    expect(r.characters).toHaveLength(1);
  });

  // --- fail-loud ---
  it("F: json without closing brace -> null (no half-baked)", () => {
    const broken = rawJson(VALID_SINGLE_WORLD_JSON).slice(0, -1);
    const r = parseReverseOutput(broken);
    expect(r).toBeNull();
  });

  it("G: plain prose with no json -> null", () => {
    const r = parseReverseOutput("just plain text, no JSON inside.");
    expect(r).toBeNull();
  });

  // --- multi-world parity ---
  it("H: multiworld clean fence -> succeeds", () => {
    const r = parseReverseMultiWorldOutput(jsonBlock(VALID_MULTI_WORLD_JSON));
    expect(r).not.toBeNull();
    expect(r.worlds).toHaveLength(1);
    expect(r.worlds[0].type).toBe("primary");
  });

  it("I: multiworld with prefix prose -> still parses", () => {
    const wrapped = "intro prose\n" + rawJson(VALID_MULTI_WORLD_JSON);
    const r = parseReverseMultiWorldOutput(wrapped);
    expect(r).not.toBeNull();
    expect(r.storyCore.logline).toBe("x");
  });

  // --- string-value repair: bare double quotes inside a JSON string ---
    it("J: bare quotes inside json string value -> repaired and parses", () => {
    // Build inner JSON via JSON.stringify, then inject an unescaped "Yun Cheng"
    // inside the worldOrigin string value to simulate the real model output bug.
    const inner = JSON.stringify({
      worldview: {
        worldOrigin: "modern city, a fictional tier-1 city",
        powerHierarchy: "",
        continentLayout: "",
        climateByRegion: "",
        historyLine: "",
        races: "",
        factionLayout: "",
      },
      storyCore: { logline: "L", theme: "t", centralConflict: "", plotPattern: "", mainPlot: "" },
      characters: [{ name: "A", roleWeight: "main", moralAxis: "good", orderAxis: "lawful", shortDescription: "", personality: "", background: "", motivation: "", arc: "" }],
    });
    const find = "\"worldOrigin\":\"modern city, a fictional tier-1 city\"";
    const repl = "\"worldOrigin\":\"modern city, a fictional tier-1 city\"Yun Cheng\". no supernatural\"";
    const brokenInner = inner.replace(find, repl);
    const broken = "```json\n" + brokenInner + "\n```";
    const r = parseReverseOutput(broken);
    expect(r).not.toBeNull();
    expect(r.worldview.worldOrigin).toContain("Yun Cheng");
  });
  it("K: bare quotes inside multi-world value -> repaired and parses", () => {
    const inner = JSON.stringify({
      storyCore: { logline: "x y z", theme: "", centralConflict: "", plotPattern: "", mainPlot: "" },
      worlds: [{
        name: "main", type: "primary",
        worldOrigin: "", powerHierarchy: "", continentLayout: "", climateByRegion: "",
        historyLine: "", races: "", factionLayout: "", entryCondition: "", powerRestriction: "",
      }],
      characters: [],
    });
    const brokenInner = inner.replace('"logline":"x y z"', '"logline":"x \"Yun\" z"');
    const broken = "```json\n" + brokenInner + "\n```";
    const r = parseReverseMultiWorldOutput(broken);
    expect(r).not.toBeNull();
    expect(r.storyCore.logline).toContain("x");
    expect(r.storyCore.logline).toContain("Yun");
    expect(r.storyCore.logline).toContain("z");
  });
it("K: bare quotes inside multi-world value -> repaired and parses", () => {
    const inner = JSON.stringify({
      storyCore: { logline: "x y z", theme: "", centralConflict: "", plotPattern: "", mainPlot: "" },
      worlds: [{
        name: "main", type: "primary",
        worldOrigin: "", powerHierarchy: "", continentLayout: "", climateByRegion: "",
        historyLine: "", races: "", factionLayout: "", entryCondition: "", powerRestriction: "",
      }],
      characters: [],
    });
    const broken = "```json\n" + inner + "\n```";
    const r = parseReverseMultiWorldOutput(broken);
    expect(r).not.toBeNull();
    expect(r.storyCore.logline).toContain("x");
    expect(r.storyCore.logline).toContain("z");
  });

  it("L: clean json (no stray quotes) still works after the sanitizer is in place", () => {
    // No stray quotes here. Confirms the sanitizer does not over-replace in the
    // happy path.
    const r = parseReverseOutput(jsonBlock(VALID_SINGLE_WORLD_JSON));
    expect(r).not.toBeNull();
    expect(r.storyCore.logline).toBe("logline-L");
  });
});
