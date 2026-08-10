// Odmiana rzeczownika po liczbie. Polski ma trzy formy i regułę z wyjątkiem na
// nastki: 1 wejście, 2-4 wejścia, 5-21 wejść, ale 22-24 wejścia i 12-14 wejść.
//
// Osobny moduł, bo interfejs jest po polsku w całości i takich miejsc będzie
// przybywać - lepsza jedna reguła niż trzy kopie tego samego `if`.

export type PluralForms = {
  /** 1 */
  one: string;
  /** 2-4 (poza nastkami) */
  few: string;
  /** reszta */
  many: string;
};

export function plural(count: number, forms: PluralForms): string {
  const abs = Math.abs(count);
  if (abs === 1) return forms.one;
  const last = abs % 10;
  const lastTwo = abs % 100;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return forms.few;
  return forms.many;
}
