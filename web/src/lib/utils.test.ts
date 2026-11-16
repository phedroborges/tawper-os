import { describe, expect, it } from "vitest";
import { splitNumber } from "./utils";

describe("splitNumber", () => {
  it("separa o número de valores já formatados", () => {
    expect(splitNumber(12)).toEqual({ pre: "", n: 12, dec: 0, post: "" });
    expect(splitNumber("3%")).toEqual({ pre: "", n: 3, dec: 0, post: "%" });
    expect(splitNumber("R$ 1,2 mi")).toEqual({ pre: "R$ ", n: 1.2, dec: 1, post: " mi" });
    expect(splitNumber("1.234")).toEqual({ pre: "", n: 1234, dec: 0, post: "" });
    expect(splitNumber("0 ✓")).toEqual({ pre: "", n: 0, dec: 0, post: " ✓" });
  });

  it("deixa passar o que não é um número só", () => {
    expect(splitNumber("—")).toBeNull();
    expect(splitNumber("15/11")).toBeNull();
    expect(splitNumber("2 de 5")).toBeNull();
    expect(splitNumber("12.5")).toBeNull();
    expect(splitNumber(null)).toBeNull();
  });
});
