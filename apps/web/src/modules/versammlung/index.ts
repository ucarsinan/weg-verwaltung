export { buildAbstimmungState } from "./abstimmung";
export type { AbstimmungState, VoteRow } from "./abstimmung";
export { evaluateMajority } from "./majority";
export type {
  MajorityEvaluation,
  MajorityOutcome,
  VoteTally,
} from "./majority";
export {
  PROTOCOL_STATUSES,
  PROTOCOL_STATUS_LABEL,
  canSign,
  canSubmitRevision,
  isProtocolStatus,
} from "./protokoll-status";
export type { ProtocolStatus } from "./protokoll-status";
export { executeSignProtokoll } from "./protokoll-sign";
export type { SignProtokollDeps, SignResult } from "./protokoll-sign";
