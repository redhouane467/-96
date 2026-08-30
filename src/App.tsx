import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// استدعاء الصفحات
import AdminDashboard from './pages/AdminDashboard';
import CustomerDashboard from './pages/CustomerDashboard';
import CourierDashboard from './pages/CourierDashboard';
import Auth from './pages/Auth';
import RoleSelect from './pages/RoleSelect';
import OrderTracking from './pages/OrderTracking';

// مكون حماية لتفادي الصفحة البيضاء عند حدوث خطأ في البيانات
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("App Crash Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '30px', textAlign: 'center', fontFamily: 'sans-serif', direction: 'rtl' }}>
          <h2>حدث خطأ أثناء تحميل البيانات!</h2>
          <p>تم إعادة تعيين الجلسة لتفادي إغلاق التطبيق.</p>
          <button 
            onClick={() => {
              localStorage.clear();
              window.location.href = '/';
            }}
            style={{ padding: '10px 20px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
          >
            الرجوع إلى الصفحة الرئيسية
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const savedRole = localStorage.getItem('role');
      if (savedRole) {
        setRole(savedRole);
      }
    } catch (e) {
      console.error("LocalStorage error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return <div style={{ textAlign: 'center', marginTop: '50px' }}>جاري التحميل...</div>;
  }

  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          {/* الصفحات العامة */}
          <Route path="/" element={<RoleSelect />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/track" element={<OrderTracking />} />

          {/* لوحات التحكم حسب الدور */}
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/customer" element={<CustomerDashboard />} />
          <Route path="/courier" element={<CourierDashboard />} />

          {/* إعادة التوجيه في حال ادخال مسار غير معروف */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
