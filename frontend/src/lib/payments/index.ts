export type {
  NormalizedPayment,
  NormalizedPaymentWithHint,
  CoraReconcileHint,
  InvoiceMonthHint,
} from './types'
export {
  onlyDigits,
  inferDocumentoTipo,
  normalizeByProvider,
  normalizeInfinitePay,
  normalizeSantander,
  normalizeLixel,
  normalizeCoraFromBody,
} from './normalize'
export {
  reconcilePayment,
  manualLinkReceivedPayment,
  manualLinkReceivedPaymentAllocations,
  findEnrollmentCandidatesByDocumento,
  ignoreReceivedPayment,
  quitarCobrancaMaisAntiga,
  type PaymentAllocationInput,
  type EnrollmentCandidate,
} from './reconcile'
export {
  confirmEnrollmentPayment,
  applyEnrollmentPaymentConfirmation,
  runConfirmEnrollmentPaymentSideEffects,
  mensalidadeCentavos,
  fetchCoraPaidAmountCents,
  type ConfirmEnrollmentPaymentParams,
  type ConfirmPaymentSource,
} from './confirm-enrollment-payment'
export {
  buildNormalizedPaymentFromCoraInvoicePaid,
  isCoraHeaderWebhook,
  readCoraWebhookHeaders,
  CORA_WEBHOOK_UA,
} from './cora-adapter'
export {
  fetchCoraStatement,
  mapStatementEntryToNormalized,
  type CoraStatementEntry,
} from './cora-statement'
