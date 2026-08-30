import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function RoleSelect() {
  const navigate = useNavigate();

  // دالة التوجيه عند الضغط على أي زر
  const handleSelectRole = (roleName: string, targetPath: string) => {
    localStorage.setItem('role', roleName);
    navigate(targetPath);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4 text-white">
      <div className="max-w-md w-full space-y-8 bg-slate-800/80 backdrop-blur-md p-8 rounded-2xl border border-slate-700 shadow-2xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            اختر نوع الحساب
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            حدد صفقتك للوصول إلى لوحة التحكم الخاصة بك
          </p>
        </div>

        <div className="space-y-4 pt-4">
          {/* زر الأدمن */}
          <button
            onClick={() => handleSelectRole('admin', '/admin')}
            className="w-full py-4 px-6 rounded-xl bg-slate-700/50 hover:bg-blue-600/30 border border-slate-600 hover:border-blue-500/50 transition-all duration-200 flex items-center justify-between group"
          >
            <span className="font-semibold text-slate-200 group-hover:text-white">إدارة النظام</span>
            <span className="text-xs bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full border border-blue-500/30">Admin</span>
          </button>

          {/* زر العميل */}
          <button
            onClick={() => handleSelectRole('customer', '/customer')}
            className="w-full py-4 px-6 rounded-xl bg-slate-700/50 hover:bg-emerald-600/30 border border-slate-600 hover:border-emerald-500/50 transition-all duration-200 flex items-center justify-between group"
          >
            <span className="font-semibold text-slate-200 group-hover:text-white">لوحة العميل</span>
            <span className="text-xs bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/30">Customer</span>
          </button>

          {/* زر المندوب */}
          <button
            onClick={() => handleSelectRole('courier', '/courier')}
            className="w-full py-4 px-6 rounded-xl bg-slate-700/50 hover:bg-purple-600/30 border border-slate-600 hover:border-purple-500/50 transition-all duration-200 flex items-center justify-between group"
          >
            <span className="font-semibold text-slate-200 group-hover:text-white">لوحة المندوب</span>
            <span className="text-xs bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full border border-purple-500/30">Courier</span>
          </button>
        </div>
      </div>
    </div>
  );
}
