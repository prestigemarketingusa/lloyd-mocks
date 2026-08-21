// NHWL Spanish LP lead relay → GHL NHWL Main contacts/upsert.
// Token lives ONLY in the Netlify env var GHL_NHWL_MAIN — never client-side.
// Record-only upsert: tags nhwl-es-lp/a2p/espanol land the lead in Main;
// marketing sends happen later from NHWL 4. This function must never trigger sends.
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: 'Bad JSON' }; }
  if (body['bot-field']) return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  const token = process.env.GHL_NHWL_MAIN;
  const locationId = 'hC9EybntPH9CUQODfL6F'; // NHWL Main
  if (!token) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Missing GHL_NHWL_MAIN' }) };
  const nombre = String(body.nombre || '').trim();
  const telefono = String(body.telefono || '').trim();
  const email = String(body.email || '').trim();
  const mayor40 = String(body.mayor40 || '').trim();
  const consent = !!body.consent;
  if (!nombre || !telefono || !consent) return { statusCode: 422, headers, body: JSON.stringify({ ok: false, error: 'Missing required fields' }) };
  const payload = {
    locationId,
    firstName: nombre,
    phone: telefono,
    email: email || undefined,
    source: 'NHWL Spanish UGC LP (Socorro)',
    tags: ['nhwl-es-lp', 'a2p', 'espanol']
  };
  const resp = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  if (!resp.ok) return { statusCode: resp.status, headers, body: text };
  // Note with intake details; note failure must not fail the lead capture.
  try {
    const parsed = JSON.parse(text);
    const contactId = parsed.contact?.id || parsed.id;
    if (contactId) {
      await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ body: `NHWL Spanish LP (Socorro UGC) lead\n¿Mayor de 40?: ${mayor40 || '(sin respuesta)'}\nConsent: SÍ — voz en vivo/IA + SMS + email, STOP/AYUDA mostrado, no requerido para comprar.` })
      });
    }
  } catch {}
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};
