import { describe, expect, it } from "vitest";
import { MAX_WEIGHT_DIFF_KG, pairSparringCandidates, type SparringCandidate } from "./sparring";

function candidate(id: string, level: string, weightKg: number | null): SparringCandidate {
  return { id, level, weightKg };
}

describe("pairSparringCandidates", () => {
  it("pusta lista daje puste wyniki", () => {
    expect(pairSparringCandidates([])).toEqual({ pairs: [], unpaired: [] });
  });

  it("paruje dwie osoby tego samego poziomu w granicy wagi", () => {
    const a = candidate("a", "YELLOW", 70);
    const b = candidate("b", "YELLOW", 73);
    const result = pairSparringCandidates([a, b]);
    expect(result.pairs).toEqual([[a, b]]);
    expect(result.unpaired).toEqual([]);
  });

  it(`nie paruje przy różnicy wagi > ${MAX_WEIGHT_DIFF_KG}kg`, () => {
    const a = candidate("a", "YELLOW", 70);
    const b = candidate("b", "YELLOW", 75);
    const result = pairSparringCandidates([a, b]);
    expect(result.pairs).toEqual([]);
    expect(result.unpaired).toEqual([a, b]);
  });

  it("różnica dokładnie na granicy nadal się paruje", () => {
    const a = candidate("a", "YELLOW", 70);
    const b = candidate("b", "YELLOW", 74);
    const result = pairSparringCandidates([a, b]);
    expect(result.pairs).toEqual([[a, b]]);
  });

  it("nie paruje różnych poziomów mimo identycznej wagi", () => {
    const a = candidate("a", "YELLOW", 70);
    const b = candidate("b", "ORANGE", 70);
    const result = pairSparringCandidates([a, b]);
    expect(result.pairs).toEqual([]);
    expect(result.unpaired).toHaveLength(2);
  });

  it("nieparzysta liczba - ostatni po sortowaniu zostaje bez pary", () => {
    const a = candidate("a", "YELLOW", 60);
    const b = candidate("b", "YELLOW", 62);
    const c = candidate("c", "YELLOW", 64);
    const result = pairSparringCandidates([c, a, b]);
    expect(result.pairs).toEqual([[a, b]]);
    expect(result.unpaired).toEqual([c]);
  });

  it("paruje zachłannie kolejno po posortowaniu, nie optymalnie", () => {
    // Posortowane: 60, 63, 64, 68. Zachłannie: (60,63) diff 3 OK, (64,68) diff 4 OK.
    const a = candidate("a", "YELLOW", 60);
    const b = candidate("b", "YELLOW", 63);
    const c = candidate("c", "YELLOW", 64);
    const d = candidate("d", "YELLOW", 68);
    const result = pairSparringCandidates([a, b, c, d]);
    expect(result.pairs).toEqual([
      [a, b],
      [c, d],
    ]);
    expect(result.unpaired).toEqual([]);
  });

  it("brak wagi - kandydat trafia bezpośrednio do unpaired", () => {
    const a = candidate("a", "YELLOW", 70);
    const noWeight = candidate("b", "YELLOW", null);
    const result = pairSparringCandidates([a, noWeight]);
    expect(result.pairs).toEqual([]);
    expect(result.unpaired).toContain(noWeight);
    expect(result.unpaired).toContain(a);
  });

  it("wiele poziomów jednocześnie - paruje osobno w każdej grupie", () => {
    const a = candidate("a", "YELLOW", 70);
    const b = candidate("b", "YELLOW", 71);
    const c = candidate("c", "ORANGE", 80);
    const d = candidate("d", "ORANGE", 82);
    const result = pairSparringCandidates([a, b, c, d]);
    expect(result.pairs).toHaveLength(2);
    expect(result.unpaired).toEqual([]);
  });
});
