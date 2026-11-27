const uuid = (value) => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);

// Called by the existing portal routes after resolving their credentials.
export async function portalExchange(sb, body, access, credential, slug = null) {
  const { order, operation, message, content, before } = body;
  if (!uuid(order) || !['send', 'read', 'list'].includes(operation) ||
      (operation !== 'list' && !uuid(message)) || (before != null && !uuid(before)) ||
      (operation === 'send' && (typeof content !== 'string' || content.length > 2000 || !content.trim()))) {
    return [ { error: 'Permintaan percakapan tidak valid.' }, 400 ];
  }
  const { data, error } = await sb.rpc('cx_exchange', {
    p_reference: order, p_slug: slug, p_credential: credential, p_access: access,
    p_action: operation, p_message: message || null, p_body: content || null, p_before: before || null,
  });
  if (error) return [{ error: 'Percakapan sedang tidak tersedia.' }, 503];
  if (!data) return [{ error: 'Percakapan tidak ditemukan atau akses sudah berakhir.' }, 404];
  return [data, data.error ? 400 : 200];
}
