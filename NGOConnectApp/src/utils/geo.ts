/**
 * Haversine formula — straight-line distance between two GPS coordinates.
 * Returns distance in kilometres.
 */
export function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R    = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Format a distance in km for display.
 * < 1 km  → "350 M"
 * ≥ 1 km  → "2.3 KM"
 */
export function formatDistance(km: number): string {
  return km < 1
    ? `${Math.round(km * 1000)} M`
    : `${km.toFixed(1)} KM`;
}
