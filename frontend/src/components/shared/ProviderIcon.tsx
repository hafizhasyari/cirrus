import awsIcon from '../../assets/providers/aws.svg';
import gcpIcon from '../../assets/providers/gcp.svg';
import alibabaIcon from '../../assets/providers/alibaba.svg';
import ociIcon from '../../assets/providers/oci.svg';
import biznetIcon from '../../assets/providers/biznet.svg';
import type { ProviderId } from '../../types';

const ICONS: Record<ProviderId, string> = {
  aws: awsIcon,
  gcp: gcpIcon,
  alibaba: alibabaIcon,
  oci: ociIcon,
  biznet: biznetIcon,
};

export function ProviderIcon({ provider, size = 14 }: { provider: ProviderId; size?: number }) {
  return <img src={ICONS[provider]} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />;
}
