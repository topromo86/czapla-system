import { describe, expect, it } from "vitest";
import {
  isNotificationType,
  NOTIFICATION_TYPES,
  parsePreferenceForm,
  visibleTypes,
  wantsNotification,
  type StoredPreference,
} from "./notification";

describe("visibleTypes", () => {
  it("klient bez podopiecznych nie widzi powiadomienia o dziecku", () => {
    const types = visibleTypes(false).map((t) => t.type);
    expect(types).not.toContain("CHECK_IN");
    expect(types).toContain("SESSION_REMINDER");
  });

  it("opiekun widzi wszystkie", () => {
    expect(visibleTypes(true)).toHaveLength(NOTIFICATION_TYPES.length);
  });
});

describe("wantsNotification", () => {
  it("bez zapisanej preferencji bierze wartość domyślną", () => {
    expect(wantsNotification([], "SESSION_REMINDER", "PUSH")).toBe(true);
    expect(wantsNotification([], "BOOKING_SUGGESTION", "PUSH")).toBe(false);
  });

  // SMS kosztuje - nikt go nie dostaje, dopóki sam nie włączy.
  it("SMS domyślnie wyłączony dla każdego typu", () => {
    for (const meta of NOTIFICATION_TYPES) {
      expect(wantsNotification([], meta.type, "SMS")).toBe(false);
    }
  });

  it("zapisana preferencja wygrywa z domyślną", () => {
    const prefs: StoredPreference[] = [{ type: "SESSION_REMINDER", push: false, sms: true }];
    expect(wantsNotification(prefs, "SESSION_REMINDER", "PUSH")).toBe(false);
    expect(wantsNotification(prefs, "SESSION_REMINDER", "SMS")).toBe(true);
  });

  it("preferencja jednego typu nie wpływa na inny", () => {
    const prefs: StoredPreference[] = [{ type: "SESSION_REMINDER", push: false, sms: false }];
    expect(wantsNotification(prefs, "CHECK_IN", "PUSH")).toBe(true);
  });
});

describe("parsePreferenceForm", () => {
  it("niezaznaczone typy zapisują się jako wyłączone", () => {
    const result = parsePreferenceForm(["SESSION_REMINDER:PUSH"], false);
    expect(result).toEqual([
      { type: "SESSION_REMINDER", push: true, sms: false },
      { type: "BOOKING_SUGGESTION", push: false, sms: false },
    ]);
  });

  it("obsługuje oba kanały naraz", () => {
    const result = parsePreferenceForm(["SESSION_REMINDER:PUSH", "SESSION_REMINDER:SMS"], false);
    expect(result.find((r) => r.type === "SESSION_REMINDER")).toEqual({
      type: "SESSION_REMINDER",
      push: true,
      sms: true,
    });
  });

  // Bez tego klient mógłby podrobić formularz i włączyć sobie powiadomienie
  // o cudzym dziecku.
  it("odrzuca typ niedostępny dla tej roli", () => {
    const result = parsePreferenceForm(["CHECK_IN:PUSH"], false);
    expect(result.some((r) => r.type === "CHECK_IN")).toBe(false);
  });

  it("opiekun może włączyć powiadomienie o dziecku", () => {
    const result = parsePreferenceForm(["CHECK_IN:PUSH"], true);
    expect(result.find((r) => r.type === "CHECK_IN")?.push).toBe(true);
  });

  it("ignoruje śmieci w formularzu", () => {
    const result = parsePreferenceForm(["NIE_ISTNIEJE:PUSH", "SESSION_REMINDER:TELEPATIA"], false);
    expect(result.every((r) => !r.push && !r.sms)).toBe(true);
  });
});

describe("isNotificationType", () => {
  it("rozpoznaje znane typy", () => {
    expect(isNotificationType("SESSION_REMINDER")).toBe(true);
    expect(isNotificationType("CO_TO")).toBe(false);
  });
});
