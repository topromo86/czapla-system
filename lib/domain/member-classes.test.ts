import { describe, expect, it } from "vitest";
import {
  compareByClassThenName,
  groupAttendedClasses,
  mainClassName,
  NO_CLASS_LABEL,
} from "./member-classes";

function visit(memberId: string, className: string) {
  return { memberId, className };
}

describe("groupAttendedClasses", () => {
  it("zlicza zajęcia klienta", () => {
    const grouped = groupAttendedClasses([
      visit("m1", "Kids Boxing"),
      visit("m1", "Kids Boxing"),
      visit("m1", "Boks Junior"),
    ]);
    expect(grouped.get("m1")).toEqual([
      { name: "Kids Boxing", visits: 2 },
      { name: "Boks Junior", visits: 1 },
    ]);
  });

  it("rozdziela klientów", () => {
    const grouped = groupAttendedClasses([visit("m1", "Kids Boxing"), visit("m2", "Women Boxing")]);
    expect(grouped.get("m1")).toEqual([{ name: "Kids Boxing", visits: 1 }]);
    expect(grouped.get("m2")).toEqual([{ name: "Women Boxing", visits: 1 }]);
  });

  // Bez tego kolejność zależałaby od tego, w jakiej kolejności baza zwróci
  // wiersze - lista skakałaby przy każdym odświeżeniu.
  it("remis rozstrzyga nazwa", () => {
    const grouped = groupAttendedClasses([visit("m1", "Women Boxing"), visit("m1", "Boks Junior")]);
    expect(grouped.get("m1")?.map((c) => c.name)).toEqual(["Boks Junior", "Women Boxing"]);
  });

  it("bez zapisów nie ma wpisu", () => {
    expect(groupAttendedClasses([]).size).toBe(0);
  });
});

describe("mainClassName", () => {
  it("bierze najczęstsze zajęcia", () => {
    expect(mainClassName([{ name: "Kids Boxing", visits: 5 }])).toBe("Kids Boxing");
  });

  it("brak zapisów to 'Bez zajęć'", () => {
    expect(mainClassName([])).toBe(NO_CLASS_LABEL);
    expect(mainClassName(undefined)).toBe(NO_CLASS_LABEL);
  });
});

describe("compareByClassThenName", () => {
  const m = (mainClass: string, lastName: string, firstName = "Jan") => ({
    mainClass,
    lastName,
    firstName,
  });

  it("grupuje po zajęciach, w grupie po nazwisku", () => {
    const sorted = [
      m("Women Boxing", "Nowak"),
      m("Kids Boxing", "Zalewski"),
      m("Kids Boxing", "Adamiak"),
    ].sort(compareByClassThenName);
    expect(sorted.map((x) => `${x.mainClass}/${x.lastName}`)).toEqual([
      "Kids Boxing/Adamiak",
      "Kids Boxing/Zalewski",
      "Women Boxing/Nowak",
    ]);
  });

  it("klienci bez zajęć lądują na końcu", () => {
    const sorted = [m(NO_CLASS_LABEL, "Abacki"), m("Women Boxing", "Zych")].sort(
      compareByClassThenName,
    );
    expect(sorted.map((x) => x.lastName)).toEqual(["Zych", "Abacki"]);
  });

  it("to samo nazwisko rozstrzyga imię", () => {
    const sorted = [
      m("Kids Boxing", "Kowalski", "Zenon"),
      m("Kids Boxing", "Kowalski", "Anna"),
    ].sort(compareByClassThenName);
    expect(sorted.map((x) => x.firstName)).toEqual(["Anna", "Zenon"]);
  });
});
