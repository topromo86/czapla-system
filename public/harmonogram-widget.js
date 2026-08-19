/* Harmonogram zajęć dla witryny klubu (czaplaboxing.pl).
 *
 * Strona WordPressa zawiera tylko pusty pojemnik i odsyłacz do tego pliku:
 *
 *   <div id="tfc-harmonogram" data-api="https://panel.czaplaboxing.pl" data-dni="21"></div>
 *   <script src="https://panel.czaplaboxing.pl/harmonogram-widget.js" defer></script>
 *
 * Dzięki temu kod grafiku żyje w repozytorium i jedzie z każdym wdrożeniem,
 * zamiast siedzieć wklejony w bazie WordPressa, gdzie nikt go nie znajdzie
 * i nikt nie zobaczy jego historii.
 *
 * Dane bierze z /api/publiczny/harmonogram - bez logowania i bez niczego
 * o klientach. Zapis prowadzi na /zapis/<id>, gdzie system sam prosi
 * o zalogowanie.
 *
 * Dwa widoki: lista dni (domyślny, czyta się na telefonie) i siatka tygodnia -
 * ta sama, co planner po zalogowaniu, żeby klubowicz widział na stronie klubu
 * dokładnie ten układ, który potem zastanie w panelu.
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

    // Siatka tygodnia - układ jak w plannerze po zalogowaniu.
    "#tfc-harmonogram .tfc-tydzien-pasek{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}",
    "#tfc-harmonogram .tfc-tydzien-nazwa{font-size:14px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}",
    "#tfc-harmonogram .tfc-strzalka{padding:6px 14px;border:1px solid var(--tfc-linia);border-radius:6px;background:transparent;",
    "color:var(--tfc-tekst);font:inherit;font-size:13px;cursor:pointer}",
    "#tfc-harmonogram .tfc-strzalka[disabled]{opacity:.35;cursor:default}",
    "#tfc-harmonogram .tfc-przewijak{overflow-x:auto}",
    "#tfc-harmonogram .tfc-siatka{display:grid;grid-template-columns:56px repeat(7,minmax(120px,1fr));gap:4px;min-width:920px}",
    "#tfc-harmonogram .tfc-kolumna-naglowek{padding:6px 4px;text-align:center;font-size:12px;font-weight:700;",
    "letter-spacing:.06em;text-transform:uppercase;color:var(--tfc-tekst-slaby)}",
    "#tfc-harmonogram .tfc-godzina-etykieta{padding-top:6px;font-size:12px;color:var(--tfc-tekst-slaby);font-variant-numeric:tabular-nums}",
    "#tfc-harmonogram .tfc-komorka{min-height:56px;border:1px dashed rgba(255,255,255,.07);border-radius:4px;padding:3px}",
    "#tfc-harmonogram .tfc-komorka-niska{min-height:24px}",
    "#tfc-harmonogram .tfc-przerwa{grid-column:1/-1;padding:6px 10px;border:1px solid var(--tfc-linia);border-radius:6px;",
    "background:transparent;color:var(--tfc-tekst-slaby);font:inherit;font-size:12px;text-align:left;cursor:pointer}",
    "#tfc-harmonogram .tfc-przerwa:hover{border-color:var(--tfc-czerwien);color:var(--tfc-tekst)}",
    "#tfc-harmonogram .tfc-kafelek{display:block;padding:6px;border:1px solid var(--tfc-linia);border-left:3px solid var(--tfc-czerwien);",
    "border-radius:4px;background:var(--tfc-karta);color:var(--tfc-tekst);text-decoration:none;margin-bottom:3px}",
    "#tfc-harmonogram .tfc-kafelek:hover{background:rgba(238,29,35,.12);border-color:var(--tfc-czerwien)}",
    "#tfc-harmonogram .tfc-kafelek-pelny{opacity:.55}",
    "#tfc-harmonogram .tfc-kafelek b{display:block;font-size:12px;line-height:1.25;text-transform:uppercase}",
    "#tfc-harmonogram .tfc-kafelek span{display:block;font-size:11px;color:var(--tfc-tekst-slaby);line-height:1.3}",

    "@media (max-width:640px){#tfc-harmonogram{padding:40px 16px 56px}",
    "#tfc-harmonogram .tfc-tytul{font-size:28px}",
    "#tfc-harmonogram .tfc-zajecia{align-items:flex-start}",
    "#tfc-harmonogram .tfc-godzina{min-width:0;font-size:18px}",
    "#tfc-harmonogram .tfc-zapis{width:100%;text-align:center}}",
  ].join("");

  var TELEFON_KLUBU = "+48531026740";
  var DZIEN_MS = 24 * 60 * 60 * 1000;

  // Ile pustych godzin z rzędu zwijamy w jeden pasek. Ta sama zasada co
  // w plannerze (lib/domain/schedule.ts, MIN_COLLAPSED_GAP_HOURS): jedna pusta
  // godzina zostaje jako godzina, bo zwinięcie jej zajmuje tyle samo miejsca,
  // a dokłada klikanie.
  var MIN_PRZERWA = 2;
  var GODZINA_OD = 8;
  var GODZINA_DO = 21;

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
      '<div class="tfc-widoki" role="group" aria-label="Sposób wyświetlania"></div>' +
      '<p class="tfc-info">Zapis wymaga konta w systemie klubu.</p></div>' +
      '<div class="tfc-lista" aria-live="polite"><p class="tfc-ladowanie">Wczytuję harmonogram…</p></div>';

    korzen.querySelector(".tfc-tytul").textContent = tytul;
    korzen.querySelector(".tfc-wstep").textContent = wstep;

    var lista = korzen.querySelector(".tfc-lista");
    var filtry = korzen.querySelector(".tfc-filtry");
    var widoki = korzen.querySelector(".tfc-widoki");

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
    // Sama godzina startu (0-23) w czasie klubu - do przypisania zajęć do pasa
    // w siatce. Zajęcia o 18:30 lądują w pasie 18:00, tak jak w plannerze.
    var pasFmt = new Intl.DateTimeFormat("pl-PL", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hourCycle: "h23",
    });
    // Klucz dnia liczony w czasie klubu, a nie w UTC - inaczej zajęcia
    // wieczorne wpadałyby do poprzedniego dnia.
    var kluczDniaFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // Nagłówki kolumn liczymy z klucza dnia (północ UTC), więc formatujemy
    // w UTC - inaczej data przeskakiwałaby o jeden dzień.
    var kolumnaFmt = new Intl.DateTimeFormat("pl-PL", {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
      month: "numeric",
    });
    var zakresFmt = new Intl.DateTimeFormat("pl-PL", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
    });

    var wszystkie = [];
    var wybranaSala = "";
    var widok = "lista";
    var tydzienKlucz = null;
    var rozwiniete = {};

    // Nazwy zajęć i trenerów wpisuje człowiek w panelu klubu, więc trafiają
    // tu jako zwykły tekst - do HTML idą wyłącznie po ucieczce.
    function tekst(wartosc) {
      var el = document.createElement("span");
      el.textContent = wartosc == null ? "" : String(wartosc);
      return el.innerHTML;
    }

    function kluczDnia(data) {
      return kluczDniaFmt.format(data);
    }

    function dataZKlucza(klucz) {
      return new Date(klucz + "T00:00:00Z");
    }

    // Poniedziałek tygodnia, w którym leży dany dzień. Liczone na północy UTC,
    // więc zmiana czasu nie ma tu nic do rzeczy.
    function poniedzialek(klucz) {
      var d = dataZKlucza(klucz);
      var przesuniecie = (d.getUTCDay() + 6) % 7;
      return new Date(d.getTime() - przesuniecie * DZIEN_MS).toISOString().slice(0, 10);
    }

    function przyciskPrzelacznika(pojemnik, etykieta, aktywny, akcja) {
      var przycisk = document.createElement("button");
      przycisk.type = "button";
      przycisk.className = "tfc-filtr";
      przycisk.textContent = etykieta;
      przycisk.setAttribute("aria-pressed", aktywny ? "true" : "false");
      przycisk.addEventListener("click", akcja);
      pojemnik.appendChild(przycisk);
    }

    function rysujFiltry(sale) {
      filtry.innerHTML = "";
      [""].concat(sale).forEach(function (sala) {
        przyciskPrzelacznika(filtry, sala || "Wszystkie", sala === wybranaSala, function () {
          wybranaSala = sala;
          rysujFiltry(sale);
          rysuj();
        });
      });
    }

    function rysujWidoki() {
      widoki.innerHTML = "";
      przyciskPrzelacznika(widoki, "Lista", widok === "lista", function () {
        widok = "lista";
        rysujWidoki();
        rysuj();
      });
      przyciskPrzelacznika(widoki, "Tydzień", widok === "tydzien", function () {
        widok = "tydzien";
        rysujWidoki();
        rysuj();
      });
    }

    function widoczne() {
      return wszystkie.filter(function (z) {
        return !wybranaSala || z.location === wybranaSala;
      });
    }

    function miejscaHtml(z) {
      return z.freeSlots > 0
        ? "wolne miejsca: " + z.freeSlots
        : '<span class="tfc-komplet">brak wolnych miejsc</span>';
    }

    function odsylacz(z) {
      return api + "/zapis/" + encodeURIComponent(z.id);
    }

    // ---------------------------------------------------------------- lista

    function wierszZajec(z) {
      return (
        '<div class="tfc-zajecia">' +
        '<div class="tfc-godzina">' +
        tekst(godzinaFmt.format(new Date(z.startsAt))) +
        "</div>" +
        '<div class="tfc-opis"><span class="tfc-nazwa">' +
        tekst(z.name) +
        '</span><span class="tfc-szczegoly">' +
        tekst(z.location) +
        " · do " +
        tekst(godzinaFmt.format(new Date(z.endsAt))) +
        " · prowadzi " +
        tekst(z.trainer) +
        "</span></div>" +
        '<div class="tfc-miejsca">' +
        miejscaHtml(z) +
        "</div>" +
        '<a class="tfc-zapis" href="' +
        odsylacz(z) +
        '">Zapisz się</a>' +
        "</div>"
      );
    }

    function rysujListe(pozycje) {
      var klucze = [];
      var wgKlucza = {};
      pozycje.forEach(function (z) {
        var klucz = kluczDnia(new Date(z.startsAt));
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

    // --------------------------------------------------------- siatka tygodnia

    function kafelek(z) {
      var pelny = z.freeSlots <= 0;
      return (
        '<a class="tfc-kafelek' +
        (pelny ? " tfc-kafelek-pelny" : "") +
        '" href="' +
        odsylacz(z) +
        '"><b>' +
        tekst(z.name) +
        "</b><span>" +
        tekst(godzinaFmt.format(new Date(z.startsAt))) +
        " · " +
        tekst(z.location) +
        "</span><span>" +
        (pelny ? "komplet" : "wolne: " + z.freeSlots) +
        "</span></a>"
      );
    }

    // Wiersze siatki: godziny z zajęciami, a ciągi pustych godzin (co najmniej
    // MIN_PRZERWA) zwinięte w jeden pasek do rozwinięcia. Bez tego między
    // porannym a wieczornym treningiem stoi pięć pustych pasów.
    function wierszeGodzin(zajete, od, doGodz) {
      var wiersze = [];
      var ciag = [];

      function wypchnij() {
        if (ciag.length === 0) return;
        if (ciag.length >= MIN_PRZERWA) wiersze.push({ rodzaj: "przerwa", godziny: ciag });
        else
          ciag.forEach(function (g) {
            wiersze.push({ rodzaj: "godzina", godzina: g, pusta: true });
          });
        ciag = [];
      }

      for (var g = od; g <= doGodz; g++) {
        if (zajete[g]) {
          wypchnij();
          wiersze.push({ rodzaj: "godzina", godzina: g, pusta: false });
        } else {
          ciag.push(g);
        }
      }
      wypchnij();
      return wiersze;
    }

    function rysujTydzien(pozycje) {
      var tygodnie = {};
      pozycje.forEach(function (z) {
        var klucz = kluczDnia(new Date(z.startsAt));
        var pon = poniedzialek(klucz);
        if (!tygodnie[pon]) tygodnie[pon] = [];
        tygodnie[pon].push(z);
      });

      var dostepne = Object.keys(tygodnie).sort();
      if (dostepne.length === 0) {
        lista.innerHTML =
          '<p class="tfc-pusto">Brak zajęć w tym terminie. Zajrzyj za kilka dni albo zadzwoń do klubu.</p>';
        return;
      }
      if (dostepne.indexOf(tydzienKlucz) === -1) tydzienKlucz = dostepne[0];

      var wTygodniu = tygodnie[tydzienKlucz];
      var pozycjaWZakresie = dostepne.indexOf(tydzienKlucz);

      // Zajęcia poukładane w kratki: dzień + pas godzinowy.
      var kratki = {};
      var zajete = {};
      var minG = 23;
      var maxG = 0;
      wTygodniu.forEach(function (z) {
        var data = new Date(z.startsAt);
        var godz = parseInt(pasFmt.format(data), 10);
        var klucz = kluczDnia(data) + "|" + godz;
        if (!kratki[klucz]) kratki[klucz] = [];
        kratki[klucz].push(z);
        zajete[godz] = true;
        if (godz < minG) minG = godz;
        if (godz > maxG) maxG = godz;
      });

      var od = minG <= maxG ? minG : GODZINA_OD;
      var doGodz = minG <= maxG ? Math.min(23, maxG + 1) : GODZINA_DO;

      var dniTygodnia = [];
      for (var i = 0; i < 7; i++) {
        dniTygodnia.push(
          new Date(dataZKlucza(tydzienKlucz).getTime() + i * DZIEN_MS).toISOString().slice(0, 10),
        );
      }

      var html =
        '<div class="tfc-tydzien-pasek">' +
        '<button type="button" class="tfc-strzalka" data-krok="-1"' +
        (pozycjaWZakresie === 0 ? " disabled" : "") +
        ">← poprzedni</button>" +
        '<span class="tfc-tydzien-nazwa">' +
        tekst(
          zakresFmt.format(dataZKlucza(dniTygodnia[0])) +
            " – " +
            zakresFmt.format(dataZKlucza(dniTygodnia[6])),
        ) +
        "</span>" +
        '<button type="button" class="tfc-strzalka" data-krok="1"' +
        (pozycjaWZakresie === dostepne.length - 1 ? " disabled" : "") +
        ">następny →</button>" +
        "</div>";

      html += '<div class="tfc-przewijak"><div class="tfc-siatka">';
      html += '<div class="tfc-kolumna-naglowek"></div>';
      dniTygodnia.forEach(function (klucz) {
        html +=
          '<div class="tfc-kolumna-naglowek">' +
          tekst(kolumnaFmt.format(dataZKlucza(klucz))) +
          "</div>";
      });

      wierszeGodzin(zajete, od, doGodz).forEach(function (wiersz) {
        if (wiersz.rodzaj === "przerwa") {
          // Pasek przerwy zostaje na ekranie także po rozwinięciu - inaczej
          // rozwinięte godziny nie miałyby czym się zwinąć z powrotem.
          var otwarta = rozwiniete[tydzienKlucz + "|" + wiersz.godziny[0]] === true;
          html +=
            '<button type="button" class="tfc-przerwa" data-przerwa="' +
            wiersz.godziny[0] +
            '">' +
            (otwarta ? "▴ " : "▾ ") +
            wiersz.godziny.length +
            " godz. bez zajęć (" +
            wiersz.godziny[0] +
            ":00 – " +
            (wiersz.godziny[wiersz.godziny.length - 1] + 1) +
            ":00) — " +
            (otwarta ? "zwiń" : "rozwiń") +
            "</button>";
          if (!otwarta) return;
        }

        var godziny = wiersz.rodzaj === "przerwa" ? wiersz.godziny : [wiersz.godzina];
        godziny.forEach(function (godz) {
          var pusty = !zajete[godz];
          html +=
            '<div class="tfc-godzina-etykieta">' + (godz < 10 ? "0" + godz : godz) + ":00</div>";
          dniTygodnia.forEach(function (klucz) {
            var w = kratki[klucz + "|" + godz] || [];
            html +=
              '<div class="tfc-komorka' +
              (pusty ? " tfc-komorka-niska" : "") +
              '">' +
              w.map(kafelek).join("") +
              "</div>";
          });
        });
      });

      html += "</div></div>";
      lista.innerHTML = html;

      Array.prototype.forEach.call(lista.querySelectorAll(".tfc-strzalka"), function (przycisk) {
        przycisk.addEventListener("click", function () {
          var krok = parseInt(przycisk.getAttribute("data-krok"), 10);
          var nowa = pozycjaWZakresie + krok;
          if (nowa < 0 || nowa >= dostepne.length) return;
          tydzienKlucz = dostepne[nowa];
          rysuj();
        });
      });

      Array.prototype.forEach.call(lista.querySelectorAll(".tfc-przerwa"), function (przycisk) {
        przycisk.addEventListener("click", function () {
          var klucz = tydzienKlucz + "|" + przycisk.getAttribute("data-przerwa");
          rozwiniete[klucz] = rozwiniete[klucz] !== true;
          rysuj();
        });
      });
    }

    function rysuj() {
      var pozycje = widoczne();

      if (pozycje.length === 0) {
        lista.innerHTML =
          '<p class="tfc-pusto">Brak zajęć w tym terminie. Zajrzyj za kilka dni albo zadzwoń do klubu.</p>';
        return;
      }

      if (widok === "tydzien") rysujTydzien(pozycje);
      else rysujListe(pozycje);
    }

    fetch(api + "/api/publiczny/harmonogram?dni=" + encodeURIComponent(dni))
      .then(function (odpowiedz) {
        if (!odpowiedz.ok) throw new Error("HTTP " + odpowiedz.status);
        return odpowiedz.json();
      })
      .then(function (dane) {
        wszystkie = dane.sessions || [];
        rysujFiltry(dane.locations || []);
        rysujWidoki();
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
