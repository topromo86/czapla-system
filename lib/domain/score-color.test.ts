import { describe, expect, it } from "vitest";
import { colorForRatio } from "./score-color";

function hslFromHex(hex: string): { hue: number; saturation: number; lightness: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) return { hue: 0, saturation: 0, lightness };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);

  return { hue: (hue + 360) % 360, saturation, lightness };
}

function sampleRamp(step = 0.01): { ratio: number; hex: string }[] {
  const samples: { ratio: number; hex: string }[] = [];
  for (let ratio = 0; ratio <= 1 + 1e-9; ratio += step) {
    samples.push({ ratio, hex: colorForRatio(ratio) });
  }
  return samples;
}

describe("colorForRatio", () => {
  it("czerwień na dole skali (token --red)", () => {
    expect(colorForRatio(0)).toBe("#c8392f");
  });

  it("pomarańcz na 20%", () => {
    expect(colorForRatio(0.2)).toBe("#e06c1a");
  });

  it("żółć na 40%", () => {
    expect(colorForRatio(0.4)).toBe("#edb520");
  });

  it("limonka na 60%", () => {
    expect(colorForRatio(0.6)).toBe("#b5d139");
  });

  it("zieleń na 80%", () => {
    expect(colorForRatio(0.8)).toBe("#5cb548");
  });

  it("jadeit na górze skali (token --jade)", () => {
    expect(colorForRatio(1)).toBe("#1f8a5c");
  });

  it("przycina wartości poniżej 0 do koloru dla 0", () => {
    expect(colorForRatio(-0.5)).toBe(colorForRatio(0));
  });

  it("przycina wartości powyżej 1 do koloru dla 1", () => {
    expect(colorForRatio(1.5)).toBe(colorForRatio(1));
  });

  it("nie ma skoków - sąsiednie wartości różnią się nieznacznie", () => {
    const samples = sampleRamp(0.01);
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1].hex;
      const curr = samples[i].hex;
      const channelDeltas = [1, 3, 5].map((offset) =>
        Math.abs(
          parseInt(prev.slice(offset, offset + 2), 16) -
            parseInt(curr.slice(offset, offset + 2), 16),
        ),
      );
      expect(Math.max(...channelDeltas)).toBeLessThanOrEqual(8);
    }
  });

  // Regresja: interpolacja wprost z bursztynu do jadeitu dawała w okolicy 75%
  // ciemną oliwkę (#748033) - brąz to przyciemniony żółty. W paśmie barw
  // pomarańczowo-żółto-limonkowych jasność musi zostać wysoko, inaczej robi
  // się błoto zamiast czytelnej skali.
  it("nigdy nie robi się brązowa - żółte odcienie zostają jasne", () => {
    for (const { ratio, hex } of sampleRamp(0.01)) {
      const { hue, lightness } = hslFromHex(hex);
      if (hue >= 30 && hue <= 100) {
        expect(
          lightness,
          `${hex} przy ${Math.round(ratio * 100)}% ma odcień ${Math.round(hue)}° i jasność ${Math.round(lightness * 100)}% - to brąz`,
        ).toBeGreaterThanOrEqual(0.45);
      }
    }
  });

  // Mieszanie dwóch nasyconych barw w RGB odsyca środek odcinka - dlatego
  // przystanki są gęste. Bez osobnej zieleni na 0.8 skala spadała tu do 0.39.
  // Mieszanie RGB odsyca środek każdego odcinka, więc przystanki są gęste.
  // Zmierzone minimum całej rampy to 37.7% przy 85% (#4daa4d) - odcień 120°,
  // czyli czysta zieleń, tylko trochę stonowana. Próg 35% pilnuje wyłącznie
  // tego, żeby skala nigdzie nie zeszła do szarości; gdyby ktoś przesuwał
  // przystanki, ten test złapie realne zszarzenie, a nie kosmetykę.
  it("cała skala zostaje nasycona - żadnych szarawych plam", () => {
    for (const { hex } of sampleRamp(0.01)) {
      expect(hslFromHex(hex).saturation).toBeGreaterThanOrEqual(0.35);
    }
  });

  it("odcień rośnie monotonicznie od czerwieni do zieleni", () => {
    const hues = sampleRamp(0.05).map(({ hex }) => hslFromHex(hex).hue);
    for (let i = 1; i < hues.length; i++) {
      expect(hues[i]).toBeGreaterThan(hues[i - 1]);
    }
  });
});
