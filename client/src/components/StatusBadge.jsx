import { CheckCircle2, Clock } from 'lucide-react';

export default function StatusBadge({ status }) {
  if (status === 'checked_in') {
    return (
      <span className="badge badge-success">
        <CheckCircle2 size={14} />
        Embarqué
      </span>
    );
  }
  return (
    <span className="badge badge-neutral">
      <Clock size={14} />
      En attente
    </span>
  );
}
