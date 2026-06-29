import { Bell, MessageCircle, Search } from 'lucide-react';
import type { RoleConfig } from '../../config/roleViews';

interface TopbarProps {
  greeting: string;
  config: RoleConfig;
  filter: string;
  onFilter: (value: string) => void;
}

export function Topbar({ greeting, config, filter, onFilter }: TopbarProps) {
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    config.avatar.name,
  )}&background=${config.avatar.color}&color=fff&size=42&rounded=true`;

  return (
    <header className="topbar">
      <h1>{greeting}</h1>
      <div className="top-actions">
        <label className="search-box">
          <Search size={18} />
          <input
            type="search"
            placeholder={config.searchPlaceholder}
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
          />
        </label>
        <button className="icon-btn" type="button" aria-label="Messages">
          <MessageCircle size={20} />
        </button>
        <button className="icon-btn bell" type="button" aria-label="Notifications">
          <Bell size={20} />
        </button>
        <div className="profile">
          <img src={avatarUrl} alt="Avatar" className="avatar" />
          <strong>{config.avatar.name}</strong>
        </div>
      </div>
    </header>
  );
}
