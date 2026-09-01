#!/usr/bin/env node
/**
 * Export this project's Cursor chat history to readable markdown.
 *
 * Cursor documents no export for local IDE chats, so this reads the on-disk
 * transcripts directly. That location is undocumented and may move or change
 * format in any release — if this stops finding files, pass --source.
 *
 * Usage:
 *   node scripts/export-chat-history.mjs [--out DIR] [--tools] [--limit N]
 *
 *   --out DIR    destination (default .tmp-chat-export, which .gitignore covers)
 *   --tools      include a compact line naming the tools used in each turn
 *   --limit N    only the N most recently updated chats
 *   --source DIR transcript root, if the default no longer resolves
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'

function parseArgs(argv) {
  const args = { out: '.tmp-chat-export', tools: false, limit: 0, source: '' }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--tools') args.tools = true
    else if (a === '--out') args.out = argv[++i] ?? args.out
    else if (a === '--source') args.source = argv[++i] ?? ''
    else if (a === '--limit') args.limit = Number(argv[++i] ?? 0) || 0
  }
  return args
}

/** Transcript roots for the current working directory's project. */
function findTranscriptRoots(explicit) {
  if (explicit) return [explicit]
  const projects = join(homedir(), '.cursor', 'projects')
  const wanted = basename(process.cwd()).toLowerCase()
  let dirs = []
  try {
    dirs = readdirSync(projects)
  } catch {
    return []
  }
  return dirs
    .filter((d) => d.toLowerCase().includes(wanted))
    .map((d) => join(projects, d, 'agent-transcripts'))
    .filter((d) => {
      try {
        return statSync(d).isDirectory()
      } catch {
        return false
      }
    })
}

/** Every .jsonl transcript under a root, newest first. Handles flat or per-chat dirs. */
function collectTranscripts(root) {
  const out = []
  const push = (path) => {
    const st = statSync(path)
    out.push({ path, mtimeMs: st.mtimeMs, size: st.size })
  }
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      for (const inner of readdirSync(full)) {
        if (inner.endsWith('.jsonl')) push(join(full, inner))
      }
    } else if (entry.endsWith('.jsonl')) {
      push(full)
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

const TIMESTAMP_RE = /<timestamp>([^<]+)<\/timestamp>/
/** Harness-injected context the reader did not write and does not want to reread. */
const NOISE_TAGS = [
  'system_reminder',
  'attached_files',
  'system_notification',
  'git_status',
  'rules',
  'agent_transcripts',
  'available_skills',
  'previous_tool_call',
]

function stripNoise(text) {
  let out = text
  for (const tag of NOISE_TAGS) {
    out = out.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'g'), '')
  }
  const query = out.match(/<user_query>([\s\S]*?)<\/user_query>/)
  if (query) out = query[1]
  return out.replace(TIMESTAMP_RE, '').trim()
}

/** Flatten one transcript line into { role, text, tools }. */
function readEvent(line) {
  let ev
  try {
    ev = JSON.parse(line)
  } catch {
    return null
  }
  const role = ev.role
  if (role !== 'user' && role !== 'assistant') return null
  const parts = Array.isArray(ev.message?.content) ? ev.message.content : []
  const texts = []
  const tools = []
  for (const part of parts) {
    if (part?.type === 'text' && typeof part.text === 'string') texts.push(part.text)
    else if (part?.type === 'tool_use' && typeof part.name === 'string') tools.push(part.name)
  }
  const raw = texts.join('\n\n')
  return {
    role,
    text: role === 'user' ? stripNoise(raw) : raw.trim(),
    tools,
    stamp: raw.match(TIMESTAMP_RE)?.[1] ?? null,
  }
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .slice(0, 9)
      .join('-') || 'chat'
  )
}

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

function renderChat(file, includeTools) {
  const lines = readFileSync(file.path, 'utf8').split('\n')
  const events = []
  for (const line of lines) {
    if (!line.trim()) continue
    const ev = readEvent(line)
    if (ev && (ev.text || ev.tools.length > 0)) events.push(ev)
  }
  if (events.length === 0) return null

  const firstUser = events.find((e) => e.role === 'user' && e.text)
  const title = firstUser
    ? firstUser.text.split('\n')[0].slice(0, 90).trim()
    : 'Untitled chat'
  const firstStamp = events.find((e) => e.stamp)?.stamp ?? null

  // One turn spans many events; group consecutive same-role events into a block
  // so the export reads like a conversation rather than an event log.
  const blocks = []
  for (const ev of events) {
    const last = blocks[blocks.length - 1]
    if (last && last.role === ev.role) {
      if (ev.text) last.texts.push(ev.text)
      last.tools.push(...ev.tools)
    } else {
      blocks.push({ role: ev.role, texts: ev.text ? [ev.text] : [], tools: [...ev.tools] })
    }
  }

  const userCount = blocks.filter((b) => b.role === 'user').length
  const body = blocks
    .map((b) => {
      const heading = b.role === 'user' ? '## You' : '## Assistant'
      const chunks = [heading]
      if (b.texts.length > 0) chunks.push(b.texts.join('\n\n'))
      if (includeTools && b.tools.length > 0) {
        const counts = new Map()
        for (const t of b.tools) counts.set(t, (counts.get(t) ?? 0) + 1)
        const summary = [...counts.entries()]
          .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
          .join(', ')
        chunks.push(`_Tools: ${summary}_`)
      }
      return chunks.join('\n\n')
    })
    .join('\n\n---\n\n')

  const chatId = basename(file.path, '.jsonl')
  const header = [
    `# ${title}`,
    '',
    `- Chat id: \`${chatId}\``,
    `- Started: ${firstStamp ?? 'unknown'}`,
    `- Last updated: ${new Date(file.mtimeMs).toISOString()}`,
    `- Exchanges: ${userCount}`,
    '',
  ].join('\n')

  return {
    chatId,
    title,
    userCount,
    mtimeMs: file.mtimeMs,
    filename: `${isoDay(file.mtimeMs)}-${slugify(title)}.md`,
    markdown: `${header}\n${body}\n`,
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const roots = findTranscriptRoots(args.source)
  if (roots.length === 0) {
    console.error(
      'No transcript directory found for this project. Pass --source <dir> if Cursor moved it.',
    )
    process.exit(1)
  }

  let files = roots.flatMap((r) => collectTranscripts(r))
  if (files.length === 0) {
    console.error(`No .jsonl transcripts under: ${roots.join(', ')}`)
    process.exit(1)
  }
  if (args.limit > 0) files = files.slice(0, args.limit)

  mkdirSync(args.out, { recursive: true })
  const written = []
  for (const file of files) {
    let chat
    try {
      chat = renderChat(file, args.tools)
    } catch (err) {
      console.warn(`  skipped ${basename(file.path)} — ${err.message}`)
      continue
    }
    if (!chat) continue
    // Two chats opened the same day about the same thing would collide.
    let name = chat.filename
    if (written.some((w) => w.filename === name)) {
      name = name.replace(/\.md$/, `-${chat.chatId.slice(0, 8)}.md`)
    }
    writeFileSync(join(args.out, name), chat.markdown, 'utf8')
    written.push({ ...chat, filename: name })
  }

  const index = [
    '# Cursor chat history',
    '',
    `Exported ${new Date().toISOString()} · ${written.length} chats`,
    '',
    '| Updated | Exchanges | Chat |',
    '| --- | --- | --- |',
    ...written.map(
      (c) =>
        `| ${isoDay(c.mtimeMs)} | ${c.userCount} | [${c.title.replace(/\|/g, '\\|')}](./${encodeURIComponent(c.filename)}) |`,
    ),
    '',
  ].join('\n')
  writeFileSync(join(args.out, 'index.md'), index, 'utf8')

  console.info(`Exported ${written.length} chats to ${args.out}`)
  console.info(`Start at ${join(args.out, 'index.md')}`)
}

main()
