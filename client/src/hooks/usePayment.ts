import { useCallback, useContext } from 'react';
import { useAttendeeResource } from './useReservations';
import { paymentsApi } from '@/services/payments';
import { PaymentRecoveryContext } from '@/context/PaymentRecoveryContext';
export function usePaymentHistory(id: string, page: number) {
  const load = useCallback((signal: AbortSignal) => paymentsApi.history(id, page, signal), [id, page]);
  return useAttendeeResource(`payments:${id}:${page}`, load);
}
export function usePaymentRecovery() {
  const state = useContext(PaymentRecoveryContext);
  if (!state) throw new Error('Payment recovery requires the existing authenticated application shell.');
  return state;
}
