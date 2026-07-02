const encoder = new TextEncoder();

export const LEGAL_DOCUMENTS = {
  'kvkk-aydinlatma-metni': {
    key: 'kvkk-aydinlatma-metni',
    title: 'KVKK Aydınlatma Metni',
    version: 'legal-20260702',
    url: '/legal/kvkk-aydinlatma-metni.html'
  },
  'on-bilgilendirme-formu': {
    key: 'on-bilgilendirme-formu',
    title: 'Ön Bilgilendirme Formu',
    version: 'legal-20260702',
    url: '/legal/on-bilgilendirme-formu.html'
  },
  'mesafeli-satis-sozlesmesi': {
    key: 'mesafeli-satis-sozlesmesi',
    title: 'Mesafeli Satış Sözleşmesi',
    version: 'legal-20260702',
    url: '/legal/mesafeli-satis-sozlesmesi.html'
  },
  'ticari-elektronik-ileti-izni': {
    key: 'ticari-elektronik-ileti-izni',
    title: 'Ticari Elektronik İleti Onayı',
    version: 'legal-20260702',
    url: '/legal/ticari-elektronik-ileti-izni.html'
  },
  'uyelik-sozlesmesi': {
    key: 'uyelik-sozlesmesi',
    title: 'Üyelik Sözleşmesi',
    version: 'legal-20260702',
    url: '/legal/uyelik-sozlesmesi.html'
  },
  'cosmoskin-club-kurallari': {
    key: 'cosmoskin-club-kurallari',
    title: 'COSMOSKIN Club Kuralları',
    version: 'legal-20260702',
    url: '/legal/cosmoskin-club-kurallari.html'
  },
  'cerez-politikasi': {
    key: 'cerez-politikasi',
    title: 'Çerez Politikası',
    version: 'legal-20260702',
    url: '/legal/cerez-politikasi.html'
  },
  'acik-riza-metni': {
    key: 'acik-riza-metni',
    title: 'Açık Rıza Metni',
    version: 'legal-20260702',
    url: '/legal/acik-riza-metni.html'
  }
};

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function legalDocumentKeyFromConsent(consentType) {
  if (consentType === 'kvkk_acknowledged') return 'kvkk-aydinlatma-metni';
  if (consentType === 'preliminary_information_accepted') return 'on-bilgilendirme-formu';
  if (consentType === 'distance_sales_accepted') return 'mesafeli-satis-sozlesmesi';
  if (consentType === 'marketing_email_opt_in') return 'ticari-elektronik-ileti-izni';
  if (consentType === 'membership_terms') return 'uyelik-sozlesmesi';
  return 'kvkk-aydinlatma-metni';
}

export async function legalDocumentSnapshot(key) {
  const doc = LEGAL_DOCUMENTS[key] || LEGAL_DOCUMENTS['kvkk-aydinlatma-metni'];
  const basis = `${doc.key}|${doc.version}|${doc.title}|${doc.url}`;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(basis));
  return { ...doc, hash: toHex(digest) };
}
