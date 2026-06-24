import AppNavbar from "./AppNavbar";

export default function AppPageHeader({
  items,
  title,
  actions,
}: {
  items: { label: string; href?: string }[];
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <>
      <AppNavbar items={items} />
      <div className="page-header">
        <h1>{title}</h1>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </>
  );
}
