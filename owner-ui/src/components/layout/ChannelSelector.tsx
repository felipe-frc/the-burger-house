import { useId } from 'react';
import { Bike, Layers3, Store } from 'lucide-react';

const channels = [
  { value: 'all', label: 'Todos', icon: Layers3 },
  { value: 'DELIVERY', label: 'Delivery', icon: Bike },
  { value: 'TAKEOUT', label: 'Balcão', icon: Store },
] as const;

interface Props {
  value: string;
  onChange: (channel: string) => void;
}

export function ChannelSelector({ value, onChange }: Props) {
  const name = useId();
  return <fieldset className="owner-channel-filter">
    <legend className="sr-only">Canal de atendimento</legend>
    <div className="owner-channel-options">
      {channels.map(({ value: channel, label, icon: Icon }) => (
        <label className="owner-channel-segment" key={channel}>
          <input className="sr-only" type="radio" name={name} value={channel} checked={value === channel}
            onChange={() => onChange(channel)} />
          <span className="owner-channel-face">
            <span className="owner-channel-content"><Icon size={14} aria-hidden="true" />{label}</span>
          </span>
        </label>
      ))}
    </div>
  </fieldset>;
}
