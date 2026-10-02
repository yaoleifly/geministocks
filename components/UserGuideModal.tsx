import React from 'react';
import { useI18n } from '../hooks/useI18n';
import { useDialog } from '../hooks/useDialog';
import { XIcon } from './icons/Icons';

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GuideSection: React.FC<{ icon: string; title: string; description: string; example: string; }> = ({ icon, title, description, example }) => (
    <div className="flex items-start gap-x-4">
        <div className="text-3xl mt-1">{icon}</div>
        <div>
            <h3 className="text-lg font-semibold text-black">{title}</h3>
            <p className="mt-1 text-gray-700 leading-relaxed">{description}</p>
            <p className="mt-2 text-sm text-gray-500 bg-gray-100 p-2 rounded-md border border-gray-200">
                {example}
            </p>
        </div>
    </div>
);


const UserGuideModal: React.FC<UserGuideModalProps> = ({ isOpen, onClose }) => {
  const { t } = useI18n();
  const dialogRef = useDialog(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-modal-title"
    >
      <div
        className="bg-white p-5 sm:p-8 max-h-[90dvh] overflow-y-auto max-w-2xl w-full mx-4 text-left relative animate-reveal-scale rounded-2xl shadow-floating"
        onClick={(e) => e.stopPropagation()}
      >
        <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label={t('paymentModal.close')}
        >
            <XIcon className="w-6 h-6" />
        </button>
        <h2 id="guide-modal-title" className="text-2xl font-bold text-black mb-4 text-center border-b border-gray-200 pb-3">
          {t('userGuideModal.title')}
        </h2>
        
        <div className="text-gray-700 space-y-8 my-6 leading-relaxed max-h-[70vh] overflow-y-auto pr-4">
            <p className="text-center">{t('userGuideModal.intro')}</p>
            <GuideSection 
                icon={t('userGuideModal.topicIcon')}
                title={t('userGuideModal.topicTitle')}
                description={t('userGuideModal.topicDescription')}
                example={t('userGuideModal.topicExample')}
            />
            <GuideSection
                icon={t('userGuideModal.searchIcon')}
                title={t('userGuideModal.searchTitle')}
                description={t('userGuideModal.searchDescription')}
                example={t('userGuideModal.searchExample')}
            />
            <GuideSection
                icon={t('userGuideModal.newsIcon')}
                title={t('userGuideModal.newsTitle')}
                description={t('userGuideModal.newsDescription')}
                example={t('userGuideModal.newsExample')}
            />
            <GuideSection
                icon={t('userGuideModal.historyIcon')}
                title={t('userGuideModal.historyTitle')}
                description={t('userGuideModal.historyDescription')}
                example={t('userGuideModal.historyExample')}
            />
            <GuideSection
                icon={t('userGuideModal.modelIcon')}
                title={t('userGuideModal.modelTitle')}
                description={t('userGuideModal.modelDescription')}
                example={t('userGuideModal.modelExample')}
            />
        </div>

        <div className="mt-8 flex justify-center">
            <button
              onClick={onClose}
              className="relative w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 btn-premium text-white text-base font-medium rounded-xl group overflow-hidden shadow-lg hover:shadow-elevated transition-all duration-300 hover:-translate-y-1 active:scale-95"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out"></div>
              <span className="relative z-10">{t('userGuideModal.closeButton')}</span>
            </button>
        </div>
      </div>
    </div>
  );
};

export default UserGuideModal;
