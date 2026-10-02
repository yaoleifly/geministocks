import React from 'react';

const Toast: React.FC<{ message: string; type: 'success' | 'info' }> = ({ message, type }) => {
  const toastConfig = {
    success: {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      borderColor: 'border-gray-800',
      iconBg: 'bg-gray-100',
      iconColor: 'text-gray-800',
    },
    info: {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
      ),
      borderColor: 'border-gray-800',
      iconBg: 'bg-gray-100',
      iconColor: 'text-gray-800',
    },
  };

  const config = toastConfig[type];

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div
        className={`flex items-center gap-x-2.5 max-w-sm px-4 py-2.5 rounded-2xl border-l-4 shadow-floating bg-white animate-toast-in ${config.borderColor}`}
        role="status"
      >
        <div className={`flex-shrink-0 rounded-full p-1 ${config.iconBg} ${config.iconColor}`}>
          {config.icon}
        </div>
        <div className="text-sm font-medium text-gray-800">
          {message}
        </div>
      </div>
    </div>
  );
};

export default Toast;
