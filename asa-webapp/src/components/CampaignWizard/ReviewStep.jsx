export default function ReviewStep({ data }) {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          Review your campaign settings before creating. You can edit any step by clicking on it.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Basic Information</h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Campaign Name:</span>
              <span className="font-medium">{data.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">App ID:</span>
              <span className="font-medium">{data.adamId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Countries:</span>
              <span className="font-medium">{data.countriesOrRegions?.join(', ')}</span>
            </div>
            {data.supplySources && data.supplySources.length > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Supply Sources:</span>
                <span className="font-medium">{data.supplySources.length} selected</span>
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Targeting</h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Ad Group Name:</span>
              <span className="font-medium">{data.adGroupName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Default Bid:</span>
              <span className="font-medium">${data.defaultBid}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Keywords:</span>
              <span className="font-medium">
                {data.keywords?.length || 0} keywords
              </span>
            </div>
            {data.negativeKeywords && data.negativeKeywords.length > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Negative Keywords:</span>
                <span className="font-medium">{data.negativeKeywords.length} keywords</span>
              </div>
            )}
          </div>

          {data.keywords && data.keywords.length > 0 && (
            <div className="mt-3 bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Keyword List:</p>
              <div className="space-y-1">
                {data.keywords.map((keyword, index) => (
                  <div key={index} className="text-sm text-gray-600 flex justify-between">
                    <span>{keyword.text}</span>
                    <span className="text-gray-400">
                      {keyword.matchType} • ${keyword.bidAmount.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Budget & Schedule</h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Daily Budget:</span>
              <span className="font-medium">${data.dailyBudget}</span>
            </div>
            {data.totalBudget && (
              <div className="flex justify-between">
                <span className="text-gray-600">Total Budget:</span>
                <span className="font-medium">${data.totalBudget}</span>
              </div>
            )}
            {data.startDate && (
              <div className="flex justify-between">
                <span className="text-gray-600">Start Date:</span>
                <span className="font-medium">{data.startDate}</span>
              </div>
            )}
            {data.endDate && (
              <div className="flex justify-between">
                <span className="text-gray-600">End Date:</span>
                <span className="font-medium">{data.endDate}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Initial Status:</span>
              <span className={`font-medium ${data.status === 'ENABLED' ? 'text-green-600' : 'text-yellow-600'}`}>
                {data.status}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
