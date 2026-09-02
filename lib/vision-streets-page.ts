/** Client-safe helpers for the Admin /streets page. */

export function townToStreetSlug(town: string): string {
  return town
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function resolveStreetTown(
  slug: string,
  knownTowns: readonly string[],
): string | null {
  const needle = townToStreetSlug(slug)
  if (!needle) return null
  return knownTowns.find((town) => townToStreetSlug(town) === needle) ?? null
}
