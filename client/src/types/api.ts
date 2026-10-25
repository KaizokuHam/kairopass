export interface HealthResponse {
  success: true;
  message: string;
}

export type HealthState =
  | { status: 'loading' }
  | { status: 'connected'; message: string }
  | { status: 'error'; message: string };
