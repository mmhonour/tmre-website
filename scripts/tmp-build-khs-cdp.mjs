import { readFileSync, writeFileSync } from 'node:fs'

const b = readFileSync('tmp-pta-khs-b64.txt', 'utf8').trim()
const expr =
  `(async()=>{ window.__PTA_SCHOOL__='KHS'; window.__PTA_PAGE_COUNT__=18; return await eval(atob('${b}')); })()`
writeFileSync('tmp-pta-khs-cdp-expr.js', expr)
console.log('len', expr.length)
