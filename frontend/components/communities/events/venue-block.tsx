import type { EventVenue } from "@/lib/communities";

export function VenueBlock({ venue }: { venue: EventVenue }) {
  if (venue.kind === "physical") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h4 className="text-sm font-semibold text-slate-700">Venue</h4>
        <dl className="mt-3 space-y-1 text-sm text-slate-600">
          <div>
            <dt className="font-semibold text-slate-700">Name</dt>
            <dd>{venue.name}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-700">Address</dt>
            <dd className="space-y-1">
              <p>{venue.address_line1}</p>
              {venue.address_line2 ? <p>{venue.address_line2}</p> : null}
              <p>
                {[venue.city, venue.state, venue.postal_code]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p>{venue.country}</p>
            </dd>
          </div>
          {venue.map_url ? (
            <div>
              <dt className="font-semibold text-slate-700">Map</dt>
              <dd>
                <a className="text-blue-600 underline" href={venue.map_url} target="_blank" rel="noreferrer">
                  View directions
                </a>
              </dd>
            </div>
          ) : null}
          {venue.timezone ? (
            <div>
              <dt className="font-semibold text-slate-700">Timezone</dt>
              <dd>{venue.timezone}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <h4 className="text-sm font-semibold text-blue-700">Online event</h4>
      <dl className="mt-3 space-y-1 text-sm text-blue-700">
        {venue.platform ? (
          <div>
            <dt className="font-semibold">Platform</dt>
            <dd>{venue.platform}</dd>
          </div>
        ) : null}
        {venue.url ? (
          <div>
            <dt className="font-semibold">Link</dt>
            <dd>
              <a className="underline" href={venue.url} target="_blank" rel="noreferrer">
                Join event
              </a>
            </dd>
          </div>
        ) : null}
        {venue.timezone ? (
          <div>
            <dt className="font-semibold">Timezone</dt>
            <dd>{venue.timezone}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
