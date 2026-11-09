/**
 * Canonical glass-bangle palette.
 *
 * This is a presentation fallback used when the database palette has not been
 * loaded yet (for example in local development). Inventory and product
 * availability are never inferred from this list — only swatch names/colours.
 */
export interface GlassColour {
  name: string;
  hex: string;
}

export const GLASS_COLOUR_PALETTE: GlassColour[] = [
  { name: "Forest Green", hex: "#2F5D3A" },
  { name: "Pista Green", hex: "#A3C585" },
  { name: "Pink", hex: "#EAB8C8" },
  { name: "Maroon", hex: "#6D1F2C" },
  { name: "Red", hex: "#C62828" },
  { name: "Rust Orange", hex: "#B85C2E" },
  { name: "Orange", hex: "#F28C28" },
  { name: "Peacock Blue", hex: "#006994" },
  { name: "Mustard Yellow", hex: "#E4C441" },
  { name: "Royal Blue", hex: "#4169E1" },
];

const FALLBACK_HEX: Record<string, string> = {
  "forest green": "#2F5D3A",
  "pista green": "#A3C585",
  pista: "#A3C585",
  pink: "#EAB8C8",
  maroon: "#6D1F2C",
  red: "#C62828",
  "rust orange": "#B85C2E",
  orange: "#F28C28",
  gold: "#C9A227",
  white: "#F8F4EC",
  black: "#1D1D1D",
  blue: "#2F4F8F",
  "ink blue": "#223A66",
  green: "#3F7A52",
  purple: "#6B4C8A",
  yellow: "#E4C441",
  "peacock blue": "#006994",
  "royal blue": "#4169E1",
};

/** Best-effort swatch colour for a palette name. */
export function colourHex(name: string, palette?: { name: string; hex_code: string }[]): string {
  const match = palette?.find(
    (colour) => colour.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  if (match?.hex_code) return match.hex_code;
  return FALLBACK_HEX[name.trim().toLowerCase()] ?? "#C9A227";
}

/** Case-insensitive canonical palette lookup. */
export function canonicalColourName(
  name: string,
  palette?: { name: string }[],
): string {
  const trimmed = name.trim();
  return (
    palette?.find((colour) => colour.name.trim().toLowerCase() === trimmed.toLowerCase())
      ?.name ?? trimmed
  );
}
