import { useEffect } from 'react';
import { Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    <div className="grid gap-3">
      <Label className="flex items-center gap-1.5">
        <Users size={14} /> Membres du groupe ({peopleCount})
      </Label>
      <div className="flex flex-col gap-3">
        {Array.from({ length: peopleCount }).map((_, i) => {
          const m = members[i] || emptyMember();
          return (
            <div
              key={i}
              className="rounded-md border border-border bg-card p-3 grid gap-2"
            >
              <div className="text-xs font-semibold text-muted-foreground">
                Membre {i + 1}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="Nom"
                  value={m.lastName || ''}
                  onChange={(e) => updateMember(i, { lastName: e.target.value })}
                  aria-label={`Nom du membre ${i + 1}`}
                />
                <Input
                  placeholder="Prénom"
                  value={m.firstName || ''}
                  onChange={(e) => updateMember(i, { firstName: e.target.value })}
                  aria-label={`Prénom du membre ${i + 1}`}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="05....."
                  value={m.phone || ''}
                  onChange={(e) => updateMember(i, { phone: e.target.value })}
                  aria-label={`Téléphone du membre ${i + 1}`}
                />
                <Input
                  type="email"
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
