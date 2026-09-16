import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyScriptDbHost,
  discoverNeonUrlsFromEnvFile,
  formatScriptDbTarget,
  looksLikePlaceholderDbUrl,
  parseScriptDbUrl,
  pickProdDbTarget,
  stripWrappingQuotes,
  targetFromEnvValue,
} from './script-postgres-target'

describe('looksLikePlaceholderDbUrl', () => {
  it('catches the unicode ellipsis docs placeholder', () => {
    assert.equal(looksLikePlaceholderDbUrl('postgresql://…neon…'), true)
    assert.equal(
      looksLikePlaceholderDbUrl('postgresql://%E2%80%A6neon%E2%80%A6/neondb'),
      true,
    )
    assert.equal(
      looksLikePlaceholderDbUrl('postgresql://user:pass@...neon.tech/neondb'),
      true,
    )
  })

  it('allows a real Neon URL', () => {
    assert.equal(
      looksLikePlaceholderDbUrl(
        'postgresql://u:p@ep-example.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require',
      ),
      false,
    )
  })
})

describe('parseScriptDbUrl', () => {
  it('classifies localhost and Neon', () => {
    assert.deepEqual(parseScriptDbUrl('postgresql://postgres:postgres@localhost:5432/tmre'), {
      host: 'localhost',
      kind: 'localhost',
    })
    assert.equal(
      parseScriptDbUrl(
        'postgresql://u:p@ep-example.c-9.us-east-1.aws.neon.tech/neondb',
      )?.kind,
      'prod',
    )
    assert.equal(parseScriptDbUrl('postgresql://…neon…'), null)
  })

  it('strips wrapping quotes', () => {
    assert.equal(stripWrappingQuotes('"postgresql://localhost/tmre"'), 'postgresql://localhost/tmre')
    assert.equal(
      classifyScriptDbHost(
        parseScriptDbUrl('"postgresql://127.0.0.1:5432/tmre"')?.host ?? '',
      ),
      'localhost',
    )
  })
})

describe('discoverNeonUrlsFromEnvFile', () => {
  it('reads commented neon.tech lines and skips placeholders', () => {
    const text = `
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tmre
DATABASE_URL_UNPOOLED=postgresql://…neon…
# DATABASE_URL_UNPOOLED=postgresql://u:p@ep-example.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require
# DATABASE_URL=postgresql://u:p@ep-example-pooler.c-9.us-east-1.aws.neon.tech/neondb
`
    const found = discoverNeonUrlsFromEnvFile(text)
    assert.equal(found.length, 2)
    assert.equal(found[0]?.host, 'ep-example.c-9.us-east-1.aws.neon.tech')
    assert.equal(found[1]?.host, 'ep-example-pooler.c-9.us-east-1.aws.neon.tech')
  })
})

describe('pickProdDbTarget', () => {
  it('refuses placeholder + localhost and explains', () => {
    const result = pickProdDbTarget({
      env: {
        DATABASE_URL_UNPOOLED: 'postgresql://…neon…',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/tmre',
      },
    })
    assert.equal('error' in result, true)
    if ('error' in result) {
      assert.match(result.error, /placeholder/)
    }
  })

  it('prefers a live unpooled Neon env var', () => {
    const result = pickProdDbTarget({
      env: {
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/tmre',
        DATABASE_URL_UNPOOLED:
          'postgresql://u:p@ep-direct.c-9.us-east-1.aws.neon.tech/neondb',
      },
    })
    assert.equal('target' in result, true)
    if ('target' in result) {
      assert.equal(result.target.host, 'ep-direct.c-9.us-east-1.aws.neon.tech')
      assert.equal(result.source, 'env DATABASE_URL_UNPOOLED')
    }
  })

  it('falls back to a commented Neon URL in .env.local', () => {
    const result = pickProdDbTarget({
      env: {
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/tmre',
        DATABASE_URL_UNPOOLED: 'postgresql://%E2%80%A6neon%E2%80%A6',
      },
      envFileText: `# DATABASE_URL_UNPOOLED=postgresql://u:p@ep-commented.c-9.us-east-1.aws.neon.tech/neondb\n`,
    })
    assert.equal('target' in result, true)
    if ('target' in result) {
      assert.equal(result.target.host, 'ep-commented.c-9.us-east-1.aws.neon.tech')
      assert.match(result.source, /commented/)
    }
  })
})

describe('formatScriptDbTarget', () => {
  it('never includes the connection string', () => {
    const line = formatScriptDbTarget({
      kind: 'localhost',
      host: 'localhost',
      key: 'DATABASE_URL',
    })
    assert.equal(line, 'localhost host=localhost via DATABASE_URL')
    assert.equal(line.includes('postgresql'), false)
  })
})

describe('targetFromEnvValue', () => {
  it('drops placeholders so they cannot become a host', () => {
    assert.equal(
      targetFromEnvValue('DATABASE_URL_UNPOOLED', 'postgresql://%E2%80%A6neon%E2%80%A6'),
      null,
    )
  })
})
