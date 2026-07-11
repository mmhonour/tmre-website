#!/usr/bin/env node
/**
 * Refresh native addon prebuilds for the current Node ABI on Netlify CI.
 *
 * Do NOT use `npm rebuild` or node-gyp here: compiling on Netlify Noble (glibc 2.38)
 * writes build/Release/*.node files that fail on AWS Lambda (older glibc). Instead,
 * delete any compiled artifacts and run prebuild-install to fetch manylinux binaries.
 */
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

/** Packages that ship Lambda-compatible binaries via prebuild-install. */
const PREBUILD_MODULES = ['better-sqlite3']

function rmIfExists(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true })
  }
}

function refreshPrebuildOnly(packageName) {
  const moduleDir = path.join(process.cwd(), 'node_modules', packageName)
  if (!fs.existsSync(path.join(moduleDir, 'package.json'))) {
    throw new Error(`[rebuild-native] missing ${packageName} — run npm install first`)
  }

  // bindings() prefers build/Release over prebuilds/ — remove Noble-compiled copies.
  rmIfExists(path.join(moduleDir, 'build'))

  console.info(
    `[rebuild-native] prebuild-install for ${packageName} (Node ABI ${process.versions.modules})…`,
  )
  execSync('npx --yes prebuild-install --verbose', {
    cwd: moduleDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_build_from_source: 'false',
    },
  })

  const bindingName = packageName === 'better-sqlite3' ? 'better_sqlite3.node' : 'bindings.node'
  const candidates = [
    path.join(moduleDir, 'build', 'Release', bindingName),
    path.join(moduleDir, 'build', 'Debug', bindingName),
    path.join(moduleDir, 'prebuilds', `${process.platform}-${process.arch}`, bindingName),
  ]
  const found = candidates.find((candidate) => fs.existsSync(candidate))
  if (!found) {
    throw new Error(
      `[rebuild-native] prebuild-install did not place ${bindingName} for ${packageName} — deploy would fail on Lambda`,
    )
  }
  console.info(`[rebuild-native] ${packageName} prebuild ready: ${found}`)
}

function main() {
  console.info(
    `[rebuild-native] Node ${process.version} (NODE_MODULE_VERSION ${process.versions.modules})`,
  )

  for (const name of PREBUILD_MODULES) {
    refreshPrebuildOnly(name)
  }

  console.info('[rebuild-native] done')
}

main()
