import { GoogleGenAI } from '@google/genai';

const PROMPT =
  'Suggest a short, descriptive, SEO-friendly filename (lowercase, hyphens, no extension) for this image based on its content. Return ONLY the string.';

const getResponseText = async (response: any): Promise<string> => {
  const t = response?.text;
  if (typeof t === 'function') {
    const v = await t.call(response);
    return typeof v === 'string' ? v : String(v ?? '');
  }

  return typeof t === 'string' ? t : '';
};

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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY as string | undefined;
  if (!apiKey) {
    res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const mimeType = body?.mimeType as string | undefined;
    const data = body?.data as string | undefined;

    if (!mimeType || !data) {
      res.status(400).json({ error: 'Missing mimeType or data' });
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

    const responseText = await getResponseText(response);
    res.status(200).json({ name: toSafeSlug(responseText) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'AI naming failed' });
  }
}
