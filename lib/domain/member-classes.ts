// Na jakie zajęcia chodzi klubowicz.
//
// Właściciel chce ustawić kartotekę „po zajęciach": zobaczyć, kto trzyma się
// Kids Boxingu, a kto Women Boxingu, i wywołać całą grupę na raz. Dane są w
// zapisach (Booking → Session → rodzaj zajęć); tutaj zamieniamy je na obraz
// „ten klient chodzi na to i to".
//
// Liczą się zapisy nieodwołane. Odwołany zapis mówi tylko tyle, że ktoś się
// rozmyślił - nie że tam chodzi.

export type ClassVisit = {
  memberId: string;
  className: string;
};

export type AttendedClass = {
  name: string;
  visits: number;
};

// Nagłówek dla klientów bez ani jednego zapisu. Nie chowamy ich - właściciel
// ma zobaczyć, że ktoś kupił karnet i nie chodzi nigdzie.
export const NO_CLASS_LABEL = "Bez zajęć";

// memberId -> zajęcia, od najczęstszych. Remis rozstrzyga nazwa, żeby lista
// nie skakała między odświeżeniami.
export function groupAttendedClasses(visits: readonly ClassVisit[]): Map<string, AttendedClass[]> {
  const counters = new Map<string, Map<string, number>>();

  for (const visit of visits) {
    let perMember = counters.get(visit.memberId);
    if (!perMember) {
      perMember = new Map();
      counters.set(visit.memberId, perMember);
    }
    perMember.set(visit.className, (perMember.get(visit.className) ?? 0) + 1);
  }

  const result = new Map<string, AttendedClass[]>();
  for (const [memberId, perMember] of counters) {
    const classes = [...perMember.entries()]
      .map(([name, count]) => ({ name, visits: count }))
      .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name, "pl"));
    result.set(memberId, classes);
  }
  return result;
}

// Zajęcia, z którymi klient jest najmocniej związany - po nich grupujemy listę.
export function mainClassName(classes: readonly AttendedClass[] | undefined): string {
  return classes?.[0]?.name ?? NO_CLASS_LABEL;
}

// Porządek listy przy grupowaniu po zajęciach: najpierw nazwa zajęć, wewnątrz
// grupy alfabetycznie po nazwisku. "Bez zajęć" zawsze na końcu - to nie jest
// nazwa zajęć, tylko ich brak, więc nie ma czego szukać w środku alfabetu.
export function compareByClassThenName<T extends { lastName: string; firstName: string }>(
  a: T & { mainClass: string },
  b: T & { mainClass: string },
): number {
  if (a.mainClass !== b.mainClass) {
    if (a.mainClass === NO_CLASS_LABEL) return 1;
    if (b.mainClass === NO_CLASS_LABEL) return -1;
    return a.mainClass.localeCompare(b.mainClass, "pl");
  }
  return a.lastName.localeCompare(b.lastName, "pl") || a.firstName.localeCompare(b.firstName, "pl");
}
