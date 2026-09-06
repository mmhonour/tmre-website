import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MLS_SYNC_MAX_CHILDREN_DEFAULT,
  resolveMaxChildren,
} from './job-runner'

describe('resolveMaxChildren', () => {
  it('defaults to three slots when the value is missing or junk', () => {
    assert.equal(resolveMaxChildren(''), MLS_SYNC_MAX_CHILDREN_DEFAULT)
    assert.equal(resolveMaxChildren('nope'), MLS_SYNC_MAX_CHILDREN_DEFAULT)
  })

  it('clamps to 1–4', () => {
    assert.equal(resolveMaxChildren('0'), 1)
    assert.equal(resolveMaxChildren('1'), 1)
    assert.equal(resolveMaxChildren('3'), 3)
    assert.equal(resolveMaxChildren('4'), 4)
    assert.equal(resolveMaxChildren('99'), 4)
  })
})
