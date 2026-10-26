import { AuthLayout } from '@/layouts/AuthLayout';
import { AuthForm } from '@/components/auth/AuthForm';
export function LoginPage() { return <AuthLayout><AuthForm registering={false} /></AuthLayout>; }
