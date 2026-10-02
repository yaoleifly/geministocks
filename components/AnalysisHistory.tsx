import React, { useState } from 'react';
import { ClockIcon, TrashIcon, RefreshIcon } from './icons/Icons';
import { useI18n } from '../hooks/useI18n';
import { filterHistory, sortHistory, type DisplayHistoryItem, type SortMode } from '../utils/historyUtils';

interface AnalysisHistoryProps {
  history: DisplayHistoryItem[];
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onClear: () => void;
  onReanalyze?: (id: number) => void;
}

const scoreBadgeClass = (score: number): string => {
  if (score >= 70) return 'bg-orange-50 text-orange-700 border-orange-200';
  if (score >= 40) return 'bg-stone-100 text-stone-700 border-stone-200';
  return 'bg-gray-50 text-gray-500 border-gray-200';
};

const AnalysisHistory: React.FC<AnalysisHistoryProps> = ({ history, onSelect, onDelete, onClear, onReanalyze }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const { t } = useI18n();

  if (history.length === 0) {
    return null;
  }

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    onDelete(id);
  };

  const handleReanalyze = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    onReanalyze?.(id);
  };

  const sortedHistory = sortHistory(filterHistory(history, searchTerm), sortMode);

  const sortOptions: { mode: SortMode; label: string }[] = [
    { mode: 'newest', label: t('analysisHistory.sortNewest') },
    { mode: 'score', label: t('analysisHistory.sortScore') },
    { mode: 'gapScore', label: t('analysisHistory.sortGapScore') },
  ];

  return (
    <div className="bg-white border border-stone-200/90 rounded-2xl shadow-sm">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex justify-between items-center p-4 sm:p-6 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-stone-900"
        aria-expanded={isExpanded}
        aria-controls="history-content"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-black rounded-xl shadow-lg">
            <ClockIcon className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-xl font-semibold text-black">{t('analysisHistory.title')} <span className="text-sm font-normal text-stone-500">({history.length})</span></h3>
        </div>
        <svg
          aria-hidden="true"
          className={`h-6 w-6 transform transition-transform duration-200 text-gray-500 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div id="history-content" className="px-4 sm:px-6 pb-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="relative flex-1">
              <input
                type="search"
                placeholder={t('analysisHistory.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 bg-white rounded-full text-sm focus:outline-none focus:ring-4 focus:ring-gray-400/20 focus:border-black/80 transition-colors"
                aria-label={t('analysisHistory.searchPlaceholder')}
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label={t('analysisHistory.sortLabel')}>
              {sortOptions.map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    sortMode === mode
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  aria-pressed={sortMode === mode}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto pr-2">
            {sortedHistory.length > 0 ? (
              <ul className="space-y-2">
                {sortedHistory.map((entry) => (
                  <li
                    key={entry.id}
                    className="group flex justify-between items-center gap-3 p-3 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <button onClick={() => onSelect(entry.id)} className="flex-1 min-w-0 min-h-11 text-left text-sm text-gray-700 hover:text-black" title={entry.text}>
                      <span className="block truncate">{entry.text}</span>
                    </button>
                    <div className="flex items-center gap-0 sm:gap-1.5 shrink-0">
                      {typeof entry.score === 'number' && (
                        <span
                          className={`hidden sm:inline-block px-2 py-0.5 text-xs font-semibold rounded-full border ${scoreBadgeClass(entry.score)}`}
                          title={t('analysisHistory.scoreBadge')}
                        >
                          {entry.score}
                        </span>
                      )}
                      {typeof entry.gapScore === 'number' && (
                        <span
                          className="hidden sm:inline-block px-2 py-0.5 text-xs font-semibold rounded-full border bg-stone-800 text-white border-stone-800"
                          title={t('analysisHistory.gapScoreBadge')}
                        >
                          {entry.gapScore}
                        </span>
                      )}
                      {onReanalyze && (
                        <button
                          onClick={(e) => handleReanalyze(e, entry.id)}
                          className="p-3 rounded-full text-gray-400 hover:text-black hover:bg-gray-200 opacity-100 transition-opacity"
                          aria-label={`${t('analysisHistory.reanalyzeLabel')}: ${entry.text}`}
                          title={t('analysisHistory.reanalyzeLabel')}
                        >
                          <RefreshIcon className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(e, entry.id)}
                        className="p-3 rounded-full text-gray-400 hover:text-black hover:bg-gray-200 opacity-100 transition-opacity"
                        aria-label={`${t('analysisHistory.deleteLabel')}: ${entry.text}`}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-sm text-gray-500 py-4">
                {t('analysisHistory.noResults')}
              </p>
            )}
          </div>
          {history.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => {
                  onClear();
                  setSearchTerm('');
                }}
                className="inline-flex items-center gap-2 text-sm text-black hover:text-gray-600 transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
                {t('analysisHistory.clearAll')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnalysisHistory;
