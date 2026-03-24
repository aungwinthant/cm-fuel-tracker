import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';
import * as dotenv from 'dotenv';

// Load .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Helper to dynamically load Vercel-style API handlers
app.all('/api/*', async (req, res) => {
  try {
    const apiPath = req.path.replace('/api/', '');
    const apiFile = path.join(__dirname, '..', 'api', `${apiPath}.ts`);
    const apiIndexFile = path.join(__dirname, '..', 'api', apiPath, 'index.ts');
    const apiNestedFile = path.join(__dirname, '..', 'api', `${apiPath}.ts`); // auth/login.ts
    
    // Support nested routes like api/auth/login.ts
    let finalPath = apiFile;
    if (!fs.existsSync(apiFile)) {
      finalPath = path.join(__dirname, '..', 'api', `${apiPath}.ts`);
      if (!fs.existsSync(finalPath)) {
        // Try folder structure: api/auth/login.ts
        const parts = apiPath.split('/');
        finalPath = path.join(__dirname, '..', 'api', ...parts) + '.ts';
      }
    }

    console.log(`[API Dev Server] Mapping ${req.path} -> ${finalPath}`);

    if (!fs.existsSync(finalPath)) {
      return res.status(404).json({ error: `API endpoint not found at ${finalPath}` });
    }

    // Ensure absolute path and convert to file:// URL for Windows compatibility
    const absolutePath = path.resolve(finalPath);
    const fileUrl = pathToFileURL(absolutePath).href;
    console.log(`[API Dev Server] Importing: ${fileUrl}`);
    const module = await import(fileUrl);
    
    // Standard Vercel exports are GET, POST, etc. or default handler
    const handler = module[req.method] || module.default;

    if (typeof handler !== 'function') {
      return res.status(500).json({ error: `Method ${req.method} not implemented in ${finalPath}` });
    }

    // Call the handler. Vercel handlers use Fetch API (Request/Response)
    // We need to bridge Express req/res to Web Request/Response
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const webReq = new Request(url, {
      method: req.method,
      headers: new Headers(req.headers as any),
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined,
    });

    const webRes = await handler(webReq);
    
    // Copy headers
    webRes.headers.forEach((v: string, k: string) => res.setHeader(k, v));
    res.status(webRes.status);
    
    const body = await webRes.text();
    res.send(body);

  } catch (error: any) {
    console.error('[API Dev Server] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
createServer(app).listen(PORT, () => {
  console.log(`\n🚀 API Dev Server running at http://localhost:${PORT}`);
});
