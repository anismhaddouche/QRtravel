import { useEffect } from 'react';
import { Users } from 'lucide-react';

// Renders a list of N member rows (firstName / lastName / phone / email)
// where N === peopleCount. Parent owns the array via `value` / `onChange`.
// When peopleCount grows we append empty rows; when it shrinks we drop
// from the tail. Empty member objects are kept so the user can fill them
// in any order; backend ignores entries whose names are still empty
// (it rejects them — UI validates before submit).
export default function GroupMembersEditor({ peopleCount, value, onChange }) {
  const members = Array.isArray(value) ? value : [];

  // Sync the array length with peopleCount.
  useEffect(() => {
    if (!Number.isInteger(peopleCount) || peopleCount < 2) return;
    if (members.length === peopleCount) return;
    if (members.length < peopleCount) {
      const padded = [
        ...members,
        ...Array.from({ length: peopleCount - members.length }, () => emptyMember()),
      ];
      onChange(padded);
    } else {
      onChange(members.slice(0, peopleCount));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleCount]);

  const updateMember = (i, patch) => {
    const next = members.map((m, idx) => (idx === i ? { ...m, ...patch } : m));
    onChange(next);
  };

  return (
    <div className="form-group" style={{ marginTop: '8px' }}>
      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Users size={14} /> Membres du groupe ({peopleCount})
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {Array.from({ length: peopleCount }).map((_, i) => {
          const m = members[i] || emptyMember();
          return (
            <div
              key={i}
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '10px',
                background: 'var(--surface-1, rgba(255,255,255,0.02))',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                Membre {i + 1}
              </div>
              <div className="form-grid-2" style={{ marginBottom: '6px' }}>
                <input
                  className="form-input"
                  placeholder="Nom"
                  value={m.lastName || ''}
                  onChange={(e) => updateMember(i, { lastName: e.target.value })}
                  aria-label={`Nom du membre ${i + 1}`}
                />
                <input
                  className="form-input"
                  placeholder="Prénom"
                  value={m.firstName || ''}
                  onChange={(e) => updateMember(i, { firstName: e.target.value })}
                  aria-label={`Prénom du membre ${i + 1}`}
                />
              </div>
              <div className="form-grid-2">
                <input
                  className="form-input"
                  placeholder="05....."
                  value={m.phone || ''}
                  onChange={(e) => updateMember(i, { phone: e.target.value })}
                  aria-label={`Téléphone du membre ${i + 1}`}
                />
                <input
                  type="email"
                  className="form-input"
                  placeholder="email@exemple.com"
                  value={m.email || ''}
                  onChange={(e) => updateMember(i, { email: e.target.value })}
                  aria-label={`Email du membre ${i + 1}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function emptyMember() {
  return { firstName: '', lastName: '', phone: '', email: '' };
}

// Frontend validation: each row needs at least firstName OR lastName;
// emails must look valid if present. Returns null if OK, else an error
// string ready to display.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateMembers(members, peopleCount) {
  if (!Array.isArray(members) || members.length !== peopleCount) {
    return `Renseignez les ${peopleCount} membres du groupe`;
  }
  for (let i = 0; i < members.length; i++) {
    const m = members[i] || {};
    if (!(m.firstName || '').trim() && !(m.lastName || '').trim()) {
      return `Membre ${i + 1} : nom ou prénom requis`;
    }
    const email = (m.email || '').trim();
    if (email && !EMAIL_RE.test(email)) {
      return `Membre ${i + 1} : email invalide`;
    }
    if ((m.phone || '').length > 30) {
      return `Membre ${i + 1} : téléphone trop long`;
    }
  }
  return null;
}
