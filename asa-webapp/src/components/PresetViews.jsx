export function PresetViews({ activePreset, onPresetChange, presets }) {
  return (
    <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-1 bg-gray-50">
      {presets.map((preset) => (
        <button
          key={preset.name}
          onClick={() => onPresetChange(preset.name, preset.columns)}
          className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
            activePreset === preset.name
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
