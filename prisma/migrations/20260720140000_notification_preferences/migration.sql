-- Powiadomienia: z dwóch pól na User na typowane preferencje.

CREATE TYPE "NotificationType" AS ENUM ('SESSION_REMINDER', 'BOOKING_SUGGESTION', 'CHECK_IN');

CREATE TABLE "NotificationPreference" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "type"      "NotificationType" NOT NULL,
  "push"      BOOLEAN NOT NULL DEFAULT false,
  "sms"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreference_userId_type_key"
  ON "NotificationPreference" ("userId", "type");

ALTER TABLE "NotificationPreference"
  ADD CONSTRAINT "NotificationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Przenosimy istniejące ustawienia check-inu. Wiersz zakładamy tylko tam,
-- gdzie użytkownik odbiega od wartości domyślnych (push=true, sms=false) -
-- brak wiersza i tak znaczy "domyślne", więc nie zaśmiecamy tabeli.
INSERT INTO "NotificationPreference" ("id", "userId", "type", "push", "sms", "updatedAt")
SELECT
  gen_random_uuid()::text,
  "id",
  'CHECK_IN',
  "checkInNotifyPush",
  "checkInNotifySms",
  CURRENT_TIMESTAMP
FROM "User"
WHERE "checkInNotifyPush" IS DISTINCT FROM true
   OR "checkInNotifySms" IS DISTINCT FROM false;

-- Stare pola znikają celowo: zostawienie ich dałoby dwa źródła prawdy dla
-- tego samego ustawienia i pierwszą okazję do rozjazdu.
ALTER TABLE "User" DROP COLUMN "checkInNotifyPush";
ALTER TABLE "User" DROP COLUMN "checkInNotifySms";

-- Ślad wysyłki - wyłącznie po to, żeby cron nie wysłał tego samego dwa razy.
CREATE TABLE "NotificationLog" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "type"      "NotificationType" NOT NULL,
  "subjectId" TEXT NOT NULL,
  "sentAt"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationLog_userId_type_subjectId_key"
  ON "NotificationLog" ("userId", "type", "subjectId");

CREATE INDEX "NotificationLog_sentAt_idx" ON "NotificationLog" ("sentAt");
