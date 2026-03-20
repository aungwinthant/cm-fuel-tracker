import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  try {
    const mainPageResponse = await fetch('https://cm-pump.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!mainPageResponse.ok) {
      return response.status(500).json({ error: 'Failed to fetch cm-pump.com' });
    }

    const html = await mainPageResponse.text();
    const priceDataMatch = html.match(/const\s+PRICE_DATA\s*=\s*(\{[\s\S]*?\});/);

    if (priceDataMatch && priceDataMatch[1]) {
      let jsonStr = priceDataMatch[1].trim();
      // Basic cleanup for common issues when extracting from HTML
      jsonStr = jsonStr.replace(/&quot;/g, '"')
                     .replace(/&apos;/g, "'")
                     .replace(/&lt;/g, '<')
                     .replace(/&gt;/g, '>')
                     .replace(/&amp;/g, '&');
      
      const priceData = JSON.parse(jsonStr);
      
      // Cache-Control for Vercel
      response.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');
      return response.status(200).json(priceData);
    }

    return response.status(500).json({ error: 'PRICE_DATA not found in HTML' });
  } catch (error) {
    return response.status(500).json({ error: (error as Error).message });
  }
}
