import { NextRequest, NextResponse } from "next/server";
import {
  type AllTownsDescriptorRequest,
  resolveAllTownsDescriptor,
  townPhrasesForDescriptor,
} from "@/lib/intelligence-all-towns-descriptor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidPayload(body: unknown): body is AllTownsDescriptorRequest {
  if (!body || typeof body !== "object") return false;
  const payload = body as AllTownsDescriptorRequest;
  if (!Array.isArray(payload.towns)) return false;
  if (typeof payload.totalListings !== "number") return false;
  if (
    payload.aggregateMonthsSupply != null &&
    typeof payload.aggregateMonthsSupply !== "number"
  ) {
    return false;
  }
  if (!payload.filterContext || typeof payload.filterContext !== "object") {
    return false;
  }
  if (
    payload.townPhrases != null &&
    (!Array.isArray(payload.townPhrases) ||
      !payload.townPhrases.every(
        (entry) =>
          typeof entry.town === "string" && typeof entry.phrase === "string",
      ))
  ) {
    return false;
  }
  return payload.towns.every(
    (town) =>
      typeof town.town === "string" &&
      typeof town.listingCount === "number" &&
      (town.medianPrice == null || typeof town.medianPrice === "number") &&
      (town.medianDom == null || typeof town.medianDom === "number") &&
      (town.monthsSupply == null || typeof town.monthsSupply === "number") &&
      typeof town.newThisWeek === "number" &&
      typeof town.reduced === "number" &&
      (town.medianSqft == null || typeof town.medianSqft === "number"),
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as unknown;
    if (!isValidPayload(body)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const payload: AllTownsDescriptorRequest = {
      ...body,
      townPhrases:
        body.townPhrases?.length > 0
          ? body.townPhrases
          : townPhrasesForDescriptor(body.towns),
    };

    const result = await resolveAllTownsDescriptor(payload);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("[/api/intelligence/all-towns-descriptor]", err);
    return NextResponse.json(
      { error: "Failed to generate descriptor" },
      { status: 502 },
    );
  }
}
