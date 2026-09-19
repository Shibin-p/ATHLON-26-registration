import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function apiDevServerPlugin(): Plugin {
  return {
    name: 'api-dev-server-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/')) {
          return next();
        }

        try {
          const pathname = url.split('?')[0];
          if (pathname === '/api/coordinators/create') {
            const mod = await server.ssrLoadModule('./api/coordinators/create.ts');
            return await mod.default(req, res);
          }
          if (pathname === '/api/coordinators/list-auth-users') {
            const mod = await server.ssrLoadModule('./api/coordinators/list-auth-users.ts');
            return await mod.default(req, res);
          }
          if (pathname === '/api/coordinators/assign') {
            const mod = await server.ssrLoadModule('./api/coordinators/assign.ts');
            return await mod.default(req, res);
          }
          next();
        } catch (err: any) {
          console.error('API middleware error:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err?.message || 'Internal Server Error' }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Populate process.env for Node-side Admin SDK in dev server
  for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) {
      process.env[k] = v;
    }
  }

  return {
    plugins: [react(), apiDevServerPlugin()],
  };
});
