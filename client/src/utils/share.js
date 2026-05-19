// Helpers for building share links (WhatsApp / mailto) and the public
// QR-share URL. Pure functions, no React, easy to test.

// Returns an absolute URL like "https://app.example.com/qr/TRV-123"
// using the current page origin in the browser. The QR share page is
// served by the Express app at /qr/:referenceCode.
export function getTravelerQrLink(referenceCode, origin) {
  if (!referenceCode) return null;
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/qr/${encodeURIComponent(referenceCode)}`;
}

function compactPhone(phone) {
  if (!phone) return null;
  // wa.me expects digits only (with optional country code). Strip anything else.
  const digits = String(phone).replace(/[^\d]/g, '');
  return digits.length >= 6 ? digits : null;
}

export function buildShareMessage({ traveler, trip, qrLink, agencyName }) {
  const name = (traveler && traveler.displayName) || '';
  const ref = (traveler && traveler.referenceCode) || '';
  const tripName = (trip && trip.name) || 'votre voyage';
  const lines = [
    `Bonjour ${name},`,
    '',
    `Voici votre QR code pour le voyage ${tripName}.`,
    `Code de référence : ${ref}`,
  ];
  if (qrLink) lines.push(`QR code : ${qrLink}`);
  lines.push('');
  lines.push('Merci de présenter ce QR code au moment de l\'embarquement.');
  if (agencyName) { lines.push(''); lines.push('Cordialement,'); lines.push(agencyName); }
  return lines.join('\n');
}

export function buildWhatsAppLink({ traveler, trip, qrLink, agencyName }) {
  const phone = compactPhone(traveler && traveler.phone);
  if (!phone) return null;
  const msg = buildShareMessage({ traveler, trip, qrLink, agencyName });
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

export function buildMailtoLink({ traveler, trip, qrLink, agencyName }) {
  const email = traveler && traveler.email;
  if (!email) return null;
  const subject = `Votre QR code pour le voyage ${(trip && trip.name) || ''}`.trim();
  const body = buildShareMessage({ traveler, trip, qrLink, agencyName });
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
