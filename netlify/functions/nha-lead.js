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
  const token = process.env.GHL_NHA_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID || 'YWqpKD4sUowkj4mAYX5A';
  if (!token) return { statusCode: 500, headers, body: JSON.stringify({ ok:false, error:'Missing GHL_NHA_TOKEN' }) };
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const phone = String(body.phone || '').trim();
  const email = String(body.email || '').trim();
  const interest = String(body.interest || '').trim();
  const message = String(body.message || '').trim();
  const consent = !!body.consent;
  if (!firstName || !phone || !interest || !consent) return { statusCode: 422, headers, body: JSON.stringify({ ok:false, error:'Missing required fields' }) };
  const payload = {
    locationId,
    firstName,
    lastName,
    phone,
    email: email || undefined,
    source: 'NHA Gold/Karis custom LP',
    tags: ['nha-gold-karis-lp','meta-weekend','lead-optin','gold-karis-interest'],
    customFields: [
      { key: 'contact.treatment_of_interest', field_value: interest },
      { key: 'contact.marketing_consent', field_value: 'yes - web opt-in' }
    ].filter(Boolean)
  };
  const resp = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  if (!resp.ok) return { statusCode: resp.status, headers, body: text };
  // Optional note. Ignore note failure so lead capture still succeeds.
  try {
    const parsed = JSON.parse(text);
    const contactId = parsed.contact?.id || parsed.id;
    if (contactId && (interest || message)) {
      await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ body: `NHA Gold/Karis LP inquiry\nInterest: ${interest}\nMessage: ${message || '(none)'}\nConsent: phone/text/email opt-in; consent not condition of purchase; STOP opt-out shown.` })
      });
    }
  } catch {}
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};
