import { LoginForm } from "./login-form";

export const metadata = {
  title: "Anmelden — WEG-Verwaltung",
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;
  const nextPath = next && next.startsWith("/") ? next : "/dashboard";

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Mit Ihrem WEG-Verwaltung-Konto.
      </p>
      <div className="mt-8">
        <LoginForm nextPath={nextPath} />
      </div>
    </div>
  );
}
