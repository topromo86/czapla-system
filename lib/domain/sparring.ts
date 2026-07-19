// Dobór par sparingowych - SPEC.md sekcja 2 "Dobór par sparingowych":
// kandydaci to status=ACTIVE, !isMinor, sparringClearedAt != null (filtr
// robi wywołujący - patrz app/trainer/sparingi). Tu tylko sam algorytm: ta
// sama level + różnica weightKg <= 4 kg, sortuj po wadze, paruj zachłannie
// (kolejne pary po posortowaniu, nie najlepsze możliwe dopasowanie).

export const MAX_WEIGHT_DIFF_KG = 4;

export type SparringCandidate = {
  id: string;
  level: string;
  weightKg: number | null;
};

export type SparringPairingResult<T extends SparringCandidate> = {
  pairs: [T, T][];
  unpaired: T[];
};

function greedyPairSortedByWeight<T extends SparringCandidate>(
  sortedByWeight: T[],
): { pairs: [T, T][]; unpaired: T[] } {
  const pairs: [T, T][] = [];
  const unpaired: T[] = [];
  let i = 0;
  while (i < sortedByWeight.length) {
    const current = sortedByWeight[i];
    const next = sortedByWeight[i + 1];
    if (next && next.weightKg! - current.weightKg! <= MAX_WEIGHT_DIFF_KG) {
      pairs.push([current, next]);
      i += 2;
    } else {
      unpaired.push(current);
      i += 1;
    }
  }
  return { pairs, unpaired };
}

// Brak wagi = nie da się bezpiecznie ocenić różnicy - kandydat trafia od razu
// do "bez pary" (lista zadań dla trenera: dopisz wagę, żeby dało się sparować).
export function pairSparringCandidates<T extends SparringCandidate>(
  candidates: T[],
): SparringPairingResult<T> {
  const withWeight = candidates.filter((c) => c.weightKg != null);
  const withoutWeight = candidates.filter((c) => c.weightKg == null);

  const byLevel = new Map<string, T[]>();
  for (const c of withWeight) {
    const arr = byLevel.get(c.level) ?? [];
    arr.push(c);
    byLevel.set(c.level, arr);
  }

  const pairs: [T, T][] = [];
  const unpaired: T[] = [...withoutWeight];

  for (const group of byLevel.values()) {
    const sorted = [...group].sort((a, b) => a.weightKg! - b.weightKg!);
    const result = greedyPairSortedByWeight(sorted);
    pairs.push(...result.pairs);
    unpaired.push(...result.unpaired);
  }

  return { pairs, unpaired };
}
