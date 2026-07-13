import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export function formatDateTime(value: string | null): string {
  if (!value) return "Nicht verfügbar";
  return new Date(value).toLocaleString("de-DE", DATE_TIME_FORMAT);
}

export function displayValue(value: string | null | undefined): string {
  return value && value.trim() ? value : "Nicht hinterlegt";
}

export function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 border-t border-[color:var(--color-border)] py-3 first:border-t-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-medium uppercase text-[color:var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm text-[color:var(--color-foreground)]">
        {value}
      </dd>
    </div>
  );
}

export function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
