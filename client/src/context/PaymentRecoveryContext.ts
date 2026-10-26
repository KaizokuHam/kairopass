import { createContext } from 'react';
import type { LogicalPayment } from '@/types/payments';
export interface PaymentRecoveryState {
  attempts: Readonly<Record<string, LogicalPayment>>;
  remember: (reservationId: string, attempt: LogicalPayment) => void;
}
export const PaymentRecoveryContext = createContext<PaymentRecoveryState | null>(null);
