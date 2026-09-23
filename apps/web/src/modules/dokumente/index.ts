export {
  DOC_TYP_LABEL,
  FRIST_HERKUNFT_LABEL,
  formatAufbewahrung,
  formatJahreLabel,
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
  parseRegelForm,
} from "./form";
export type {
  DokumentFormState,
  DokumentInput,
  LoescheDokumentFormState,
  LoescheDokumentInput,
  NeueVersionFormState,
  NeueVersionInput,
  RegelFormState,
  RegelInput,
} from "./form";
