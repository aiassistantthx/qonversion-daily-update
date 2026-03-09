import { ChevronDown, Search, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export type CampaignSelection = string[];

interface Campaign {
  campaign_id: string;
  campaign_name: string;
  spend: number;
  campaign_type?: string;
}

interface CampaignFilterProps {
  value: CampaignSelection;
  onChange: (campaigns: CampaignSelection) => void;
  campaigns: Campaign[];
  disabled?: boolean;
}

const CAMPAIGN_TYPES = {
  brand: { label: 'Brand', color: '#3b82f6' },
  generic: { label: 'Generic', color: '#10b981' },
  competitor: { label: 'Competitor', color: '#f59e0b' },
  other: { label: 'Other', color: '#6b7280' },
};

function getCampaignType(name: string): keyof typeof CAMPAIGN_TYPES {
  const nameLower = name.toLowerCase();
  if (nameLower.includes('brand')) return 'brand';
  if (nameLower.includes('competitor')) return 'competitor';
  if (nameLower.includes('generic')) return 'generic';
  return 'other';
}

export function CampaignFilter({ value, onChange, campaigns, disabled }: CampaignFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleCampaign = (campaignId: string) => {
    if (value.includes(campaignId)) {
      onChange(value.filter(c => c !== campaignId));
    } else {
      onChange([...value, campaignId]);
    }
  };

  const applyPreset = (preset: 'brand' | 'generic' | 'competitor' | 'clear') => {
    if (preset === 'clear') {
      onChange([]);
    } else {
      const filtered = campaigns
        .filter(c => getCampaignType(c.campaign_name) === preset)
        .map(c => c.campaign_id);
      onChange(filtered);
    }
    setIsOpen(false);
  };

  const filteredCampaigns = campaigns.filter(c =>
    c.campaign_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.campaign_id.includes(searchQuery)
  );

  const groupedCampaigns = filteredCampaigns.reduce((acc, campaign) => {
    const type = getCampaignType(campaign.campaign_name);
    if (!acc[type]) acc[type] = [];
    acc[type].push(campaign);
    return acc;
  }, {} as Record<string, Campaign[]>);

  Object.keys(groupedCampaigns).forEach(type => {
    groupedCampaigns[type].sort((a, b) => (b.spend || 0) - (a.spend || 0));
  });

  const selectedCampaigns = value
    .map(id => campaigns.find(c => c.campaign_id === id))
    .filter(Boolean) as Campaign[];

  const formatSpend = (spend: number) => {
    if (spend >= 1000) return `$${(spend / 1000).toFixed(1)}k`;
    return `$${spend.toFixed(0)}`;
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: disabled ? '#f3f4f6' : '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          fontSize: 13,
          color: disabled ? '#9ca3af' : '#374151',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          minWidth: 150,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>
          {value.length === 0 ? 'All Campaigns' : `${value.length} selected`}
        </span>
        <ChevronDown size={14} color="#6b7280" />
      </button>

      {isOpen && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
            zIndex: 100,
            minWidth: 350,
            maxHeight: 500,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Presets */}
          <div style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              <button
                onClick={() => applyPreset('brand')}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 11,
                  color: '#374151',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Brand
              </button>
              <button
                onClick={() => applyPreset('generic')}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 11,
                  color: '#374151',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Generic
              </button>
              <button
                onClick={() => applyPreset('competitor')}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 11,
                  color: '#374151',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Competitor
              </button>
              <button
                onClick={() => applyPreset('clear')}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 11,
                  color: '#374151',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Clear
              </button>
            </div>

            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                type="text"
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px 6px 28px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={12} color="#9ca3af" />
                </button>
              )}
            </div>
          </div>

          {/* Selected Campaigns */}
          {value.length > 0 && (
            <div style={{ padding: 8, borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Selected ({value.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedCampaigns.map(campaign => (
                  <button
                    key={campaign.campaign_id}
                    onClick={() => toggleCampaign(campaign.campaign_id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 6px',
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 4,
                      fontSize: 11,
                      color: '#374151',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      maxWidth: 150,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: CAMPAIGN_TYPES[getCampaignType(campaign.campaign_name)].color,
                      }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {campaign.campaign_name}
                    </span>
                    <X size={10} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Campaign List - Grouped by Type */}
          <div style={{ flex: 1, overflow: 'auto', padding: 4 }}>
            {Object.entries(CAMPAIGN_TYPES).map(([type, config]) => {
              const typeCampaigns = groupedCampaigns[type] || [];
              if (typeCampaigns.length === 0) return null;

              return (
                <div key={type} style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      padding: '4px 8px',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {config.label}
                  </div>
                  {typeCampaigns.map(campaign => {
                    const isSelected = value.includes(campaign.campaign_id);
                    return (
                      <button
                        key={campaign.campaign_id}
                        onClick={() => toggleCampaign(campaign.campaign_id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          width: '100%',
                          padding: '6px 12px',
                          background: isSelected ? '#eff6ff' : 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 12,
                          color: '#374151',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          textAlign: 'left',
                        }}
                        onMouseOver={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = '#f9fafb';
                          }
                        }}
                        onMouseOut={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          style={{ cursor: 'pointer' }}
                        />
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: config.color,
                          }}
                        />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {campaign.campaign_name}
                        </span>
                        <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: "'JetBrains Mono', monospace" }}>
                          {formatSpend(campaign.spend)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function parseCampaignFilterFromURL(): CampaignSelection {
  const params = new URLSearchParams(window.location.search);
  const campaigns = params.get('campaigns');
  if (campaigns) {
    return campaigns.split(',').filter(Boolean);
  }
  return [];
}

export function updateURLWithCampaignFilter(campaigns: CampaignSelection) {
  const url = new URL(window.location.href);
  if (campaigns.length > 0) {
    url.searchParams.set('campaigns', campaigns.join(','));
  } else {
    url.searchParams.delete('campaigns');
  }
  window.history.replaceState({}, '', url.toString());
}
