import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function RoleSelect() {
  const navigate = useNavigate();

  const handleSelectRole = (role: string, path: string) => {
    // حفظ الدور في localStorage
    localStorage.setItem('role', role);
    // التوجيه المباشر للصفحة المطلوبة
    navigate(path);
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh', 
      fontFamily: 'sans-serif',
      direction: 'rtl',
      backgroundColor: '#f4f6f8'
    }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '30px',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        textAlign: 'center',
        maxWidth: '400px',
        width: '90%'
      }}>
        <h2 style={{ marginBottom: '20px', color: '#333' }}>اختر نوع الحساب للدخول</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <button
            onClick={() => handleSelectRole('customer', '/customer')}
            style={{
              padding: '12px 20px',
              fontSize: '16px',
              backgroundColor: '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            دخول كـ عميل (Customer)
          </button>

          <button
            onClick={() => handleSelectRole('courier', '/courier')}
            style={{
              padding: '12px 20px',
              fontSize: '16px',
              backgroundColor: '#17a2b8',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            دخول كـ مندوب (Courier)
          </button>

          <button
            onClick={() => handleSelectRole('admin', '/admin')}
            style={{
              padding: '12px 20px',
              fontSize: '16px',
              backgroundColor: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            دخول كـ مدير (Admin)
          </button>
        </div>
      </div>
    </div>
  );
}
