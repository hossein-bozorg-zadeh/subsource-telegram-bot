import { titleCase } from "./format";

/**
 * SubSource language codes are full English names (e.g. `english`,
 * `spanish_spain`). This map improves the handful that read badly when simply
 * title-cased. Unknown codes fall back to `titleCase(code.replace(/_/g, " "))`.
 */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  english: "English",
  spanish: "Spanish",
  spanish_spain: "Spanish (Spain)",
  spanish_latin_america: "Spanish (LatAm)",
  brazilian_portuguese: "Portuguese (Brazil)",
  portuguese: "Portuguese",
  portuguese_brazil: "Portuguese (Brazil)",
  chinese_simplified: "Chinese (Simplified)",
  chinese_traditional: "Chinese (Traditional)",
  farsi_persian: "Persian",
  persian: "Persian",
  norwegian_bokmal: "Norwegian (Bokmål)",
  serbian_cyrillic: "Serbian (Cyrillic)",
  serbian_latin: "Serbian (Latin)",
};

export function languageLabel(code: string | null | undefined): string {
  if (!code) return "Unknown";
  return DISPLAY_NAMES[code.toLowerCase()] ?? titleCase(code.replace(/_/g, " "));
}
