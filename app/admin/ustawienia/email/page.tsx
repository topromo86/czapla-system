import { Check, X } from "lucide-react";
import { requireRole } from "@/lib/auth/guard";
import { describeSmtpStatus, isEmailConfigured, readSmtpConfig } from "@/lib/services/notify";
import { Button } from "@/components/ui/button";
import { PROSE_WIDTH } from "../../../shell";
import { sendTestEmailAction } from "./actions";

export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; blad?: string }>;
}) {
  await requireRole("ADMIN");
  const { ok, blad } = await searchParams;

  const fields = describeSmtpStatus();
  const configured = isEmailConfigured();
  const config = readSmtpConfig();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-brand-red font-[family-name:var(--font-anton)] text-2xl uppercase">
          Powiadomienia e-mail
        </h1>
        <p className="text-muted-brand mt-1 text-sm">
          Konfiguracja serwera poczty, przez który system wysyła przypomnienia i propozycje zapisu.
        </p>
      </div>

      {ok ? (
        <p className="border-jade bg-surface text-text rounded-md border p-3 text-sm">{ok}</p>
      ) : null}
      {blad ? (
        <p className="border-red bg-surface text-text rounded-md border p-3 text-sm">
          <b className="text-red">Błąd:</b> {blad}
        </p>
      ) : null}

      <section
        className={`rounded-md border p-4 ${
          configured ? "border-jade bg-surface" : "border-amber bg-surface"
        }`}
      >
        <p className="text-text text-sm font-medium">
          {configured ? (
            <>
              <Check className="text-jade mr-1 inline size-4" />
              Poczta jest skonfigurowana.
            </>
          ) : (
            <>
              <X className="text-amber mr-1 inline size-4" />
              Poczta nie jest jeszcze gotowa - brakuje wymaganych pól poniżej.
            </>
          )}
        </p>
        {configured && config ? (
          <p className="text-muted-brand mt-1 font-mono text-xs">
            Wysyłka z: {config.from} · przez {config.host}:{config.port}
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Stan konfiguracji
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {fields.map((field) => (
            <li
              key={field.key}
              className="border-line bg-surface flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="text-text text-sm font-medium">
                  {field.label}
                  {!field.required ? (
                    <span className="text-muted-brand ml-2 font-mono text-[10px] tracking-widest uppercase">
                      opcjonalne
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-brand font-mono text-xs">
                  {field.key}
                  {field.value ? ` = ${field.value}` : ""}
                </p>
              </div>
              {field.set ? (
                <span className="text-jade font-mono text-xs tracking-widest uppercase">
                  <Check className="mr-1 inline size-3" />
                  ustawione
                </span>
              ) : (
                <span
                  className={`font-mono text-xs tracking-widest uppercase ${
                    field.required ? "text-red" : "text-muted-brand"
                  }`}
                >
                  <X className="mr-1 inline size-3" />
                  {field.required ? "brak - wymagane" : "brak - użyje domyślnej"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Wyślij test
        </h2>
        <p className="text-muted-brand mt-1 text-sm">
          Wyśle testową wiadomość na adres nadawcy
          {config ? (
            <>
              {" "}
              (<b className="text-text">{config.from}</b>)
            </>
          ) : null}
          , czyli na skrzynkę klubu. Zobaczysz dokładnie to, co dostaną klienci.
          {configured
            ? " Jeśli coś jest nie tak, pokażemy komunikat błędu z serwera."
            : " Najpierw uzupełnij konfigurację - bez tego test nie ma czego wysłać."}
        </p>
        <form action={sendTestEmailAction} className="mt-3">
          <Button type="submit" disabled={!configured}>
            Wyślij wiadomość testową
          </Button>
        </form>
      </section>

      <section>
        <h2 className="text-muted-brand font-mono text-xs tracking-widest uppercase">
          Co ustawić na hostingu
        </h2>
        <div className={`${PROSE_WIDTH} text-muted-brand mt-2 flex flex-col gap-3 text-sm`}>
          <p>
            System czyta dane serwera poczty ze zmiennych środowiskowych. Ustaw je w panelu hostingu
            (sekcja &bdquo;Zmienne środowiskowe&rdquo; albo w pliku <code>.env</code> na serwerze) i
            zrestartuj aplikację. Wzór wszystkich zmiennych jest w pliku <code>.env.example</code> w
            repozytorium.
          </p>

          <div className="border-line bg-surface-2 overflow-x-auto rounded-md border p-3">
            <pre className="text-text font-mono text-xs whitespace-pre">
              {`SMTP_HOST="poczta.twojadomena.pl"   # serwer wychodzący z panelu hostingu
SMTP_PORT="587"                     # 587 = STARTTLS (typowe), 465 = SSL
SMTP_USER="powiadomienia@twojadomena.pl"
SMTP_PASSWORD="haslo-do-skrzynki"
SMTP_FROM="Czapla Boxing <powiadomienia@twojadomena.pl>"`}
            </pre>
          </div>

          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>
              <b className="text-text">SMTP_HOST</b> i <b className="text-text">SMTP_PORT</b>{" "}
              znajdziesz w panelu hostingu przy danych konta e-mail (&bdquo;serwer poczty
              wychodzącej&rdquo; / SMTP). Zwykle port 587.
            </li>
            <li>
              <b className="text-text">SMTP_USER</b> i <b className="text-text">SMTP_PASSWORD</b> to
              pełny adres skrzynki i jej hasło. Najlepiej załóż osobną skrzynkę tylko do wysyłki,
              np. <code>powiadomienia@…</code>.
            </li>
            <li>
              <b className="text-text">SMTP_FROM</b> to adres widoczny dla klientów jako nadawca.
              Większość hostingów wymaga, żeby zgadzał się z <b className="text-text">SMTP_USER</b>{" "}
              - inaczej wiadomości trafią do spamu albo zostaną odrzucone.
            </li>
          </ul>

          <p>
            Po ustawieniu zmiennych i restarcie wróć tutaj: pola powyżej pokażą się jako
            &bdquo;ustawione&rdquo;, a przycisk testu się odblokuje.
          </p>
        </div>
      </section>
    </div>
  );
}
