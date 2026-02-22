type KpiColor = "blue" | "green" | "orange" | "purple" | "gray";

const colorMap: Record<
  KpiColor,
  { bg: string; text: string; iconBg: string }
> = {
  blue: { bg: "bg-blue-50", text: "text-blue-700", iconBg: "bg-blue-100" },
  green: { bg: "bg-green-50", text: "text-green-700", iconBg: "bg-green-100" },
  orange: { bg: "bg-orange-50", text: "text-orange-700", iconBg: "bg-orange-100" },
  purple: { bg: "bg-purple-50", text: "text-purple-700", iconBg: "bg-purple-100" },
  gray: { bg: "bg-gray-50", text: "text-gray-700", iconBg: "bg-gray-100" },
};

export default function KpiCard({
  title,
  value,
  subtitle,
  icon,
  color = "blue",
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon?: string;
  color?: KpiColor;
}) {
  const c = colorMap[color];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        {icon && (
          <div className={`rounded-lg ${c.iconBg} p-2.5 text-xl`}>{icon}</div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 truncate">{title}</p>
          <p className={`mt-1 text-3xl font-bold ${c.text}`}>
            {typeof value === "number" ? value.toLocaleString("fr-FR") : value}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
