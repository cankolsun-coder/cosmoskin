export function dhlConfigured(env = {}) {
  return Boolean(env.DHL_API_BASE_URL && (env.DHL_API_KEY || env.DHL_CLIENT_ID) && env.DHL_API_SECRET && env.DHL_ACCOUNT_NUMBER);
}

export function buildManualShipmentPayload({ order = {}, body = {} }) {
  return {
    provider: 'manual',
    carrier: body.carrier || 'DHL',
    carrier_name: body.carrier_name || 'DHL',
    tracking_number: body.tracking_number || null,
    tracking_url: body.tracking_url || null,
    status: body.status || 'label_pending',
    direction: body.direction || 'outbound',
    label_format: body.label_format || 'PDF',
    package_weight_kg: Number(body.package_weight_kg || 0.5),
    recipient_snapshot: {
      order_number: order.order_number || null,
      name: [order.customer_first_name, order.customer_last_name].filter(Boolean).join(' '),
      email: order.customer_email || null,
      phone: order.customer_phone || null,
      city: order.city || null,
      district: order.district || null,
      address_line: order.address_line || null,
      postal_code: order.postal_code || null
    },
    provider_payload: { mode: 'manual_fallback' },
    provider_response: null,
    error_message: null
  };
}
