-- CreateEnum
CREATE TYPE "JourneyEventType" AS ENUM ('OPENED', 'STARTED', 'COMPLETED', 'CTA_CLICK');

-- CreateTable
CREATE TABLE "JourneyEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "journeySlug" TEXT,
    "sessionId" TEXT NOT NULL,
    "type" "JourneyEventType" NOT NULL,
    "outcome" TEXT,
    "source" TEXT,
    "pageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JourneyEvent_organizationId_type_createdAt_idx" ON "JourneyEvent"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "JourneyEvent_organizationId_journeySlug_idx" ON "JourneyEvent"("organizationId", "journeySlug");

-- CreateIndex
CREATE INDEX "JourneyEvent_sessionId_idx" ON "JourneyEvent"("sessionId");
