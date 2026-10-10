// SPDX-License-Identifier: MIT
// JustWrite's ONE build config (Quasar CLI, app-structure §Q) — the renderer for every mode, the
// desktop app (Electron mode on the kit's runDesktopApp) and the phone app (Capacitor mode).
// Written from the family template (../just-llm-runner/template/quasar.config.js); what differs
// is JustWrite's: the kit UI alias, the dev port, the installer's settings.
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineConfig } from '#q-app'

// `npm run` hands an `allow-scripts` setting from the user's .npmrc to every child process as
// npm_config_allow_scripts, and npm 11 refuses it in the project installs Quasar spawns
// (EALLOWSCRIPTS). Each project declares its own `allowScripts`, which npm uses instead.
delete process.env.npm_config_allow_scripts

const root = import.meta.dirname
const kitUi = path.resolve(root, '../just-llm-runner/ui')
// The package.json version, for the "What's new" modal's dismissal pin.
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version

export default defineConfig((ctx) => {
  // The phone runs JustWrite's server inside the app, in a web worker (src/phone/; the kit's
  // docs/plans/2026-10-08-the-phone.md) — and so does a browser dev run with
  // JUSTWRITE_IN_APP_SERVER=1, to try it without a phone.
  const inAppServer = !!ctx.mode.capacitor || process.env.JUSTWRITE_IN_APP_SERVER === '1'
  // The worker's bundle is built first (scripts/phone-worker.js — imported at run time, by path:
  // Quasar bundles this file, which would move its import.meta.url).
  const buildPhoneWorker = async () => {
    if (!inAppServer) return
    const { buildPhoneWorker } = await import(pathToFileURL(path.join(root, 'scripts', 'phone-worker.js')).href)
    await buildPhoneWorker()
  }

  return {
    // vue-i18n first (as the CLI's i18n preset wires it), then the renderer's start-up (the old
    // src/main.js): settings, stores, the kit's UI, the router guards, the warm start — awaited
    // before Quasar mounts the app.
    boot: ['i18n', 'jw'],

    // The stylesheets, in cascade order: the self-hosted fonts first (so they land earliest in the
    // emitted stylesheet), the design tokens the family theme reads, the kit's own (its AI views, its
    // controls, its Quasar theme — `~` = imported as written, through the alias), then the app's, so
    // JustWrite's rules win a tie with the kit's, as they always have (until the stylesheets moved
    // here from the boot file, the kit's loaded first because the boot's modules imported the kit
    // before it imported styles.css). Plain names are src/css/.
    css: [
      'fonts.css',
      'tokens.css',
      '~@delebash/llm-ui/styles.css',
      '~@delebash/llm-ui/common/styles.css',
      '~@delebash/llm-ui/quasar/theme.css',
      'app.scss',
    ],

    // No Quasar icon font or Roboto: JustWrite's fonts are its own (src/css/fonts.css), and the
    // icons Quasar's components draw are the kit's line icons (its icon set).
    extras: [],

    build: {
      vueRouterMode: 'hash',
      // a browser build with the in-app server is a try-out, never the headless UI (dist/spa)
      ...(inAppServer && !ctx.mode.capacitor ? { distDir: 'dist/spa-in-app' } : {}),

      alias: {
        '@renderer': path.join(root, 'src'),
        // The kit's UI, consumed from source (the sibling checkout) for the dev/HMR loop.
        '@delebash/llm-ui': path.join(kitUi, 'src'),
        // The phone's pieces (its in-app server, the share sheet, the code scanner); null on a
        // computer.
        '#phone': path.join(root, 'src', 'phone', inAppServer ? 'index.js' : 'none.js'),
      },

      beforeDev: buildPhoneWorker,
      beforeBuild: buildPhoneWorker,

      extendViteConf (viteConf) {
        viteConf.resolve = viteConf.resolve || {}
        // the in-app server is a module worker (src/phone/boot.js)
        viteConf.worker = { ...(viteConf.worker || {}), format: 'es' }
        // The aliased kit imports its peer packages by bare name from its own folder, which has
        // no node_modules: ONE copy of each comes from this app's (Vue's provide/inject and
        // reactivity, and Quasar's, break with two).
        viteConf.resolve.dedupe = [
          ...(viteConf.resolve.dedupe || []),
          'vue', 'quasar', '@floating-ui/dom', 'pinia', 'vue-router', 'vue-i18n', 'marked',
          '@vueuse/core', 'qrcode',
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
      // the family's Quasar settings (the kit's docs/app-structure.md §Q): no Material ripple
      config: { ripple: false },
      plugins: ['Notify']
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
        // the updater's feed (https://www.electron.build/publish): app-update.yml in the app and
        // latest*.yml beside the installers, written even under -P never; the release workflow
        // uploads them
        publish: [ { provider: 'github', owner: 'delebash', repo: 'justwrite-app' } ],
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
