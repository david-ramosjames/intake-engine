-- Map a custom domain to a specific journey (null = org's first published journey).
ALTER TABLE "Domain" ADD COLUMN "journeyId" TEXT;
