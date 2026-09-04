import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          // Injecté dans la fenêtre Anime-Sama, avant les scripts du site.
          watch: resolve(__dirname, 'src/preload/watch.ts'),
          // La petite fenêtre de mise à jour : quatre canaux, pas le pont
          // complet de l'app.
          update: resolve(__dirname, 'src/preload/update.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': shared
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          // Une page à part, sans React ni Tailwind : la carte de mise à jour
          // doit paraître à l'instant, pas après le rendu complet de l'app.
          update: resolve(__dirname, 'src/renderer/update.html')
        }
      }
    }
  }
})
