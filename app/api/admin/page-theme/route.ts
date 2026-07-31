import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorizedRequest } from "@/lib/admin-auth";
import {
  cloneMarketPulseTheme,
  createCustomMarketPulsePreset,
  DEFAULT_MARKET_PULSE_THEME,
  deleteCustomMarketPulsePreset,
  getMarketPulseThemeFresh,
  isDefaultMarketPulseTheme,
  listAllMarketPulsePresetsFresh,
  setMarketPulseTheme,
} from "@/lib/page-theme-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [theme, presets] = await Promise.all([
    getMarketPulseThemeFresh(),
    listAllMarketPulsePresetsFresh(),
  ]);
  return NextResponse.json({
    theme,
    default: cloneMarketPulseTheme(DEFAULT_MARKET_PULSE_THEME),
    isDefault: isDefaultMarketPulseTheme(theme),
    presets,
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

/** Create a named custom preset (Neon sync_meta — per environment, not in git). */
export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { label?: unknown; theme?: unknown } = {};
  try {
    body = (await req.json()) as { label?: unknown; theme?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.label !== "string") {
    return NextResponse.json({ error: "Preset name is required." }, { status: 400 });
  }
  try {
    const preset = await createCustomMarketPulsePreset({
      label: body.label,
      theme: body.theme,
    });
    const presets = await listAllMarketPulsePresetsFresh();
    return NextResponse.json({ preset, presets });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save preset" },
      { status: 400 },
    );
  }
}

/** Delete a custom preset by id. Built-ins cannot be deleted. */
export async function DELETE(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "Preset id is required." }, { status: 400 });
  }
  try {
    const deleted = await deleteCustomMarketPulsePreset(id);
    if (!deleted) {
      return NextResponse.json({ error: "Preset not found." }, { status: 404 });
    }
    const presets = await listAllMarketPulsePresetsFresh();
    return NextResponse.json({ ok: true, presets });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 400 },
    );
  }
}
