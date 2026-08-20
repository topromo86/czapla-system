// Wygląd listów wychodzących z systemu.
//
// Jedna koperta dla wszystkiego, co klub wysyła: reset hasła, potwierdzenie
// adresu, dane do logowania, przypomnienia o zajęciach. Nadawca pisze zwykły
// tekst, a tutaj powstaje z niego wiadomość w barwach klubu - dzięki temu
// treść i wygląd nie mieszają się w kodzie, a nowy rodzaj listu wygląda dobrze
// bez dopisywania ani jednej linijki HTML.
//
// Ograniczenia poczty, których trzymamy się celowo:
//   - układ na tabelach i style pisane przy elementach; klienty pocztowe
//     (zwłaszcza Outlook) nie czytają arkuszy stylów ani flexboxa,
//   - żadnych obrazków - znak firmowy jest napisem, więc widać go także przy
//     zablokowanej grafice, co w Gmailu jest ustawieniem domyślnym dla
//     nieznanych nadawców,
//   - szerokość 600 px, bo tyle mieści okno podglądu w większości programów.

const CZERWIEN = "#ee1d23";
const CIEMNY = "#1d1e21";
const TEKST = "#2b2f36";
const SZARY = "#6b7280";
const TLO = "#f4f5f6";

export const KLUB = {
  nazwa: "Czapla Boxing",
  telefon: "+48 531 026 740",
  adresy: ["ul. Rymera 10, 43-190 Mikołów", "Aleja Niepodległości 188, 43-100 Tychy"],
} as const;

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const URL_WZOR = /https?:\/\/[^\s<]+/g;

// Akapit będący samym odsyłaczem zamieniamy w przycisk - w liście z resetem
// hasła to jedyna rzecz, którą odbiorca ma zrobić, więc ma być widoczna od
// razu, a nie schowana w ścianie tekstu.
function przycisk(url: string, etykieta: string): string {
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
        <tr>
          <td align="center" bgcolor="${CZERWIEN}" style="border-radius:4px;">
            <a href="${esc(url)}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#ffffff;text-decoration:none;">${esc(etykieta)}</a>
          </td>
        </tr>
      </table>`;
}

function akapit(tresc: string): string {
  const zOdsylaczami = esc(tresc).replace(
    URL_WZOR,
    (url) =>
      `<a href="${url}" style="color:${CZERWIEN};text-decoration:underline;word-break:break-all;">${url}</a>`,
  );
  return `      <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${TEKST};">${zOdsylaczami.replace(/\n/g, "<br />")}</p>`;
}

export type EmailContent = {
  subject: string;
  text: string;
  /** Napis na przycisku, gdy w treści jest samotny odsyłacz. */
  buttonLabel?: string;
};

export function renderEmailHtml({ subject, text, buttonLabel }: EmailContent): string {
  const akapity = text
    .split(/\n\s*\n/)
    .map((blok) => blok.trim())
    .filter(Boolean);

  const tresc = akapity
    .map((blok) => {
      const odsylacze = blok.match(URL_WZOR);
      // Sam odsyłacz (ewentualnie z tekstem przed nim w tej samej linii) -
      // pokazujemy przycisk zamiast surowego adresu.
      if (odsylacze?.length === 1 && blok.replace(URL_WZOR, "").trim().length <= 60) {
        const opis = blok.replace(URL_WZOR, "").trim();
        return (
          (opis ? akapit(opis) : "") + przycisk(odsylacze[0], buttonLabel ?? "Otwórz w systemie")
        );
      }
      return akapit(blok);
    })
    .join("\n");

  return `<!doctype html>
<html lang="pl">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:${TLO};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${TLO};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:${CIEMNY};padding:22px 28px;">
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;letter-spacing:0.16em;color:#ffffff;">CZAPLA<span style="color:${CZERWIEN};">BOXING</span></span>
            </td>
          </tr>
          <tr><td style="height:3px;background-color:${CZERWIEN};line-height:3px;font-size:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:19px;line-height:1.3;color:${CIEMNY};">${esc(subject)}</h1>
${tresc}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 26px;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${SZARY};">
                ${esc(KLUB.nazwa)} &middot; tel. ${esc(KLUB.telefon)}<br />
                ${KLUB.adresy.map(esc).join("<br />")}
              </p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${SZARY};">
                Wiadomość wysłana automatycznie z systemu klubu. Możesz na nią odpisać.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
