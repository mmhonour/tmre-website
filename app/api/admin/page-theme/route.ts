import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorizedRequest } from "@/lib/admin-auth";
import {
  cloneMarketPulseTheme,
  DEFAULT_MARKET_PULSE_THEME,
  getMarketPulseThemeFresh,
  isDefaultMarketPulseTheme,
  setMarketPulseTheme,
} from "@/lib/page-theme-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const theme = await getMarketPulseThemeFresh();
  return NextResponse.json({
    theme,
    default: cloneMarketPulseTheme(DEFAULT_MARKET_PULSE_THEME),
    isDefault: isDefaultMarketPulseTheme(theme),
  });
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { theme?: unknown } = {};
  try {
    body = (await req.json()) as { theme?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const theme = await setMarketPulseTheme(body.theme);
    return NextResponse.json({
      theme,
      default: cloneMarketPulseTheme(DEFAULT_MARKET_PULSE_THEME),
      isDefault: isDefaultMarketPulseTheme(theme),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 400 },
    );
  }
}
