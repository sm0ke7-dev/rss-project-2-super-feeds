interface BadgeProps {
  status: "running" | "success" | "error" | string;
}

const colors: Record<string, string> = {
  running: "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

export default function Badge({ status }: BadgeProps) {
  const cls = colors[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  );
}
