const defaultLocale = () => (typeof navigator !== "undefined" ? navigator.language : "en-US");

export function toUserTz(input: string | Date, userTz?: string): Date {
  const date = typeof input === "string" ? new Date(input) : new Date(input.valueOf());
  if (!userTz) {
    return date;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: userTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});

  const isoLike = `${parts.year}-${parts.month}-${parts.day}T${parts.hour ?? "00"}:${parts.minute ?? "00"}:${parts.second ?? "00"}`;
  return new Date(isoLike);
}

export function formatRange(
  start: string | Date,
  end: string | Date,
  allDay: boolean,
  options?: { timeZone?: string; locale?: string },
): string {
  const locale = options?.locale ?? defaultLocale();
  const timeZone = options?.timeZone;
  const startDate = typeof start === "string" ? new Date(start) : start;
  const endDate = typeof end === "string" ? new Date(end) : end;

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });

  if (allDay) {
    const sameDay = dateFormatter.format(startDate) === dateFormatter.format(endDate);
    if (sameDay) {
      return `${dateFormatter.format(startDate)} · All day`;
    }
    return `${dateFormatter.format(startDate)} – ${dateFormatter.format(endDate)} · All day`;
  }

  const sameDay = startDate.toDateString() === endDate.toDateString();

  const startTimeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
  const endTimeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  if (sameDay) {
    return `${dateFormatter.format(startDate)}, ${startTimeFormatter.format(startDate)} – ${endTimeFormatter.format(endDate)}`;
  }

  return `${dateFormatter.format(startDate)}, ${startTimeFormatter.format(startDate)} – ${dateFormatter.format(endDate)}, ${endTimeFormatter.format(endDate)}`;
}

export function resolvedUserTimezone(): string {
  if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat === "undefined") {
    return "UTC";
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("resolvedUserTimezone failed", error);
    }
    return "UTC";
  }
}
