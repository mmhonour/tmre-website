/**
 * Read-only RETS probe: find Furnished-related Property fields and sample
 * rental rows. Writes nothing to DB.
 *
 *   npm run probe:rets:furnished
 */
import * as rets from "rets-client";
import { parseFurnishedFromRaw } from "../lib/listing-furnished";

const settings = {
  loginUrl: process.env.RETS_SERVER_URL!,
  username: process.env.RETS_USERNAME!,
  password: process.env.RETS_PASSWORD!,
  version: "RETS/1.7.2",
  userAgent: "tmre-furnished-probe/0.1",
};

async function main() {
  if (!settings.loginUrl || !settings.username || !settings.password) {
    console.error(
      "Missing RETS_SERVER_URL/USERNAME/PASSWORD. Run: npm run probe:rets:furnished",
    );
    process.exit(1);
  }

  await (rets as any).getAutoLogoutClient(settings, async (client: any) => {
    const classes = await client.metadata.getClass("Property");
    const classRows = (classes.results?.[0]?.metadata ?? []) as Array<{
      ClassName: string;
    }>;
    console.log(
      "Property classes:",
      classRows.map((c) => c.ClassName).join(", "),
    );

    type FieldHit = {
      className: string;
      system: string;
      long: string;
      std: string;
      lookup: string;
    };
    const furnishFields: FieldHit[] = [];
    const relatedFields: FieldHit[] = [];

    for (const c of classRows) {
      const table = await client.metadata.getTable("Property", c.ClassName);
      const fields = (table.results?.[0]?.metadata ?? []) as Array<
        Record<string, string>
      >;
      for (const f of fields) {
        const hay = [
          f.SystemName,
          f.LongName,
          f.StandardName,
          f.DBName,
          f.ShortName,
        ].join(" ");
        const hit = {
          className: c.ClassName,
          system: f.SystemName ?? "",
          long: f.LongName ?? "",
          std: f.StandardName ?? "",
          lookup: f.LookupName ?? "",
        };
        if (/furnish/i.test(hay)) furnishFields.push(hit);
        else if (/furn|equip|amenit|applian|inclu|lease.?term|rental/i.test(hay)) {
          relatedFields.push(hit);
        }
      }
    }

    console.log("\nFurnish-related fields:");
    console.log(JSON.stringify(furnishFields, null, 2));
    console.log("\nRelated (equip/amenity/appliance/lease) fields:");
    console.log(JSON.stringify(relatedFields, null, 2));

    for (const f of [...furnishFields, ...relatedFields]) {
      if (!f.lookup) continue;
      try {
        const lt = await client.metadata.getLookupTypes("Property", f.lookup);
        const vals = (lt.results?.[0]?.metadata ?? []) as Array<
          Record<string, string>
        >;
        console.log(`\nLookup ${f.lookup} for ${f.system}:`);
        for (const v of vals.slice(0, 30)) {
          console.log(
            `  ${(v.Value ?? "").padEnd(12)} | ${(v.ShortValue ?? "").padEnd(20)} | ${v.LongValue ?? ""}`,
          );
        }
      } catch (err) {
        console.log(
          `Lookup failed for ${f.lookup}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // PropertyType lookup — find rental codes
    try {
      const lt = await client.metadata.getLookupTypes(
        "Property",
        "PropertyType",
      );
      const vals = (lt.results?.[0]?.metadata ?? []) as Array<
        Record<string, string>
      >;
      console.log("\nPropertyType lookup:");
      for (const v of vals) {
        console.log(
          `  ${(v.Value ?? "").padEnd(12)} | ${(v.ShortValue ?? "").padEnd(20)} | ${v.LongValue ?? ""}`,
        );
      }
    } catch (err) {
      console.log(
        "PropertyType lookup failed:",
        err instanceof Error ? err.message : err,
      );
    }

    // Sample active Westport listings — dump furnish / related keys from live data
    const className = classRows[0]?.ClassName ?? "Property";
    const queries = [
      "(City=|540),(MLSStatus=|A)",
      "(City=|540),(PropertyType=|RL),(MLSStatus=|A)",
      "(City=|540),(PropertyType=|RN),(MLSStatus=|A)",
      "(City=|350),(MLSStatus=|A)",
    ];

    for (const dmql of queries) {
      try {
        const result = await client.search.query("Property", className, dmql, {
          limit: 20,
          offset: 1,
        });
        const rows = (result.results ?? []) as Record<string, string>[];
        console.log(
          `\nQuery ${dmql} → ${rows.length} rows (count=${result.count})`,
        );
        let anyParsed = 0;
        const keyHits = new Map<string, string>();
        for (const row of rows) {
          for (const k of Object.keys(row)) {
            const v = row[k];
            if (
              /furn|equip|amenit|applian|inclu/i.test(k) ||
              /furnish|unfurnish|partially.?furn/i.test(String(v ?? ""))
            ) {
              keyHits.set(k, String(v ?? "").slice(0, 120));
            }
          }
          const keys = Object.keys(row).filter((k) => /furnish/i.test(k));
          const parsed = parseFurnishedFromRaw(row);
          if (parsed) anyParsed++;
          if (keys.length || parsed) {
            console.log({
              ListingId: row.ListingId,
              PropertyType: row.PropertyType,
              furnishKeys: keys,
              furnishValues: Object.fromEntries(
                keys.map((k) => [k, row[k]]),
              ),
              parsed,
            });
          }
        }
        console.log(`Parsed non-null furnished: ${anyParsed}/${rows.length}`);
        console.log(
          "Key hits in sample:",
          Object.fromEntries([...keyHits.entries()].slice(0, 40)),
        );
        console.log(
          "PropertyTypes:",
          [...new Set(rows.map((r) => r.PropertyType))],
        );
        if (rows.length > 0 && anyParsed > 0) break;
      } catch (err) {
        console.log(
          `Search failed for ${dmql}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
