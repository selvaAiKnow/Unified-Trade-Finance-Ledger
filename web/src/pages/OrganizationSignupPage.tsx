import { SignupForm } from '../components/SignupForm';

export function OrganizationSignupPage() {
  return (
    <SignupForm
      heading="Create your organization account"
      subheading="For exporters and importers creating and managing trade transactions."
      orgTypeOptions={[
        { value: 'EXPORTER', label: 'Exporter' },
        { value: 'BUYER', label: 'Buyer / Importer' },
      ]}
    />
  );
}
