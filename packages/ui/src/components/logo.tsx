import { cn } from "../lib/utils";

export function NoxRouteMark({
  className,
  title = "NoxRouteNeo",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={cn("size-9 shrink-0", className)}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="15" fill="#0b1724" />
      <path
        d="M16 45V21.5A5.5 5.5 0 0 1 26.3 19l11.4 23.1A5.5 5.5 0 0 0 48 39.7V17"
        fill="none"
        stroke="#f8fafc"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="45" r="4" fill="#2dd4bf" />
      <circle cx="48" cy="17" r="4" fill="#fb7185" />
    </svg>
  );
}

export function NoxRouteLogo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <NoxRouteMark />
      {!compact && (
        <span className="whitespace-nowrap text-sm font-semibold tracking-normal">
          NoxRoute<span className="text-teal-400">Neo</span>
        </span>
      )}
    </div>
  );
}
