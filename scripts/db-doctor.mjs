#!/usr/bin/env node
// Diagnostyka i naprawa lokalnej bazy `prisma dev`.
//
// Powód istnienia: serwer `prisma dev` prowadzi obok danych strumień zdarzeń
// (durable-streams.sqlite). Aplikacja go NIE używa, ale rośnie on bez końca -
// u nas urósł do 9,7 GB i zaczął wywracać bazę przy starcie. Objawy w aplikacji:
// "This page couldn't load" oraz w logach ECONNREFUSED albo P1017
// ("Server has closed the connection").
//
//   npm run db:doctor          - pokaż stan (nic nie zmienia)
//   npm run db:clean           - usuń balast strumieni i zaległe blokady
//
// Czyszczenie NIGDY nie rusza katalogu z danymi (.pglite) - kasuje wyłącznie
// pliki strumienia i osierocone locki, i tylko przy zatrzymanej bazie.

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { createConnection } from "node:net";

const DB_NAME = process.env.PRISMA_DEV_NAME ?? "czapla";
const DB_PORT = Number(process.env.PRISMA_DEV_PORT ?? 51214);

function dataRoot() {
  const local =
    process.env.LOCALAPPDATA ??
    (process.env.HOME ? join(process.env.HOME, ".local", "share") : null);
  return local ? join(local, "prisma-dev-nodejs", "Data") : null;
}

function dirSize(path) {
  if (!existsSync(path)) return 0;
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size;
  }
  return total;
}

function human(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// Port otwarty = baza działa. Czyszczenie przy działającej bazie uszkodziłoby
// pliki, więc to jest twarda blokada, nie ostrzeżenie.
function isRunning(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1500);
    socket.on("connect", () => done(true));
    socket.on("error", () => done(false));
    socket.on("timeout", () => done(false));
  });
}

const clean = process.argv.includes("--clean");
const root = dataRoot();

if (!root || !existsSync(root)) {
  console.warn(`Nie znaleziono katalogu danych prisma dev (${root ?? "brak LOCALAPPDATA"}).`);
  console.warn("Jeśli baza nigdy nie startowała, uruchom: npm run db:dev");
  process.exit(0);
}

const dataDir = join(root, DB_NAME, ".pglite");
const streamDir = join(root, "durable-streams", DB_NAME);
const running = await isRunning(DB_PORT);

console.warn(`Baza:      ${DB_NAME} (port ${DB_PORT})`);
console.warn(`Stan:      ${running ? "DZIAŁA" : "zatrzymana"}`);
console.warn(`Dane:      ${human(dirSize(dataDir))}  ${dataDir}`);
console.warn(`Strumienie:${human(dirSize(streamDir))}  ${streamDir}`);

if (!clean) {
  const streamBytes = dirSize(streamDir);
  if (streamBytes > 512 * 1024 ** 2) {
    console.warn("");
    console.warn(`⚠ Strumienie urosły do ${human(streamBytes)} - to grozi wywracaniem bazy.`);
    console.warn(
      "  Napraw:  zatrzymaj bazę (Ctrl+C w oknie `npm run db:dev`), potem `npm run db:clean`",
    );
  }
  process.exit(0);
}

if (running) {
  console.warn("");
  console.error("✖ Baza działa - najpierw ją zatrzymaj (Ctrl+C w oknie `npm run db:dev`).");
  console.error("  Czyszczenie przy działającej bazie mogłoby uszkodzić pliki.");
  process.exit(1);
}

const before = dirSize(streamDir);
let removed = 0;

// Pliki strumienia zdarzeń - odtwarzają się same przy starcie.
for (const name of [
  "durable-streams.sqlite",
  "durable-streams.sqlite-shm",
  "durable-streams.sqlite-wal",
]) {
  const file = join(streamDir, name);
  if (existsSync(file)) {
    rmSync(file, { force: true });
    removed++;
  }
}

// Osierocone blokady po padniętym procesie - blokują kolejny start
// ("Lock file is already being held").
const lockDir = join(streamDir, "server.lock.lock");
if (existsSync(lockDir)) {
  rmSync(lockDir, { recursive: true, force: true });
  removed++;
}
const pidFile = join(dataDir, "postmaster.pid");
if (existsSync(pidFile)) {
  rmSync(pidFile, { force: true });
  removed++;
}

console.warn("");
console.warn(`✔ Wyczyszczono ${removed} plików: ${human(before)} → ${human(dirSize(streamDir))}`);
console.warn(`  Dane nietknięte: ${human(dirSize(dataDir))}`);
console.warn("  Uruchom bazę: npm run db:dev");
