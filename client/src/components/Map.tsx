/**
 * GOOGLE MAPS FRONTEND INTEGRATION - ESSENTIAL GUIDE
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<google.maps.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 40.7128, lng: -74.0060 }}
 *   initialZoom={15}
 *   onMapReady={(map) => {
 *     mapRef.current = map; // Store to control map from parent anytime, google map itself is in charge of the re-rendering, not react state.
 * </MapView>
 *
 * ======
 * Available Libraries and Core Features:
 * -------------------------------
 * 📍 MARKER (from `marker` library)
 * - Attaches to map using { map, position }
 * new google.maps.marker.AdvancedMarkerElement({
 *   map,
 *   position: { lat: 37.7749, lng: -122.4194 },
 *   title: "San Francisco",
 * });
 *
 * -------------------------------
 * 🏢 PLACES (from `places` library)
 * - Does not attach directly to map; use data with your map manually.
 * const place = new google.maps.places.Place({ id: PLACE_ID });
 * await place.fetchFields({ fields: ["displayName", "location"] });
 * map.setCenter(place.location);
 * new google.maps.marker.AdvancedMarkerElement({ map, position: place.location });
 *
 * -------------------------------
 * 🧭 GEOCODER (from `geocoding` library)
 * - Standalone service; manually apply results to map.
 * const geocoder = new google.maps.Geocoder();
 * geocoder.geocode({ address: "New York" }, (results, status) => {
 *   if (status === "OK" && results[0]) {
 *     map.setCenter(results[0].geometry.location);
 *     new google.maps.marker.AdvancedMarkerElement({
 *       map,
 *       position: results[0].geometry.location,
 *     });
 *   }
 * });
 *
 * -------------------------------
 * 📐 GEOMETRY (from `geometry` library)
 * - Pure utility functions; not attached to map.
 * const dist = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
 *
 * -------------------------------
 * 🛣️ ROUTES (from `routes` library)
 * - Combines DirectionsService (standalone) + DirectionsRenderer (map-attached)
 * const directionsService = new google.maps.DirectionsService();
 * const directionsRenderer = new google.maps.DirectionsRenderer({ map });
 * directionsService.route(
 *   { origin, destination, travelMode: "DRIVING" },
 *   (res, status) => status === "OK" && directionsRenderer.setDirections(res)
 * );
 *
 * -------------------------------
 * 🌦️ MAP LAYERS (attach directly to map)
 * - new google.maps.TrafficLayer().setMap(map);
 * - new google.maps.TransitLayer().setMap(map);
 * - new google.maps.BicyclingLayer().setMap(map);
 *
 * -------------------------------
 * ✅ SUMMARY
 * - “map-attached” → AdvancedMarkerElement, DirectionsRenderer, Layers.
 * - “standalone” → Geocoder, DirectionsService, DistanceMatrixService, ElevationService.
 * - “data-only” → Place, Geometry utilities.
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
    L?: LeafletNamespace;
  }
}

type LeafletMap = {
  setView: (center: [number, number], zoom: number) => LeafletMap;
  fitBounds: (bounds: [[number, number], [number, number]], options?: { padding: [number, number] }) => LeafletMap;
  remove: () => void;
};

type LeafletNamespace = {
  map: (element: HTMLElement, options?: { zoomControl?: boolean }) => LeafletMap;
  tileLayer: (url: string, options: Record<string, string | number>) => { addTo: (map: LeafletMap) => void };
  marker: (position: [number, number], options?: { icon?: unknown; title?: string }) => { addTo: (map: LeafletMap) => { bindPopup: (content: string) => { openPopup: () => void } }; on: (event: string, handler: () => void) => void };
  divIcon: (options: { className: string; html: string; iconSize: [number, number]; iconAnchor: [number, number] }) => unknown;
};

const API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  "";
const LIVE_MAPS_ENABLED = import.meta.env.VITE_ENABLE_LIVE_MAPS === "true";

function buildFallbackMapUrl(center: google.maps.LatLngLiteral, places: MapMarkerItem[]) {
  const query = places.length
    ? places
        .slice(0, 4)
        .map((place) => `${place.name} ${place.category}`)
        .join(" near ")
    : `${center.lat},${center.lng}`;

  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=12&output=embed`;
}

function buildOpenStreetMapUrl(center: google.maps.LatLngLiteral) {
  const delta = 0.045;
  const west = center.lng - delta;
  const east = center.lng + delta;
  const south = center.lat - delta;
  const north = center.lat + delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${west}%2C${south}%2C${east}%2C${north}&layer=mapnik&marker=${center.lat}%2C${center.lng}`;
}

function getBrowserLocation(fallback: google.maps.LatLngLiteral) {
  return new Promise<google.maps.LatLngLiteral>((resolve) => {
    if (!navigator.geolocation) {
      resolve(fallback);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      () => resolve(fallback),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  });
}

async function findNearbyPlaces(center: google.maps.LatLngLiteral) {
  type OverpassData = {
    elements?: Array<{
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };
  const response = await fetch(`/api/nearby-places?lat=${center.lat}&lng=${center.lng}`);
  if (!response.ok) {
    throw new Error(`Nearby place lookup failed with ${response.status}`);
  }
  const data = (await response.json()) as OverpassData;
  const seen = new Set<string>();
  return (data.elements ?? [])
    .map((place) => {
      const tags = place.tags ?? {};
      const position = place.lat !== undefined && place.lon !== undefined ? { lat: place.lat, lng: place.lon } : place.center ? { lat: place.center.lat, lng: place.center.lon } : null;
      const category =
        tags.amenity === "hospital" || tags.healthcare === "hospital"
          ? "Hospital"
          : tags.amenity === "pharmacy" || tags.shop === "chemist"
            ? "Medical Shop"
            : ["greengrocer", "farm", "marketplace", "supermarket", "convenience", "general"].includes(tags.shop ?? "")
              ? "Fruit & Veg"
              : tags.shop
                ? "Local Shop"
                : "Clinic";
      return {
        key: `${category}:${tags.name || place.id}`,
        name: tags.name || `${category} nearby`,
        category,
        position,
        specialty: tags.healthcare || tags.shop || tags.amenity || category,
      };
    })
    .filter((place): place is typeof place & { position: google.maps.LatLngLiteral } => {
      if (!place.position || seen.has(place.key)) return false;
      seen.add(place.key);
      return true;
    })
    .slice(0, 100)
    .map(({ key: _key, ...place }) => place);
}

function distanceLabel(from: google.maps.LatLngLiteral, to: google.maps.LatLngLiteral) {
  const earthRadiusKm = 6371;
  const latDelta = ((to.lat - from.lat) * Math.PI) / 180;
  const lngDelta = ((to.lng - from.lng) * Math.PI) / 180;
  const latitude = (from.lat * Math.PI) / 180;
  const targetLatitude = (to.lat * Math.PI) / 180;
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.sin(lngDelta / 2) ** 2 * Math.cos(latitude) * Math.cos(targetLatitude);
  return `${(earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))).toFixed(1)} km`;
}

function loadMapScript() {
  return new Promise<boolean>(resolve => {
    if (!API_KEY || !LIVE_MAPS_ENABLED) {
      resolve(false);
      return;
    }

    const waitForMaps = () => {
      const startedAt = Date.now();
      const check = () => {
        if (window.google?.maps && typeof window.google.maps.Map === "function") {
          resolve(true);
          return;
        }
        if (Date.now() - startedAt >= 10000) {
          resolve(false);
          return;
        }
        window.setTimeout(check, 50);
      };
      check();
    };

    if (window.google?.maps && typeof window.google.maps.Map === "function") {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&v=weekly&loading=async&libraries=marker,places,geocoding,geometry`;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onload = waitForMaps;
    script.onerror = () => {
      console.error("Failed to load Google Maps script");
      resolve(false);
    };
    document.head.appendChild(script);
  });
}

function loadLeaflet() {
  return new Promise<boolean>((resolve) => {
    if (window.L) return resolve(true);

    if (!document.querySelector('link[data-herbal-leaflet="true"]')) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      stylesheet.dataset.herbalLeaflet = "true";
      document.head.appendChild(stylesheet);
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.dataset.herbalLeaflet = "true";
    script.onload = () => {
      const startedAt = Date.now();
      const check = () => {
        if (window.L) resolve(true);
        else if (Date.now() - startedAt > 10000) resolve(false);
        else window.setTimeout(check, 50);
      };
      check();
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

export type MapMarkerItem = {
  name: string;
  category: string;
  position: google.maps.LatLngLiteral;
  specialty?: string;
  distance?: string;
  source?: "sample" | "map-provider";
};

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
  onPlacesLoaded?: (places: MapMarkerItem[]) => void;
  places?: MapMarkerItem[];
  visibleCategories?: string[];
  onMarkerClick?: (place: MapMarkerItem) => void;
}

const markerColors: Record<string, string> = {
  Hospital: "#173d32",
  Clinic: "#2f8d61",
  "Fruit & Veg": "#d79a32",
  "Medical Shop": "#a96749",
  "Local Shop": "#7d6a55",
  default: "#173d32",
};

function createMarkerPin(category: string) {
  const color = markerColors[category] ?? markerColors.default;
  const pin = document.createElement("div");
  pin.style.width = "16px";
  pin.style.height = "16px";
  pin.style.borderRadius = "9999px";
  pin.style.background = color;
  pin.style.border = "3px solid rgba(255,255,255,0.95)";
  pin.style.boxShadow = `0 0 0 6px ${color}22, 0 12px 24px ${color}55`;
  pin.style.position = "relative";
  pin.title = category;
  return pin;
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  onMapReady,
  onPlacesLoaded,
  places = [],
  visibleCategories,
  onMarkerClick,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const googleMarkers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const leafletMap = useRef<LeafletMap | null>(null);
  const initVersion = useRef(0);

  const init = usePersistFn(async () => {
    const version = ++initVersion.current;
    const loaded = await loadMapScript();
    if (version !== initVersion.current) return;
    if (!mapContainer.current) {
      console.error("Map container not found");
      return;
    }
    leafletMap.current?.remove();
    leafletMap.current = null;
    map.current = null;
    mapContainer.current.innerHTML = "";

    const googleMapsReady =
      loaded &&
      Boolean(window.google?.maps) &&
      typeof window.google?.maps?.Map === "function" &&
      typeof window.google?.maps?.marker?.AdvancedMarkerElement === "function";

    if (!googleMapsReady) {
      const leafletLoaded = await loadLeaflet();
      if (version !== initVersion.current || !mapContainer.current) return;
      if (!mapContainer.current.isConnected) return;
      const ownPins = places.slice(0, 16);
      if (leafletLoaded && window.L && ownPins.length > 0) {
        let livePlaces: MapMarkerItem[] = [];
        try {
          livePlaces = (await findNearbyPlaces(initialCenter)).map((place) => ({
            ...place,
            distance: distanceLabel(initialCenter, place.position),
            source: "map-provider" as const,
          }));
        } catch (error) {
          console.warn("OpenStreetMap nearby-place lookup unavailable; showing project pins.", error);
        }
        const seen = new Set<string>();
        const displayPlaces = [...ownPins, ...livePlaces]
          .filter((place) => {
            const key = `${place.category}:${place.name}:${place.position.lat}:${place.position.lng}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .filter((place) => !visibleCategories || visibleCategories.includes(place.category))
          .slice(0, 100);
        const placesToRender = displayPlaces.length > 0 ? displayPlaces : ownPins;

        let liveMap: LeafletMap;
        try {
          liveMap = window.L.map(mapContainer.current, { zoomControl: true }).setView(
            [initialCenter.lat, initialCenter.lng],
            initialZoom,
          );
        } catch (error) {
          console.warn("Interactive map unavailable; showing the map preview instead.", error);
          if (mapContainer.current?.isConnected) {
            mapContainer.current.innerHTML = `<iframe title="Nearby care map" src="${buildOpenStreetMapUrl(initialCenter)}" style="width:100%;height:100%;border:0;display:block;" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>`;
          }
          return;
        }
        leafletMap.current = liveMap;
        window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(liveMap);

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
              const locationIcon = window.L!.divIcon({
                className: "herbal-live-location",
                html: '<span style="display:block;width:18px;height:18px;border-radius:50%;background:#2563eb;border:4px solid #fff;box-shadow:0 0 0 7px rgba(37,99,235,0.22),0 5px 14px rgba(37,99,235,0.45);"></span>',
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              });
              window.L!.marker([coords.latitude, coords.longitude], { icon: locationIcon, title: "Your live location" })
                .addTo(liveMap)
                .bindPopup("<strong>Your live location</strong><br><small>Shown only on your device</small>");
            },
            () => undefined,
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
          );
        }

        const bounds: [[number, number], [number, number]] = [
          [Math.min(...placesToRender.map((place) => place.position.lat)), Math.min(...placesToRender.map((place) => place.position.lng))],
          [Math.max(...placesToRender.map((place) => place.position.lat)), Math.max(...placesToRender.map((place) => place.position.lng))],
        ];
        placesToRender.forEach((place) => {
          const color = markerColors[place.category] ?? markerColors.default;
          const icon = window.L!.divIcon({
            className: "herbal-map-pin",
            html: `<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;border:3px solid #fff;background:${color};box-shadow:0 5px 14px ${color}99;transform:rotate(-45deg);"></span>`,
            iconSize: [22, 22],
            iconAnchor: [11, 22],
          });
          const marker = window.L!.marker([place.position.lat, place.position.lng], { icon, title: place.name });
          marker.on("click", () => onMarkerClick?.(place));
          marker.addTo(liveMap).bindPopup(`<strong>${place.name}</strong><br><small>${place.category} · ${place.specialty ?? "Nearby support"}${place.distance ? ` · ${place.distance}` : ""}</small>`);
        });
        liveMap.fitBounds(bounds, { padding: [28, 28] });
        onPlacesLoaded?.(placesToRender);
        return;
      }

      const fallbackPlaces = ownPins;
      const fallbackUrl = buildOpenStreetMapUrl(initialCenter);
      const pinMarkup = fallbackPlaces
        .map((place) => {
          const left = Math.min(92, Math.max(8, 50 + ((place.position.lng - initialCenter.lng) / 0.09) * 100));
          const top = Math.min(86, Math.max(14, 50 - ((place.position.lat - initialCenter.lat) / 0.09) * 100));
          const color = markerColors[place.category] ?? markerColors.default;
          return `
            <button type="button" data-map-place="${fallbackPlaces.indexOf(place)}" title="View details for ${place.name}" aria-label="View details for ${place.name}" style="position:absolute;left:${left}%;top:${top}%;transform:translate(-50%,-100%);z-index:4;display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:auto;border:0;background:transparent;cursor:pointer;">
              <span style="padding:5px 8px;border-radius:9999px;background:rgba(255,255,255,0.94);border:1px solid ${color}55;color:#173d32;font-size:9px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;white-space:nowrap;box-shadow:0 6px 16px rgba(23,61,50,0.18);">${place.category}</span>
              <span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;border:3px solid rgba(255,255,255,0.98);background:${color};box-shadow:0 5px 14px ${color}88;transform:rotate(-45deg);"></span>
              <span style="display:block;width:3px;height:8px;background:${color};margin-top:-7px;"></span>
            </button>
          `;
        })
        .join("");
      const chips = fallbackPlaces
        .map(
          (place) => `
            <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:9999px;background:rgba(255,255,255,0.82);border:1px solid rgba(23,61,50,0.08);color:#173d32;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;">
              <span style="display:block;width:8px;height:8px;border-radius:50%;background:${markerColors[place.category] ?? markerColors.default};"></span>
              ${place.category}
            </span>
          `,
        )
        .join("");

      mapContainer.current.innerHTML = `
        <div style="position:relative;width:100%;height:100%;overflow:hidden;border-radius:24px;background:#dfe8d2;">
          <iframe title="Nearby care map" src="${fallbackUrl}" style="width:100%;height:100%;border:0;display:block;filter:saturate(0.96) contrast(1.04);" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>
          <div aria-label="Project locality pins" style="position:absolute;inset:0;z-index:10;pointer-events:none;">${pinMarkup}</div>
          <div style="position:absolute;left:18px;top:18px;display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid rgba(23,61,50,0.08);background:rgba(255,255,255,0.78);border-radius:9999px;font-size:10px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#173d32;z-index:3;box-shadow:0 10px 24px rgba(23,61,50,0.08);">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#173d32;"></span>
            Nearby care
          </div>
          <div style="position:absolute;right:16px;bottom:16px;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;max-width:68%;z-index:3;">${chips}</div>
        </div>
      `;
      mapContainer.current.querySelectorAll<HTMLElement>("[data-map-place]").forEach((pin) => {
        pin.addEventListener("click", () => {
          const place = fallbackPlaces[Number(pin.dataset.mapPlace)];
          if (place) onMarkerClick?.(place);
        });
      });
      return;
    }

    map.current = new window.google.maps.Map(mapContainer.current, {
      zoom: initialZoom,
      center: initialCenter,
      mapTypeControl: true,
      fullscreenControl: true,
      zoomControl: true,
      streetViewControl: true,
      mapId: "DEMO_MAP_ID",
    });

    const renderGooglePlaces = (displayPlaces: MapMarkerItem[]) => {
      googleMarkers.current.forEach((marker) => {
        marker.map = null;
      });
      googleMarkers.current = [];
      displayPlaces.filter((place) => !visibleCategories || visibleCategories.includes(place.category)).forEach((place) => {
      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="font-family: 'Segoe UI', sans-serif; min-width: 180px; color: #173d32;">
            <div style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #6d7f75; margin-bottom: 6px;">${place.category}</div>
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">${place.name}</div>
            <div style="font-size: 12px; color: #425a53;">${place.specialty ?? "Nearby wellness support"}</div>
          </div>
        `,
      });

      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        map: map.current,
        position: place.position,
        title: place.name,
        content: createMarkerPin(place.category),
      });
      googleMarkers.current.push(marker);

      marker.addEventListener("gmp-click", () => {
        infoWindow.open({ anchor: marker, map: map.current });
        onMarkerClick?.(place);
      });
      });
    };

    renderGooglePlaces(places);
    if (window.google.maps.places?.PlacesService) {
      const service = new window.google.maps.places.PlacesService(map.current);
      const searches = [
        { keyword: "hospital", category: "Hospital" },
        { keyword: "clinic", category: "Clinic" },
        { keyword: "pharmacy medical shop", category: "Medical Shop" },
        { keyword: "fruit vegetable market", category: "Fruit & Veg" },
      ];
      const lookupResults = await Promise.all(
        searches.map(
          ({ keyword, category }) =>
            new Promise<MapMarkerItem[]>((resolve) => {
              service.nearbySearch(
                { location: initialCenter, radius: 12000, keyword },
                (results, status) => {
                  if (status !== window.google!.maps.places.PlacesServiceStatus.OK || !results) {
                    resolve([]);
                    return;
                  }
                  resolve(
                    results.slice(0, 20).flatMap((result) => {
                      const location = result.geometry?.location;
                      if (!location) return [];
                      const position = { lat: location.lat(), lng: location.lng() };
                      const meters = window.google!.maps.geometry?.spherical.computeDistanceBetween(
                        new window.google!.maps.LatLng(initialCenter),
                        location,
                      );
                      return [{
                        name: result.name || `${category} nearby`,
                        category,
                        position,
                        specialty: result.vicinity || result.types?.[0] || category,
                        distance: meters ? `${(meters / 1000).toFixed(1)} km` : "Nearby",
                        source: "map-provider" as const,
                      }];
                    }),
                  );
                },
              );
            }),
        ),
      );
      const seen = new Set<string>();
      const livePlaces = lookupResults.flat().filter((place) => {
        const key = `${place.category}:${place.name}:${place.position.lat}:${place.position.lng}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).filter((place) => !visibleCategories || visibleCategories.includes(place.category));
      if (livePlaces.length > 0) {
        renderGooglePlaces(livePlaces);
        onPlacesLoaded?.(livePlaces);
      } else if (places.length > 0) {
        onPlacesLoaded?.(places);
      }
    } else if (places.length > 0) {
      onPlacesLoaded?.(places);
    }

    if (onMapReady) {
      onMapReady(map.current);
    }
  });

  useEffect(() => {
    void init().catch((error) => {
      console.warn("Map initialization failed; the rest of the page remains available.", error);
    });
    return () => {
      initVersion.current += 1;
      leafletMap.current?.remove();
      leafletMap.current = null;
      map.current = null;
    };
  }, [init]);

  return (
    <div ref={mapContainer} className={cn("w-full h-[500px] rounded-[24px] overflow-hidden bg-[#edf2eb]", className)} />
  );
}
