// SPDX-License-Identifier: MIT
// JustWrite's ONE build config (Quasar CLI, app-structure §Q) — the renderer for every mode, the
// desktop app (Electron mode on the kit's runDesktopApp) and the phone app (Capacitor mode).
// Written from the family template (../just-llm-runner/template/quasar.config.js); what differs
// is JustWrite's: the kit UI alias, the dev port, the installer's settings.
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from '#q-app'

// `npm run` hands an `allow-scripts` setting from the user's .npmrc to every child process as
// npm_config_allow_scripts, and npm 11 refuses it in the project installs Quasar spawns
// (EALLOWSCRIPTS). Each project declares its own `allowScripts`, which npm uses instead.
delete process.env.npm_config_allow_scripts

const root = import.meta.dirname
const kitUi = path.resolve(root, '../just-llm-runner/ui')
// The package.json version, for the "What's new" modal's dismissal pin.
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version

export default defineConfig(() => {
  return {
    // The renderer's start-up (the old src/main.js): settings, stores, the kit's UI, the router
    // guards, the warm start — awaited before Quasar mounts the app.
    boot: ['jw'],

    css: [],

    // No Quasar icon font or Roboto: JustWrite's fonts are its own (src/fonts.css) and it uses no
    // Quasar component yet — the family theme and icon set come with the kit's UI on Quasar.
    extras: [],

    build: {
      vueRouterMode: 'hash',

      alias: {
        '@renderer': path.join(root, 'src'),
        // The kit's UI, consumed from source (the sibling checkout) for the dev/HMR loop.
        '@delebash/llm-ui': path.join(kitUi, 'src'),
      },

      extendViteConf (viteConf) {
        viteConf.resolve = viteConf.resolve || {}
        // The aliased kit imports its peer packages by bare name from its own folder, which has
        // no node_modules: ONE copy of each comes from this app's (Reka's provide/inject and
        // Vue's reactivity break with two).
        viteConf.resolve.dedupe = [
          ...(viteConf.resolve.dedupe || []),
          'vue', 'reka-ui', '@floating-ui/dom', 'pinia', 'vue-router', 'vue-i18n', 'marked',
          'vue-sonner', '@tanstack/vue-table', '@vueuse/core',
        ]
        viteConf.server = viteConf.server || {}
        // Never watched: the server, the development data folder (Chromium keeps its files
        // locked — EBUSY), the e2e fixtures (13k files), build output.
        const ignored = [].concat(viteConf.server.watch?.ignored || [])
        viteConf.server.watch = {
          ...(viteConf.server.watch || {}),
          ignored: [ ...ignored, '**/server/**', '**/data/**', '**/e2e/**', '**/dist/**', '**/release/**' ]
        }
        // The dev server reads the repo (docs/ for the Help viewer, node_modules/ for the bundled
        // fonts) and the sibling kit's UI, consumed from source.
        viteConf.server.fs = { ...(viteConf.server.fs || {}), allow: [ root, kitUi ] }
        viteConf.define = { ...(viteConf.define || {}), 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) }
      },
    },

    devServer: {
      // The kit's origin-aware resolver knows this port (installLlmUi devPorts) and the server's
      // CSRF guard allows it (server/src/app.js).
      port: 1420,
      strictPort: true,
      open: false
    },

    framework: {
      config: {},
      plugins: []
    },

    animations: [],

    capacitor: {
      hideSplashscreen: true
    },

    electron: {
      // The main process's dependencies (src-electron/package.json) are local packages — the
      // app's server/ and the family kit — named by `file:` paths relative to src-electron/.
      // Quasar copies them unchanged into dist/electron/UnPackaged/package.json, two folders
      // further down, so they're made absolute here. The root's `workspaces` field is copied
      // too and means nothing there.
      extendElectronPackageJson (pkgJson) {
        delete pkgJson.workspaces
        for (const [name, spec] of Object.entries(pkgJson.dependencies || {})) {
          if (typeof spec === 'string' && spec.startsWith('file:')) {
            pkgJson.dependencies[name] = `file:${path.resolve(root, 'src-electron', spec.slice(5))}`
          }
        }
      },

      // …and installed as real copies with their production dependencies only — a `file:` link
      // would bring the linked folder's whole node_modules, development tools included
      unPackagedInstallParams: [ 'install', '--install-links' ],

      preloadScripts: [ 'electron-preload' ],

      inspectPort: 5858,

      // the family packages with electron-builder (installers: NSIS on Windows)
      bundler: 'builder',

      builder: {
        // https://www.electron.build/configuration
        appId: 'com.justwrite.app',
        productName: 'JustWrite',
        files: [
          '**/*',
          '!**/node_modules/better-sqlite3/{deps,src,build/Release/obj,build/Release/obj.target,build/deps}/**',
          '!**/node_modules/better-sqlite3/build/Release/*.{pdb,iobj,ipdb,lib,exp}'
        ],
        // native modules can't load from inside the asar archive; the bundled samples stay
        // outside it, as they did before the move
        asarUnpack: [ '**/*.node', 'node_modules/justwrite-server/samples/**' ],
        // the headless launcher (justwrite-server.cmd) beside the exe
        extraResources: [ { from: path.join(root, 'build', 'launcher'), to: '..' } ],
        win: { target: 'nsis', executableName: 'justwrite' },
        nsis: {
          oneClick: false,
          perMachine: false,
          allowToChangeInstallationDirectory: true,
          include: path.resolve(root, '../just-llm-runner/server/src/shell/installer.nsh')
        },
        electronFuses: {
          runAsNode: true,
          enableCookieEncryption: true,
          enableNodeOptionsEnvironmentVariable: false,
          enableNodeCliInspectArguments: false,
          enableEmbeddedAsarIntegrityValidation: true,
          onlyLoadAppFromAsar: true,
          grantFileProtocolExtraPrivileges: false
        },
        // macOS: one universal .dmg (Intel and Apple silicon), as the release has shipped
        mac: { category: 'public.app-category.productivity', target: [ { target: 'dmg', arch: [ 'universal' ] } ] },
        linux: { target: [ 'AppImage', 'deb' ], category: 'Office' }
      }
    }
  }
})
