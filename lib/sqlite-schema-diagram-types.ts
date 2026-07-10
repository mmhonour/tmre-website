export type SqliteColumnInfo = {
  name: string
  type: string
  notNull: boolean
  primaryKey: boolean
  defaultValue: string | null
}

export type SqliteTableInfo = {
  name: string
  rowCount: number
  columns: SqliteColumnInfo[]
}

export type SqliteColumnRef = {
  table: string
  column: string
}

/** PK → FK edge for Admin schema diagrams (logical or PRAGMA-declared). */
export type SqliteRelationship = {
  from: SqliteColumnRef
  to: SqliteColumnRef
  /** sqlite FK constraint vs app-level join column */
  source: 'pragma' | 'documented'
}

export type SqliteDatabaseDiagram = {
  id: string
  label: string
  role: string
  fileName: string
  absolutePath: string
  relativePath: string
  exists: boolean
  sizeBytes: number | null
  available: boolean
  error?: string
  tables: SqliteTableInfo[]
  relationships: SqliteRelationship[]
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
