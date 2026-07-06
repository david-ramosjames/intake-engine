-- AlterEnum
ALTER TYPE "LeadStatus" ADD VALUE 'REFERRED';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "referral" BOOLEAN NOT NULL DEFAULT false;
