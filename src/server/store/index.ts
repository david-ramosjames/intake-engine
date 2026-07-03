// The single data-access seam for the platform. Selects the file-backed DEMO
// store or the Prisma/Postgres store based on whether a database is configured.
// Every admin page, server action, and API route reads/writes through `store`.

import { hasDatabase } from "../db";
import { demoStore } from "./demoStore";
import { prismaStore } from "./prismaStore";
import type { PlatformStore } from "./types";

export const store: PlatformStore = hasDatabase ? prismaStore : demoStore;

export type { StoredOrg, StoredJourney, StoredLead } from "./types";
