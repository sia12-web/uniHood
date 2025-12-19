const EARTH_RADIUS_M = 6_371_000;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const toRad = (value: number) => (value * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function roundToBucket(distance: number, bucket: number): number {
	if (bucket <= 0) return Math.round(distance);
	return Math.ceil(distance / bucket) * bucket;
}

export function formatDistance(distance: number | null | undefined): string | null {
	if (distance == null) return null;
	return `${distance}m`;
}

export function canSendHeartbeat(accuracy: number | null | undefined): boolean {
	if (typeof accuracy !== "number" || !Number.isFinite(accuracy)) {
		return false;
	}
	return accuracy > 0;
}

export function clampHeartbeatAccuracy(accuracy: number | null | undefined): number {
	if (typeof accuracy !== "number" || !Number.isFinite(accuracy)) {
		return 50;
	}
	const rounded = Math.round(accuracy);
	if (rounded <= 0) {
		return 50;
	}
	return Math.min(rounded, 50);
}
