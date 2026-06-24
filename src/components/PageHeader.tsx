export default function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
