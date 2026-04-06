export default function StatusBadge({ status }) {
  if (status === 'checked_in') {
    return <span className="badge badge-success">✓ Checked In</span>;
  }
  return <span className="badge badge-neutral">— Pending</span>;
}
