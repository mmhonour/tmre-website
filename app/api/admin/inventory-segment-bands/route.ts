import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorizedRequest } from "@/lib/admin-auth";
import {
  cloneInventorySegmentBandsConfig,
  DEFAULT_INVENTORY_SEGMENT_BANDS,
  getInventorySegmentBandsConfigFresh,
  isDefaultInventorySegmentBandsConfig,
  setInventorySegmentBandsConfig,
} from "@/lib/inventory-segment-bands-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const config = await getInventorySegmentBandsConfigFresh();
  return NextResponse.json({
    config,
    default: cloneInventorySegmentBandsConfig(DEFAULT_INVENTORY_SEGMENT_BANDS),
    isDefault: isDefaultInventorySegmentBandsConfig(config),
  });
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { config?: unknown } = {};
  try {
    body = (await req.json()) as { config?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const config = await setInventorySegmentBandsConfig(body.config);
    return NextResponse.json({
      config,
      default: cloneInventorySegmentBandsConfig(DEFAULT_INVENTORY_SEGMENT_BANDS),
      isDefault: isDefaultInventorySegmentBandsConfig(config),
      note: "Saved to Postgres. Rebuild Stats cache so Intelligence luxury inventory uses the new steps.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 400 },
    );
  }
}
