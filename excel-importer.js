// excel-importer.js
// استيراد ملف Excel مباشرة على الهاتف بدون سيرفر
// يستخدم مكتبة SheetJS (xlsx) المتاحة من CDN

const ExcelImporter = {

  // قراءة ملف Excel وتحويله لبيانات JSON متوافقة مع الهاتف
  async importFromExcelFile(file) {
    if (!window.XLSX) throw new Error('مكتبة Excel غير محمّلة');

    // قراءة الملف
    const buffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });

    // تحليل الملف
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rawRows.length < 2) throw new Error('الملف فارغ أو لا يحتوي بيانات');

    // أول صف = هيدر، نتخطاه
    const dataRows = rawRows.slice(1);
    const rows = [];

    for (const row of dataRows) {
      // الأعمدة: 0=رقم القيد, 1=بشان, 2=التاريخ, 3=ملاحظات, 4=عرض الفاكس
      const faxNum = row[0];
      if (!faxNum && faxNum !== 0) continue; // تخطي الصفوف الفارغة

      // معالجة التاريخ
      let dateStr = '';
      const dateVal = row[2];
      if (dateVal instanceof Date) {
        const d = dateVal;
        dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      } else if (typeof dateVal === 'string' && dateVal) {
        // محاولة تحويل النص لتاريخ
        const parts = dateVal.split(/[\/\-\.]/);
        if (parts.length === 3) {
          // تحديد الصيغة (يوم/شهر/سنة أو سنة-شهر-يوم)
          if (parts[0].length === 4) {
            dateStr = dateVal.substring(0, 10);
          } else {
            dateStr = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
          }
        }
      } else if (typeof dateVal === 'number') {
        // Excel serial date
        const d = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
        dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }

      rows.push({
        fax_number: String(faxNum).trim(),
        received_date: dateStr,
        received_time: '00:00',
        sender_entity: 'مستورد من Excel',
        subject: String(row[1] || '').trim(),
        department: '',
        priority: 'عادي',
        notes: String(row[3] || '').trim(),
        status: 'جديد',
        is_archived: 0,
        created_at: new Date().toLocaleString('ar-EG'),
        updated_at: new Date().toLocaleString('ar-EG'),
        attachment_path: null,
      });
    }

    return rows;
  }
};

window.ExcelImporter = ExcelImporter;
