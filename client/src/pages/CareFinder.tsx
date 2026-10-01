import { useEffect, useMemo, useState } from "react";
import { ExternalLink, MapPin, Navigation } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import { MapView, type MapMarkerItem } from "@/components/Map";
import { carePlaces, type CarePlace } from "./Home";
import { trackAnalyticsEvent } from "@/lib/analytics";

const categories = ["All", "Hospital", "Clinic", "Fruit & Veg", "Medical Shop", "Local Shop"] as const;

export default function CareFinder() {
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [mapResults, setMapResults] = useState<MapMarkerItem[]>([]);
  const places = useMemo(
    () => [...carePlaces, ...mapResults]
      .filter((place, index, all) => all.findIndex((candidate) => candidate.name === place.name) === index)
      .filter((place) => category === "All" || place.category === category),
    [category, mapResults],
  );

  useEffect(() => {
    void trackAnalyticsEvent("care_finder_opened");
  }, []);

  return (
    <div className="min-h-screen bg-[#f4f1e9] text-[#173d32]">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-12 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[.25em] text-[#b07926]">Moradabad locality · map preview</p>
        <h1 className="mt-3 font-display text-5xl">Care, close by.</h1>
        <p className="mt-4 max-w-2xl text-[#173d32]/65">
          Preview nearby care categories on the map. Sample pins are illustrative, and third-party map results may be incomplete or outdated; verify provider details, hours, and services directly before travelling.
        </p>

        <div className="mt-5 rounded-2xl border border-[#a36d21]/20 bg-[#fff8e9] p-4 text-sm leading-6 text-[#173d32]/75">
          Health Hub has not verified the sample listings. Map-provider results are supplied by the map service and are not a recommendation or confirmation of availability.
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              aria-pressed={category === item}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${category === item ? "bg-[#173d32] text-white" : "border border-[#173d32]/15 bg-white"}`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
          <MapView
            className="min-h-[480px] overflow-hidden rounded-3xl border border-[#173d32]/10"
            initialCenter={{ lat: 28.8386, lng: 78.7733 }}
            places={carePlaces}
            visibleCategories={category === "All" ? undefined : [category]}
            onPlacesLoaded={setMapResults}
          />
          <div className="space-y-3">
            {places.map((place: CarePlace | MapMarkerItem) => {
              const mapProviderResult = place.source === "map-provider";
              return (
                <article key={`${place.source ?? "sample"}-${place.name}`} className="rounded-2xl border border-[#173d32]/10 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-1 h-5 w-5 shrink-0 text-[#b07926]" />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold">{place.name}</h2>
                      <p className="text-sm text-[#173d32]/60">{place.specialty || place.category}{mapProviderResult && place.distance ? ` · ${place.distance}` : ""}</p>
                      <span className="mt-2 inline-block rounded-full bg-[#f7d8a4] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
                        {mapProviderResult ? "Map provider result · verify details" : "Sample listing · illustrative"}
                      </span>
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " Moradabad")}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Search for ${place.name} on Google Maps`}
                      className="rounded-full bg-[#e9f1e4] p-2"
                    >
                      <Navigation className="h-4 w-4" />
                    </a>
                  </div>
                </article>
              );
            })}
            <a
              className="flex items-center justify-center gap-2 rounded-2xl border border-[#173d32]/10 bg-white p-4 text-sm font-semibold"
              href="https://www.google.com/maps/search/healthcare+Moradabad"
              target="_blank"
              rel="noreferrer"
            >
              Search the full map <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
