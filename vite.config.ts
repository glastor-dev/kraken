import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { GoogleGenAI } from '@google/genai';

const PROMPT =
  'Suggest a short, descriptive, SEO-friendly filename (lowercase, hyphens, no extension) for this image based on its content. Return ONLY the string.';

const toSafeSlug = (text: string) => {
  const base = text
    .trim()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return base || 'optimized-image';
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const apiKey = env.GEMINI_API_KEY;

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          name: 'dev-gemini-suggest-name',
          configureServer(server) {
            server.middlewares.use('/api/suggest-name', (req, res, next) => {
              if (req.method !== 'POST') {
                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Method Not Allowed' }));
                return;
              }

              if (!apiKey) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing GEMINI_API_KEY' }));
                return;
              }

              let raw = '';
              req.on('data', (chunk) => {
                raw += chunk;
              });
              req.on('end', async () => {
                try {
                  const body = raw ? JSON.parse(raw) : {};
                  const mimeType = body?.mimeType;
                  const data = body?.data;
                  if (!mimeType || !data) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Missing mimeType or data' }));
                    return;
                  }

                  const ai = new GoogleGenAI({ apiKey });
                  const response = await ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: [
                      {
                        parts: [{ text: PROMPT }, { inlineData: { mimeType, data } }],
                      },
                    ],
                  });

                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ name: toSafeSlug(response.text ?? '') }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err?.message || 'AI naming failed' }));
                }
              });
            });
          },
        },
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
