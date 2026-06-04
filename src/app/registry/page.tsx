import { redirect } from 'next/navigation';
import { REGISTRY_URL } from '@/constants/registry';

const RegistryPage = () => {
  redirect(REGISTRY_URL);
};

export default RegistryPage;
