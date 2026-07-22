import type { MemberLevel } from "@/app/generated/prisma/client";
import { MEMBER_LEVELS } from "@/lib/domain/member-level";

// Legenda poziomów: odznaka w kolorze, nazwa i krótki opis, w kolejności awansu.
// Gdy podano `current`, poziom danej osoby jest wyróżniony ("Twój poziom").
// Prezentacyjny, bez stanu - można wstawić w dowolnym miejscu (Postępy, karta
// klienta itp.).
export function LevelLegend({ current }: { current?: MemberLevel }) {
  return (
    <ul className="border-line divide-line bg-surface flex flex-col divide-y rounded-md border">
      {MEMBER_LEVELS.map((level) => {
        const isCurrent = current === level.value;
        return (
          <li
            key={level.value}
            className={`flex items-start gap-3 p-3 ${isCurrent ? "bg-brand-red/5" : ""}`}
          >
            <span
              aria-hidden
              className="border-line mt-0.5 inline-block size-4 shrink-0 rounded-full border"
              style={{ backgroundColor: level.color }}
            />
            <div className="min-w-0">
              <p className="text-text text-sm font-medium">
                {level.label}
                {isCurrent ? (
                  <span className="text-brand-red ml-2 font-mono text-xs tracking-widest uppercase">
                    Twój poziom
                  </span>
                ) : null}
              </p>
              <p className="text-muted-brand mt-0.5 text-sm">{level.description}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
