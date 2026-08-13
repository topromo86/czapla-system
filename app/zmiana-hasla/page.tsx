import { prisma } from "@/lib/prisma";
import { requireSessionRaw } from "@/lib/auth/guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoutButton } from "../logout-button";
import { changePasswordAction } from "./actions";

// Ekran wymuszonej zmiany hasła. Wchodzi się tu z każdego miejsca w aplikacji,
// dopóki konto ma hasło nadane przez klub - strażnik sesji nie przepuszcza
// nigdzie indziej.
//
// Bez nagłówka i menu: dopóki hasło nie jest własne, w systemie nie ma nic do
// oglądania. Zostaje tylko wylogowanie, żeby nikt nie utknął na ekranie, gdy
// zaloguje się nie na to konto.
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ blad?: string }>;
}) {
  const { blad } = await searchParams;
  const session = await requireSessionRaw();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true },
  });

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col justify-center gap-5 p-4">
      <div>
        <h1 className="font-display text-brand-red text-2xl tracking-wide">Ustaw własne hasło</h1>
        <p className="text-muted-brand mt-1 text-sm">
          {user?.mustChangePassword
            ? "Hasło, które dostałeś(-aś) od klubu, zna jeszcze ktoś poza Tobą. Ustaw własne - dopiero wtedy chroni Twoje konto."
            : "Możesz zmienić hasło w dowolnym momencie."}
        </p>
      </div>

      {blad ? (
        <p role="alert" className="border-red/40 bg-red/10 text-red rounded-md border p-3 text-sm">
          {blad}
        </p>
      ) : null}

      <form action={changePasswordAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="password" className="font-mono text-xs tracking-widest uppercase">
            Nowe hasło
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            className="border-line bg-surface-2"
          />
          <p className="text-muted-brand text-xs">Co najmniej 8 znaków, w tym litera i cyfra.</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="repeat" className="font-mono text-xs tracking-widest uppercase">
            Powtórz hasło
          </Label>
          <Input
            id="repeat"
            name="repeat"
            type="password"
            required
            autoComplete="new-password"
            className="border-line bg-surface-2"
          />
        </div>

        <Button type="submit">Zapisz i wejdź do systemu</Button>
      </form>

      <div className="border-line-soft flex items-center justify-between border-t pt-3">
        <span className="text-muted-brand font-mono text-xs">{session.user.name}</span>
        <LogoutButton />
      </div>
    </main>
  );
}
