export const DESTINATIONS = ["cocina", "barra"] as const;
export type Destination = (typeof DESTINATIONS)[number];
