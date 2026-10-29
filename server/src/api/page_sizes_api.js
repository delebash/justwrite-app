// SPDX-License-Identifier: MIT
// GET /v1/page-sizes — the PDF's page sizes (the seeded `page_sizes` rows, server/src/database/
// page_sizes.js), for the Export page's PDF card (2026-10-28). Read-only: the rows are seeded facts.

import { Hono } from "@delebash/core/platform/server";
import { listPageSizes } from "../database/page_sizes.js";
import { getDb } from "../database/session.js";

export const router = new Hono();

router.get("/v1/page-sizes", (c) => c.json({ sizes: listPageSizes(getDb()) }));
