-- AlterTable
ALTER TABLE "ClassTemplate" ADD COLUMN     "startDate" TIMESTAMPTZ,
ALTER COLUMN "name" DROP NOT NULL;
