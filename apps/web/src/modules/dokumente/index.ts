export {
  DOC_TYP_LABEL,
  formatAufbewahrung,
  istDauerhaft,
} from "./aufbewahrung";
export {
  ERLAUBTE_MIME_TYPEN,
  MAX_UPLOAD_BYTES,
  baueStoragePfad,
  pruefeDatei,
} from "./upload";
export type { DateiPruefung } from "./upload";
export {
  parseDokumentForm,
  parseLoescheDokumentForm,
  parseNeueVersionForm,
} from "./form";
export type {
  DokumentFormState,
  DokumentInput,
  LoescheDokumentFormState,
  LoescheDokumentInput,
  NeueVersionFormState,
  NeueVersionInput,
} from "./form";
