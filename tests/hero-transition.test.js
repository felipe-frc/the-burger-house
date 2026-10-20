import { describe, expect, it } from "vitest";
import { coverGeometry, nextState, wheelSequence } from "../scripts/transition-photo-scroll.js";

describe("hero state machine", () => {
  it("only starts on downward intent", () => {
    expect(nextState("INITIAL", "finish")).toBe("INITIAL");
    expect(nextState("INITIAL", "down")).toBe("EXPANDING");
  });
  it("does not duplicate an animation or release during expansion", () => {
    expect(nextState("EXPANDING", "down")).toBe("EXPANDING");
    expect(nextState("EXPANDING", "finish")).toBe("EXPANDED");
  });
  it("consumes inertia but releases a fresh gesture", () => {
    expect(nextState("EXPANDED", "down", false)).toBe("EXPANDED");
    expect(nextState("EXPANDED", "down", true)).toBe("RELEASED");
  });
  it("allows escape and predictable reset", () => {
    for (const state of ["INITIAL", "EXPANDING", "EXPANDED", "RELEASED"]) {
      expect(nextState(state, "release")).toBe("RELEASED");
      expect(nextState(state, "reset")).toBe("INITIAL");
    }
  });
  it("measures silence from the last wheel event, not animation completion", () => {
    const sequence = wheelSequence();
    expect(sequence(0)).toBe(true);
    for (let time = 50; time <= 1200; time += 50) expect(sequence(time)).toBe(false);
    expect(sequence(1380)).toBe(true);
  });
});

describe("single image cover geometry", () => {
  it.each([[1440, 796, 500], [390, 744, 351], [768, 800, 450]])(
    "preserves the original crop and aspect ratio at %i px", (width, height, diameter) => {
      const g = coverGeometry(width, height, { width: diameter, height: diameter, x: width / 2, y: 300 }, 1920, 900);
      const cover = Math.max(diameter / 1920, diameter / 900);
      expect(g.width * g.scale).toBeCloseTo(1920 * cover);
      expect(g.height * g.scale).toBeCloseTo(900 * cover);
      expect(g.width / g.height).toBeCloseTo(1920 / 900);
      expect(g.width).toBeGreaterThanOrEqual(width);
      expect(g.height).toBeGreaterThanOrEqual(height);
      expect(g.endRadius).toBeGreaterThan(Math.hypot(width, height) / 2);
    }
  );
});
