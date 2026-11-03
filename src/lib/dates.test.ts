import { describe, expect, it } from "vitest";
import { localDateISO } from "./dates";

describe("localDateISO", () => {
  it("uses the local calendar day, not UTC", () => {
    const justAfterMidnight = new Date(2026, 10, 4, 0, 30);   // 4 Nov 00:30 local
    expect(localDateISO(justAfterMidnight)).toBe("2026-11-04");
  });
});
