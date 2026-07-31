-- CreateTable
CREATE TABLE "SessionSkip" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSkip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionSkip_templateId_startsAt_key" ON "SessionSkip"("templateId", "startsAt");

-- AddForeignKey
ALTER TABLE "SessionSkip" ADD CONSTRAINT "SessionSkip_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ClassTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

