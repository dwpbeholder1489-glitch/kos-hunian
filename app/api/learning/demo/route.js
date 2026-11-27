import { calculateDemo } from '../../../../lib/learningDemo.js';

export async function POST(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'Gunakan data simulasi JSON.' }, { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: 'Data simulasi kosong.' }, { status: 400 });
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return Response.json({ error: 'Data simulasi terlalu besar.' }, { status: 413 });
      }
      body += decoder.decode(value, { stream: true });
    }
    const result = calculateDemo(JSON.parse(body + decoder.decode()));
    return Response.json(result, { status: result.error ? 422 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Data simulasi tidak dapat dibaca.' }, { status: 400 });
  }
}
