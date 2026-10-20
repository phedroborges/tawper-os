/** Geolocalização do navegador (GPS / Wi‑Fi). */

export type BrowserPosition = { lat: number; lng: number; accuracy?: number };

export function getCurrentPosition(options?: PositionOptions): Promise<BrowserPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Este navegador não oferece geolocalização."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error("Permissão de localização negada. Libere o GPS no navegador."));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new Error("Localização indisponível neste momento."));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error("Tempo esgotado ao obter a localização."));
        } else {
          reject(new Error(err.message || "Falha ao obter localização."));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 0,
        ...options,
      },
    );
  });
}
