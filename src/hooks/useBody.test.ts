import { describe, expect, it } from "vitest";
import { rollingAverage, weightsByDay } from "./useBody";

describe("body log", () => {
  it("takes the first weigh-in of each day and ignores water", () => {
    const by = weightsByDay([
      { day: "2026-11-10", measured_at: "2026-11-10T20:00:00Z", value: 83.5, metric: "weight" },
      { day: "2026-11-10", measured_at: "2026-11-10T06:30:00Z", value: 82.0, metric: "weight" },
      { day: "2026-11-10", measured_at: "2026-11-10T07:00:00Z", value: 500, metric: "water" },
    ]);
    expect(by).toEqual({ "2026-11-10": 82.0 });
  });
  it("averages the last 7 days up to each weigh-in", () => {
    const pts = rollingAverage({ "2026-11-01": 84, "2026-11-05": 83, "2026-11-10": 82 });
    expect(pts.map((p) => p.avg)).toEqual([84, 83.5, 82.5]);   // 1 Nov is more than 6 days before 10 Nov
  });
});
