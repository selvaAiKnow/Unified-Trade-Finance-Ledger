import { SignupForm } from '../components/SignupForm';

export function BankSignupPage() {
  return (
    <SignupForm
      heading="Register your bank"
      subheading="For banks and financiers joining as a participant institution."
      orgTypeOptions={[{ value: 'BANK', label: 'Bank' }]}
      orgNameLabel="Institution name"
      errorMessage="Could not register your institution. Please check your details and try again."
    />
  );
}
