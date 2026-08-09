-- Właściciel zarządza cennikiem karnetów z panelu, więc zmiany rodzajów i kwot
-- muszą zostawiać ślad w dzienniku aktywności - "kto podniósł cenę OPEN" to
-- pytanie, które prędzej czy później padnie.
ALTER TYPE "ActivityAction" ADD VALUE 'PLAN_CHANGED';
