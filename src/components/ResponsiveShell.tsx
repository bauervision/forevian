export default function ResponsiveShell({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        {right}
      </div>
      {children}
    </div>
  );
}
