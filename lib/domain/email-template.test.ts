import { describe, expect, it } from "vitest";
import { renderEmailHtml } from "./email-template";

describe("renderEmailHtml", () => {
  it("dzieli tekst na akapity po pustej linii", () => {
    const html = renderEmailHtml({
      subject: "Test",
      text: "Pierwszy akapit.\n\nDrugi akapit.",
    });
    expect(html.match(/<p /g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Pierwszy akapit.");
    expect(html).toContain("Drugi akapit.");
  });

  it("samotny odsyłacz zamienia w przycisk z podanym napisem", () => {
    const html = renderEmailHtml({
      subject: "Reset hasła",
      text: "Cześć,\n\nhttps://panel.czaplaboxing.pl/reset-hasla/abc123",
      buttonLabel: "Ustaw nowe hasło",
    });
    expect(html).toContain("Ustaw nowe hasło");
    expect(html).toContain('href="https://panel.czaplaboxing.pl/reset-hasla/abc123"');
  });

  it("odsyłacz w środku zdania zostaje odsyłaczem, a nie przyciskiem", () => {
    const html = renderEmailHtml({
      subject: "Test",
      text: "Grafik zajęć znajdziesz na https://czaplaboxing.pl/harmonogram-zajec/ i tam też się zapiszesz na trening.",
      buttonLabel: "Otwórz",
    });
    expect(html).not.toContain(">Otwórz<");
    expect(html).toContain('href="https://czaplaboxing.pl/harmonogram-zajec/"');
  });

  it("ucieka znaki HTML z treści i tematu", () => {
    const html = renderEmailHtml({
      subject: "<script>alert(1)</script>",
      text: "Imię: <b>Jan</b> & Anna",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;Jan&lt;/b&gt; &amp; Anna");
  });

  it("zawiera dane klubu w stopce", () => {
    const html = renderEmailHtml({ subject: "Test", text: "Treść." });
    expect(html).toContain("Czapla Boxing");
    expect(html).toContain("+48 531 026 740");
    expect(html).toContain("Mikołów");
  });
});
