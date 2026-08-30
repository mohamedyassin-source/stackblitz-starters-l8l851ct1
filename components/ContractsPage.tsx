<div style={{ marginBottom: '16px', position: 'relative' }}>
  <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 'bold' }}>
    اختر الموظف (ابحث بالاسم أو الكود) *
  </label>
  
  <input
    type="text"
    required
    placeholder="اكتب اسم الموظف أو الكود..."
    value={empSearchTerm}
    onChange={(e) => {
      setEmpSearchTerm(e.target.value);
      setSelectedEmployeeCode(''); // إعادة تعيين الكود إذا قام المستخدم بتعديل النص
      setShowEmpDropdown(true);
    }}
    onFocus={() => setShowEmpDropdown(true)}
    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12px', outline: 'none', fontWeight: 'bold', background: '#f8fafc' }}
  />

  {/* القائمة المنسدلة للبحث */}
  {showEmpDropdown && (
    <>
      {/* طبقة شفافة لإغلاق القائمة عند النقر خارجها */}
      <div 
        style={{ position: 'fixed', inset: 0, zIndex: 9 }} 
        onClick={() => setShowEmpDropdown(false)}
      />
      
      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--line)', borderRadius: '8px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto', zIndex: 10, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
        {employees
          .filter(emp => emp.contract_type !== 'إنهاء تعاقد')
          .filter(emp => 
            emp.employee_name.toLowerCase().includes(empSearchTerm.toLowerCase()) || 
            String(emp.employee_code).toLowerCase().includes(empSearchTerm.toLowerCase())
          )
          .map((emp) => (
            <div
              key={emp.employee_code}
              onClick={() => {
                setSelectedEmployeeCode(emp.employee_code);
                setEmpSearchTerm(`${emp.employee_name} (${emp.employee_code})`);
                setShowEmpDropdown(false);
              }}
              style={{ padding: '10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontWeight: 'bold', color: 'var(--navy-950)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            >
              {emp.employee_name} ({emp.employee_code}) - [{emp.contract_type || 'دائم'}]
            </div>
          ))}
          
        {/* حالة عدم وجود نتائج */}
        {employees.filter(emp => emp.contract_type !== 'إنهاء تعاقد').filter(emp => emp.employee_name.toLowerCase().includes(empSearchTerm.toLowerCase()) || String(emp.employee_code).toLowerCase().includes(empSearchTerm.toLowerCase())).length === 0 && (
          <div style={{ padding: '12px', fontSize: '12px', color: 'var(--muted)', textAlign: 'center' }}>
            لا توجد نتائج مطابقة 🔍
          </div>
        )}
      </div>
    </>
  )}
</div>
