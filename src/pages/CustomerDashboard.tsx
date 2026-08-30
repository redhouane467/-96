import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    // جلب بيانات المستخدم المخزنة
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Error parsing user data", e);
      }
    }

    // جلب الطلبات إن وجدت
    const storedOrders = localStorage.getItem('orders');
    if (storedOrders) {
      try {
        setOrders(JSON.parse(storedOrders));
      } catch (e) {
        console.error("Error parsing orders data", e);
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('role');
    navigate('/login');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', direction: 'rtl' }}>
      {/* شريط علوي مع أزرار التحكم لضمان عدم التعليق */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid #ccc' }}>
        <h2>لوحة التحكم الخاصة بالعميل</h2>
        <div>
          <button 
            onClick={() => navigate('/')} 
            style={{ padding: '8px 15px', marginLeft: '10px', cursor: 'pointer', borderRadius: '4px' }}
          >
            الرئيسية
          </button>
          <button 
            onClick={handleLogout} 
            style={{ padding: '8px 15px', backgroundColor: '#dc3545', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
          >
            تسجيل الخروج
          </button>
        </div>
      </div>

      {/* تفاصيل الحساب */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '6px', marginBottom: '20px' }}>
        <h3>مرحباً بك، {user?.name || user?.email || 'العميل'} 👋</h3>
        <p>مكلف بالدور: <strong>عميل (Customer)</strong></p>
      </div>

      {/* عرض الطلبات أو تنبيه بالعدم */}
      <div style={{ marginTop: '20px' }}>
        <h3>قائمة الطلبات:</h3>
        {orders && orders.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {orders.map((order, index) => (
              <li key={index} style={{ padding: '10px', border: '1px solid #ddd', marginBottom: '10px', borderRadius: '4px' }}>
                طلب رقم: {order.id || index + 1} - الحالة: {order.status || 'قيد المعالجة'}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#fff3cd', color: '#856404', borderRadius: '6px' }}>
            <p style={{ margin: 0 }}>لا توجد طلبات مسجلة حالياً بهذا الحساب.</p>
            <button 
              onClick={() => navigate('/create-order')} // أو المسار الخاص بطلب جديد
              style={{ marginTop: '10px', padding: '8px 16px', cursor: 'pointer' }}
            >
              إنشاء طلب جديد
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
