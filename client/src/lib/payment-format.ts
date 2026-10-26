export const paymentFailureMessage: Record<string, string> = {
  SIMULATED_PAYMENT_FAILURE: 'The chosen failure scenario was completed. This attempt did not confirm your reservation.',
  RESERVATION_EXPIRED: 'Your reservation hold has expired. Reserve again if capacity is available.',
  RESERVATION_CANCELLED: 'This reservation was cancelled before the payment could complete.',
  RESERVATION_ALREADY_CONFIRMED: 'Another attempt already confirmed this reservation.',
  EVENT_NOT_PAYABLE: 'The event is no longer available for checkout.',
  PAYMENT_AMOUNT_MISMATCH: 'The payment amount could not be verified. No confirmation was made.',
  SIMULATION_REQUEST_UNAVAILABLE: 'The original simulation request is unavailable. No confirmation was made.',
  UNKNOWN_FAILURE: 'This attempt did not complete successfully.'
};
