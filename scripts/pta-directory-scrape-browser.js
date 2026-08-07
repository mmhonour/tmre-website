/**
 * Browser-side Membership Toolkit directory scrape (run via CDP Runtime.evaluate).
 * Fix: every h3 inside a .dt-data block is a person — students share one block.
 *
 * Set SCHOOL ('CMS' | 'KHS') and PAGE_COUNT before evaluating, or call with defaults.
 */
;(() => {
  const SCHOOL =
    (typeof window !== 'undefined' && window.__PTA_SCHOOL__) ||
    (typeof __PTA_SCHOOL__ !== 'undefined' ? __PTA_SCHOOL__ : 'CMS')
  const PAGE_COUNT = Number(
    (typeof window !== 'undefined' && window.__PTA_PAGE_COUNT__) ||
      (typeof __PTA_PAGE_COUNT__ !== 'undefined' ? __PTA_PAGE_COUNT__ : 21),
  )

  function gradeMeta(name) {
    const m = name.match(/\((Kindergarten|Alumni|\d+(?:st|nd|rd|th))\)/i)
    if (!m) return { grade: '', gradeNum: null, gradYear: '' }
    const g = m[1]
    if (/alumni/i.test(g)) return { grade: 'Alumni', gradeNum: null, gradYear: '' }
    if (/kindergarten/i.test(g))
      return { grade: 'Kindergarten', gradeNum: 0, gradYear: '2038' }
    const n = parseInt(g, 10)
    if (!Number.isFinite(n)) return { grade: g, gradeNum: null, gradYear: '' }
    return { grade: g, gradeNum: n, gradYear: String(2038 - n) }
  }

  function linesBetween(h3) {
    const parts = []
    let n = h3.nextSibling
    while (n) {
      if (n.nodeType === 1 && n.tagName === 'H3') break
      if (n.nodeType === 1 && n.matches?.('h3')) break
      const t = (n.textContent || '').replace(/\r/g, '')
      for (const line of t.split('\n')) {
        const s = line.trim()
        if (s) parts.push(s)
      }
      n = n.nextSibling
    }
    return parts
  }

  function extractRaw() {
    const out = []
    for (const b of document.querySelectorAll('#table_body .dt-data, .dt-data')) {
      const headings = [...b.querySelectorAll('h3')]
      if (headings.length === 0) continue
      for (const h of headings) {
        const name = (h.textContent || '').trim()
        if (!name) continue
        const lines = linesBetween(h)
        const email =
          (
            h.parentElement?.querySelector?.('a[href^="mailto:"]')?.textContent ||
            ''
          ).trim() ||
          lines.find((l) => /@/.test(l)) ||
          ''
        // Prefer mailto belonging to this heading's immediate following block only
        const localMailto = (() => {
          let n = h.nextSibling
          while (n) {
            if (n.nodeType === 1 && (n.tagName === 'H3' || n.matches?.('h3'))) break
            if (n.nodeType === 1) {
              const a = n.querySelector?.('a[href^="mailto:"]')
              if (a) return (a.textContent || '').trim()
              if (n.matches?.('a[href^="mailto:"]'))
                return (n.textContent || '').trim()
            }
            n = n.nextSibling
          }
          return ''
        })()
        const emailFinal = localMailto || (headings.length === 1 ? email : '') || ''
        const phones = lines.filter((l) => /^[hmw]:\s*/i.test(l))
        const teacher = (lines.find((l) => /^Teacher:/i.test(l)) || '').replace(
          /^Teacher:\s*/i,
          '',
        )
        const nickname = (
          lines.find((l) => /^Nickname:/i.test(l)) || ''
        ).replace(/^Nickname:\s*/i, '')
        const team = (lines.find((l) => /^Team:/i.test(l)) || '').replace(
          /^Team:\s*/i,
          '',
        )
        const isStudent =
          /\((Kindergarten|Alumni|\d+(?:st|nd|rd|th))\)/i.test(name)
        const address = lines
          .filter(
            (l) =>
              l !== name &&
              l !== emailFinal &&
              !/@/.test(l) &&
              !/^Teacher:/i.test(l) &&
              !/^Nickname:/i.test(l) &&
              !/^Team:/i.test(l) &&
              !/^[hmw]:\s*/i.test(l) &&
              !/\b[hmw]:\s*\(?\d/i.test(l) &&
              !/\((Kindergarten|Alumni|\d+(?:st|nd|rd|th))\)/i.test(l),
          )
          .join(', ')
        const gm = gradeMeta(name)
        out.push({
          name,
          kind: isStudent ? 'student' : 'parent',
          email: emailFinal,
          phone: phones.join(' | '),
          address,
          teacher: teacher || team,
          nickname,
          grade: isStudent ? gm.grade : '',
          grad_year: isStudent ? gm.gradYear : '',
          school: isStudent
            ? gm.grade === 'Alumni'
              ? `${SCHOOL} Alumni`
              : gm.grade
                ? SCHOOL
                : ''
            : '',
        })
      }
    }
    return out.filter((r) => r.name)
  }

  function withHousehold(raw) {
    const out = []
    let parents = []
    for (const r of raw) {
      if (r.kind === 'parent') {
        if (out.length && out[out.length - 1].kind === 'student') parents = []
        parents.push(r)
        out.push({
          ...r,
          household_local: parents.map((p) => p.email || p.name).join('|'),
        })
      } else {
        out.push({
          ...r,
          household_local: parents.map((p) => p.email || p.name).join('|'),
          parent_emails: parents.map((p) => p.email).filter(Boolean),
          parent_names: parents.map((p) => p.name),
        })
      }
    }
    return out
  }

  function loadPage(page) {
    return new Promise((resolve, reject) => {
      let params = 'command=directoryPage&page=' + page
      if (typeof last_search !== 'undefined' && last_search !== '')
        params += '&' + last_search
      $.ajax({ type: 'POST', url: BASEURL + '/gateway', data: params })
        .done(function (resp) {
          try {
            if (typeof loadingOff === 'function') loadingOff('table_body')
            const ret = JSON.parse(resp)
            if (ret.err === 'AUTH') {
              reject(new Error('AUTH'))
              return
            }
            if (ret.result === 'OK') {
              $('#table_body').html(ret.html)
              if (typeof attach_fav_handler === 'function') attach_fav_handler()
              if (typeof show_hide_custom_data === 'function')
                show_hide_custom_data()
              resolve(extractRaw())
            } else reject(new Error('bad result'))
          } catch (e) {
            reject(e)
          }
        })
        .fail((_, s) => reject(new Error(s)))
    })
  }

  return (async () => {
    const all = []
    let multiStudentBlocks = 0
    for (let p = 1; p <= PAGE_COUNT; p++) {
      const rows = await loadPage(p)
      // count multi-student streaks on this page (for sanity)
      let streak = 0
      for (const r of rows) {
        if (r.kind === 'student') streak++
        else {
          if (streak > 1) multiStudentBlocks++
          streak = 0
        }
      }
      if (streak > 1) multiStudentBlocks++
      all.push(...withHousehold(rows).map((r) => ({ ...r, page: p })))
      await new Promise((r) => setTimeout(r, 200))
    }
    const marks = all.filter((r) => /marks/i.test(r.name))
    return {
      source: SCHOOL === 'CMS' ? 'coleytownmspta' : 'kingshighwaypta',
      school: SCHOOL,
      total: all.length,
      students: all.filter((r) => r.kind === 'student').length,
      parents: all.filter((r) => r.kind === 'parent').length,
      multiStudentBlocks,
      sampleMarks: marks,
      rows: all,
    }
  })()
})()
