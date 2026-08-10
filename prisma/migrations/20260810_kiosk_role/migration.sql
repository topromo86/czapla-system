-- Rola KIOSK: konto tabletu wiszącego na sali.
--
-- Hasło do niego zna cały klub (wpisuje je każdy, kto odpala tablet), więc
-- konto nie może widzieć niczego poza kioskiem: ani kartoteki, ani pieniędzy,
-- ani grafiku. Osobna rola zamiast "trenera technicznego" jest jedynym
-- sposobem, żeby to było prawdą także po dodaniu kolejnych ekranów.
ALTER TYPE "Role" ADD VALUE 'KIOSK';
