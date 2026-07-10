#!/usr/bin/env node
/**
 * Refresh native addon prebuilds for the current Node ABI on Netlify CI.
 *
 * Do NOT use --build-from-source here: compiling on Netlify Noble (glibc 2.38)
 * produces .node files that fail on AWS Lambda (older glibc). prebuild-install
 * ships manylinux binaries compatible with both build and Lambda runtime.
 */
const { execSync } = require('node:child_process')

const MODULES = ['better-sqlite3', 'node-expat']

function main() {
  console.info(
    `[rebuild-native] Node ${process.version} (NODE_MODULE_VERSION ${process.versions.modules})`,
  )

  for (const name of MODULES) {
    console.info(`[rebuild-native] refreshing ${name} prebuild for this Node ABI…`)
    execSync(`npm rebuild ${name}`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        // Ensure we never compile against Noble glibc during deploy builds.
        npm_config_build_from_source: 'false',
      },
    })
  }

  console.info('[rebuild-native] done')
}

main()
