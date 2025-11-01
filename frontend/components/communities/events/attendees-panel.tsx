import Image from "next/image";

import type { EventAttendee } from "@/lib/communities";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase())
    .slice(0, 2)
    .join("");
}

export function AttendeesPanel({ attendees }: { attendees: EventAttendee[] }) {
  if (!attendees.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700">Attendees</h3>
      <ul className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-700 md:grid-cols-1">
        {attendees.map((attendee) => {
          const name = attendee.display_name ?? attendee.handle ?? "Community member";
          const handle = attendee.handle
            ? attendee.handle.startsWith("@")
              ? attendee.handle
              : `@${attendee.handle}`
            : null;
          return (
            <li key={attendee.id} className="flex items-center gap-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {attendee.avatar_url ? (
                  <Image src={attendee.avatar_url} alt={name} fill className="object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">{initials(name)}</span>
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-slate-800">{name}</span>
                {handle && attendee.display_name ? (
                  <span className="text-xs text-slate-500">{handle}</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
