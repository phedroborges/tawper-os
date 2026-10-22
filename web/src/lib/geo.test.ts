import { describe, expect, it } from "vitest";
import { companyLatLng, isLocalGeocodeHit } from "./geo";

describe("geocodificação de localidade", () => {
  it("recusa o centro do Brasil devolvido quando o CEP não casa", () => {
    expect(
      isLocalGeocodeHit({
        lat: -14.235004,
        lng: -51.92528,
        types: ["country", "political"],
      }),
    ).toBe(false);
  });

  it("aceita a cidade", () => {
    expect(
      isLocalGeocodeHit({
        lat: -17.3569965,
        lng: -52.6782084,
        types: ["locality", "political"],
      }),
    ).toBe(true);
  });

  it("não usa o centro do país como ponteiro da empresa", () => {
    expect(
      companyLatLng({
        latitude: -14.235004,
        longitude: -51.92528,
        cidade: "Mineiros",
        uf: "GO",
      }),
    ).toEqual({ lat: -17.5694, lng: -52.5511 });
  });
});
