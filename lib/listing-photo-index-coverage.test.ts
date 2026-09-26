import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PHOTO_INDEX_COVERAGE_CHUNK,
  applyListingPhotoIndexCoverageRows,
  isListingPhotoIndexConnectionError,
  listListingPhotoIndicesForCacheIdsWithQuery,
  listingPhotoGapScanUsesSidecarIndex,
  listingPhotoIndexCoverageIds,
} from './listing-photo-index-coverage'

describe('listingPhotoGapScanUsesSidecarIndex', () => {
  it('reads Neon when listings are localhost and the index URL is neon.tech', () => {
    assert.equal(
      listingPhotoGapScanUsesSidecarIndex({
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/tmre',
        indexUrl:
          'postgresql://u:p@ep-example.us-east-1.aws.neon.tech/neondb?sslmode=require',
      }),
      true,
    )
  })

  it('stays on DATABASE_URL when the index host is the same', () => {
    const neon =
      'postgresql://u:p@ep-example.us-east-1.aws.neon.tech/neondb?sslmode=require'
    assert.equal(
      listingPhotoGapScanUsesSidecarIndex({
        databaseUrl: neon,
        indexUrl: neon,
      }),
      false,
    )
  })

  it('stays on DATABASE_URL when no index sidecar is set', () => {
    assert.equal(
      listingPhotoGapScanUsesSidecarIndex({
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/tmre',
        indexUrl: '',
      }),
      false,
    )
  })
})

describe('isListingPhotoIndexConnectionError', () => {
  it('matches the CLI crash from an idle Neon drop', () => {
    assert.equal(
      isListingPhotoIndexConnectionError(
        new Error('Connection terminated unexpectedly'),
      ),
      true,
    )
    assert.equal(isListingPhotoIndexConnectionError(new Error('syntax error')), false)
  })
})

describe('listListingPhotoIndicesForCacheIdsWithQuery', () => {
  it('chunks ids at 400 and maps indexed slots', async () => {
    const ids = Array.from({ length: PHOTO_INDEX_COVERAGE_CHUNK + 3 }, (_, i) => `id-${i}`)
    const calls: number[] = []
    const coverage = await listListingPhotoIndicesForCacheIdsWithQuery(
      ['', 'id-0', 'id-0', ...ids.slice(1)],
      async (_sql, params) => {
        const chunk = params[0]
        assert.ok(Array.isArray(chunk))
        calls.push(chunk.length)
        return [{ cache_id: chunk[0], indices: [0, 1, 2] }]
      },
    )
    assert.deepEqual(calls, [PHOTO_INDEX_COVERAGE_CHUNK, 3])
    assert.deepEqual(coverage.get('id-0'), [0, 1, 2])
    assert.equal(listingPhotoIndexCoverageIds([' a ', '', 'a']).join(','), 'a')
  })

  it('ignores junk index arrays', () => {
    const out = new Map<string, number[]>()
    applyListingPhotoIndexCoverageRows(out, [
      { cache_id: 'x', indices: [0, '1', 2] },
      { cache_id: '  ', indices: [0] },
    ])
    assert.deepEqual(out.get('x'), [0, 1, 2])
    assert.equal(out.has(''), false)
  })
})
