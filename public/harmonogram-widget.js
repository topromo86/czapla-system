/* Harmonogram zajęć dla witryny klubu (czaplaboxing.pl).
 *
 * Strona WordPressa zawiera tylko pusty pojemnik i odsyłacz do tego pliku:
 *
 *   <div id="tfc-harmonogram" data-api="https://czapla-system.vercel.app" data-dni="21"></div>
 *   <script src="https://czapla-system.vercel.app/harmonogram-widget.js" defer></script>
 *
 * Dzięki temu kod grafiku żyje w repozytorium i jedzie z każdym wdrożeniem,
 * zamiast siedzieć wklejony w bazie WordPressa, gdzie nikt go nie znajdzie
 * i nikt nie zobaczy jego historii.
 *
 * Dane bierze z /api/publiczny/harmonogram - bez logowania i bez niczego
 * o klientach. Zapis prowadzi na /zapis/<id>, gdzie system sam prosi
 * o zalogowanie.
 *
 * Czysty ES5 i bez zależności: skrypt ma wystartować na starym telefonie
 * w przeglądarce, której nikt tu nie testuje.
 */
(function () {
  "use strict";

  var STYLE = [
    "#tfc-harmonogram{--tfc-czerwien:#ee1d23;--tfc-tekst:#fff;--tfc-tekst-slaby:#a9adb4;",
    "--tfc-linia:rgba(255,255,255,.14);--tfc-karta:rgba(255,255,255,.04);color:var(--tfc-tekst);font-size:16px;",
    // Szablon strony w motywie oddaje treść na całą szerokość okna, więc
    // szerokość i marginesy musi wziąć na siebie sam grafik - inaczej na
    // desktopie tekst kleiłby się do krawędzi ekranu.
    "max-width:1200px;margin:0 auto;padding:56px 20px 72px;box-sizing:border-box}",
    "#tfc-harmonogram .tfc-tytul{margin:0 0 8px;color:var(--tfc-tekst);font-size:36px;font-weight:800;",
    "font-style:italic;letter-spacing:.02em;text-transform:uppercase;line-height:1.1}",
    "#tfc-harmonogram .tfc-wstep{margin:0 0 32px;color:var(--tfc-tekst-slaby);font-size:15px;max-width:56ch}",
    "#tfc-harmonogram .tfc-pasek{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:28px}",
    "#tfc-harmonogram .tfc-filtry{display:flex;flex-wrap:wrap;gap:8px}",
    "#tfc-harmonogram .tfc-filtr{padding:8px 18px;border:1px solid var(--tfc-linia);border-radius:999px;background:transparent;",
    "color:var(--tfc-tekst);font:inherit;font-size:13px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}",
    "#tfc-harmonogram .tfc-filtr:hover{border-color:var(--tfc-czerwien)}",
    '#tfc-harmonogram .tfc-filtr[aria-pressed="true"]{background:var(--tfc-czerwien);border-color:var(--tfc-czerwien);color:#fff}',
    "#tfc-harmonogram .tfc-info{margin:0;color:var(--tfc-tekst-slaby);font-size:13px}",
    "#tfc-harmonogram .tfc-dzien{margin-bottom:28px}",
    "#tfc-harmonogram .tfc-dzien-naglowek{margin:0 0 10px;padding-bottom:8px;border-bottom:1px solid var(--tfc-linia);",
    "color:var(--tfc-czerwien);font-size:14px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}",
    "#tfc-harmonogram .tfc-zajecia{display:flex;align-items:center;flex-wrap:wrap;gap:8px 18px;padding:14px 16px;margin-bottom:8px;",
    "background:var(--tfc-karta);border:1px solid var(--tfc-linia);border-left:3px solid var(--tfc-czerwien);border-radius:6px}",
    "#tfc-harmonogram .tfc-godzina{min-width:84px;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}",
    "#tfc-harmonogram .tfc-opis{flex:1 1 220px}",
    "#tfc-harmonogram .tfc-nazwa{display:block;font-weight:700;text-transform:uppercase}",
    "#tfc-harmonogram .tfc-szczegoly{display:block;margin-top:2px;color:var(--tfc-tekst-slaby);font-size:13px}",
    "#tfc-harmonogram .tfc-miejsca{font-size:13px;color:var(--tfc-tekst-slaby);white-space:nowrap}",
    "#tfc-harmonogram .tfc-komplet{color:var(--tfc-czerwien)}",
    "#tfc-harmonogram .tfc-zapis{padding:10px 22px;border:1px solid var(--tfc-czerwien);border-radius:4px;background:var(--tfc-czerwien);",
    "color:#fff;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;white-space:nowrap}",
    "#tfc-harmonogram .tfc-zapis:hover{background:transparent;color:var(--tfc-czerwien)}",
    "#tfc-harmonogram .tfc-ladowanie,#tfc-harmonogram .tfc-pusto,#tfc-harmonogram .tfc-blad{padding:24px 0;color:var(--tfc-tekst-slaby)}",
    "@media (max-width:640px){#tfc-harmonogram .tfc-zajecia{align-items:flex-start}",
    "#tfc-harmonogram .tfc-godzina{min-width:0;font-size:18px}",
    "#tfc-harmonogram .tfc-zapis{width:100%;text-align:center}}",
  ].join("");

  var TELEFON_KLUBU = "+48531026740";

  function start() {
    var korzen = document.getElementById("tfc-harmonogram");
    if (!korzen || korzen.getAttribute("data-gotowe") === "1") return;
    korzen.setAttribute("data-gotowe", "1");

    var styl = document.createElement("style");
    styl.textContent = STYLE;
    document.head.appendChild(styl);

    var api = korzen.getAttribute("data-api") || "";
    var dni = korzen.getAttribute("data-dni") || "21";

    var tytul = korzen.getAttribute("data-tytul") || "Harmonogram zajęć";
    var wstep =
      korzen.getAttribute("data-wstep") ||
      "Zajęcia grupowe w Mikołowie i Tychach. Grafik jest żywy - pokazuje to, co realnie odbędzie się w klubie, razem z liczbą wolnych miejsc.";

    korzen.innerHTML =
      '<h1 class="tfc-tytul"></h1><p class="tfc-wstep"></p>' +
      '<div class="tfc-pasek"><div class="tfc-filtry" role="group" aria-label="Wybór sali"></div>' +
      '<p class="tfc-info">Zapis wymaga konta w systemie klubu.</p></div>' +
      '<div class="tfc-lista" aria-live="polite"><p class="tfc-ladowanie">Wczytuję harmonogram…</p></div>';

    korzen.querySelector(".tfc-tytul").textContent = tytul;
    korzen.querySelector(".tfc-wstep").textContent = wstep;

    var lista = korzen.querySelector(".tfc-lista");
    var filtry = korzen.querySelector(".tfc-filtry");

    var dzienFmt = new Intl.DateTimeFormat("pl-PL", {
      timeZone: "Europe/Warsaw",
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    var godzinaFmt = new Intl.DateTimeFormat("pl-PL", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      minute: "2-digit",
    });
    // Klucz dnia liczony w czasie klubu, a nie w UTC - inaczej zajęcia
    // wieczorne wpadałyby do poprzedniego dnia.
    var kluczDniaFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    var wszystkie = [];
    var wybranaSala = "";

    // Nazwy zajęć i trenerów wpisuje człowiek w panelu klubu, więc trafiają
    // tu jako zwykły tekst - do HTML idą wyłącznie po ucieczce.
    function tekst(wartosc) {
      var el = document.createElement("span");
      el.textContent = wartosc == null ? "" : String(wartosc);
      return el.innerHTML;
    }

    function rysujFiltry(sale) {
      var pozycje = [""].concat(sale);
      filtry.innerHTML = "";
      pozycje.forEach(function (sala) {
        var przycisk = document.createElement("button");
        przycisk.type = "button";
        przycisk.className = "tfc-filtr";
        przycisk.textContent = sala || "Wszystkie";
        przycisk.setAttribute("aria-pressed", sala === wybranaSala ? "true" : "false");
        przycisk.addEventListener("click", function () {
          wybranaSala = sala;
          rysujFiltry(sale);
          rysuj();
        });
        filtry.appendChild(przycisk);
      });
    }

    function wierszZajec(z) {
      var start = new Date(z.startsAt);
      var koniec = new Date(z.endsAt);
      var miejsca =
        z.freeSlots > 0
          ? "wolne miejsca: " + z.freeSlots
          : '<span class="tfc-komplet">brak wolnych miejsc</span>';

      return (
        '<div class="tfc-zajecia">' +
        '<div class="tfc-godzina">' +
        tekst(godzinaFmt.format(start)) +
        "</div>" +
        '<div class="tfc-opis"><span class="tfc-nazwa">' +
        tekst(z.name) +
        '</span><span class="tfc-szczegoly">' +
        tekst(z.location) +
        " · do " +
        tekst(godzinaFmt.format(koniec)) +
        " · prowadzi " +
        tekst(z.trainer) +
        "</span></div>" +
        '<div class="tfc-miejsca">' +
        miejsca +
        "</div>" +
        '<a class="tfc-zapis" href="' +
        api +
        "/zapis/" +
        encodeURIComponent(z.id) +
        '">Zapisz się</a>' +
        "</div>"
      );
    }

    function rysuj() {
      var widoczne = wszystkie.filter(function (z) {
        return !wybranaSala || z.location === wybranaSala;
      });

      if (widoczne.length === 0) {
        lista.innerHTML =
          '<p class="tfc-pusto">Brak zajęć w tym terminie. Zajrzyj za kilka dni albo zadzwoń do klubu.</p>';
        return;
      }

      var klucze = [];
      var wgKlucza = {};
      widoczne.forEach(function (z) {
        var klucz = kluczDniaFmt.format(new Date(z.startsAt));
        if (!wgKlucza[klucz]) {
          wgKlucza[klucz] = { etykieta: dzienFmt.format(new Date(z.startsAt)), pozycje: [] };
          klucze.push(klucz);
        }
        wgKlucza[klucz].pozycje.push(z);
      });

      lista.innerHTML = klucze
        .map(function (klucz) {
          var dzien = wgKlucza[klucz];
          return (
            '<div class="tfc-dzien"><h3 class="tfc-dzien-naglowek">' +
            tekst(dzien.etykieta) +
            "</h3>" +
            dzien.pozycje.map(wierszZajec).join("") +
            "</div>"
          );
        })
        .join("");
    }

    fetch(api + "/api/publiczny/harmonogram?dni=" + encodeURIComponent(dni))
      .then(function (odpowiedz) {
        if (!odpowiedz.ok) throw new Error("HTTP " + odpowiedz.status);
        return odpowiedz.json();
      })
      .then(function (dane) {
        wszystkie = dane.sessions || [];
        rysujFiltry(dane.locations || []);
        rysuj();
      })
      .catch(function () {
        lista.innerHTML =
          '<p class="tfc-blad">Nie udało się wczytać harmonogramu. Odśwież stronę albo zadzwoń do klubu: ' +
          '<a href="tel:' +
          TELEFON_KLUBU +
          '">' +
          TELEFON_KLUBU +
          "</a>.</p>";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
