#!/usr/bin/env node
/**
 * Recompile native addons for the current Node ABI (Netlify build + Lambda runtime).
 * Prebuilt binaries (e.g. node-expat for Node 20) fail at runtime on Node 22.
 */
const { execSync } = require('node:child_process')

const MODULES = ['better-sqlite3', 'node-expat']

function main() {
  console.info(
    `[rebuild-native] Node ${process.version} (NODE_MODULE_VERSION ${process.versions.modules})`,
  )

  for (const name of MODULES) {
    console.info(`[rebuild-native] rebuilding ${name} from source…`)
    execSync(`npm rebuild ${name} --build-from-source`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_build_from_source: 'true',
      },
    })
  }

  console.info('[rebuild-native] done')
}

main()
