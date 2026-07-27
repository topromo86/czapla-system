import Link from "next/link";

// Przełącznik widoku dla właściciela, który jest jednocześnie adminem i trenerem
// (jedno konto - Daniel). NIE zmienia roli konta ani zapisu w logach; po prostu
// przechodzi między panelem admina a panelem trenera. Guard przepuszcza ADMINA
// z rekordem trenera do ekranów /trainer (patrz requireTrainerSelf), więc oba
// widoki są w pełni funkcjonalne w tej samej sesji.
export function AccountViewSwitch({ current }: { current: "admin" | "trainer" }) {
  const item = "rounded px-2.5 py-1 font-mono text-[11px] tracking-widest uppercase transition";
  const active = "bg-brand-red text-white";
  const idle = "text-muted-brand hover:text-brand-red";
  return (
    <div
      className="border-line flex items-center gap-0.5 rounded-md border p-0.5"
      title="Przełącz widok: administrator / trener"
    >
      <Link href="/admin" className={`${item} ${current === "admin" ? active : idle}`}>
        Admin
      </Link>
      <Link href="/trainer" className={`${item} ${current === "trainer" ? active : idle}`}>
        Trener
      </Link>
    </div>
  );
}
