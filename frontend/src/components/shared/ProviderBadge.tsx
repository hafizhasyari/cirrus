import { ProviderIcon } from './ProviderIcon';
import { providerBgForTheme, useTheme } from '../../theme/ThemeContext';
import type { Provider } from '../../types';

export function ProviderBadge({
  provider,
  size = 26,
  iconSize,
}: {
  provider: Provider | undefined;
  size?: number;
  iconSize?: number;
}) {
  const { theme } = useTheme();
  if (!provider) {
    return <div className="provider-badge" style={{ width: size, height: size, background: 'var(--surface-alt)' }} />;
  }
  const bg = providerBgForTheme(provider.bg, theme);
  return (
    <div
      className="provider-badge"
      style={{ width: size, height: size, background: bg, color: provider.color }}
    >
      <ProviderIcon provider={provider.id} size={iconSize ?? Math.round(size * 0.54)} />
    </div>
  );
}
