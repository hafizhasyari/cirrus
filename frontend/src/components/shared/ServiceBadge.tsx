export function ServiceBadge({ service }: { service: string }) {
  const label = service.charAt(0).toUpperCase() + service.slice(1);
  return <span className="service-badge">{label}</span>;
}
