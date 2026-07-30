import { Link } from 'react-router-dom';

export function SignupPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper px-4">
      <div className="w-full max-w-2xl">
        <h1 className="font-serif text-2xl text-center mb-2">Onboard a party</h1>
        <p className="text-ink-soft text-sm text-center mb-8">
          Choose who you're bringing onto the platform. Trade entities and financial institutions follow different verification paths.
        </p>
        <div className="grid grid-cols-2 gap-6">
          <div className="border border-line rounded-xl p-6 bg-paper-2">
            <h2 className="font-serif text-lg mb-2">Organization</h2>
            <p className="text-ink-soft text-sm mb-4">Exporters and importers who will create and manage trade transactions.</p>
            <Link to="/signup/organization" className="inline-block bg-ink text-paper-2 rounded px-4 py-2 font-semibold">
              Start organization onboarding
            </Link>
          </div>
          <div className="border border-line rounded-xl p-6 bg-paper-2">
            <h2 className="font-serif text-lg mb-2">Banking</h2>
            <p className="text-ink-soft text-sm mb-4">Banks and financiers joining as a participant institution.</p>
            <Link to="/signup/banking" className="inline-block bg-ink text-paper-2 rounded px-4 py-2 font-semibold">
              Start banking onboarding
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
