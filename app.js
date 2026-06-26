// app.js - منطق تطبيق فاكسات اللواء الجوي 533 - نسخة الهاتف PWA

(function () {
  'use strict';

  // ============================================================
  // أدوات عامة
  // ============================================================
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  function pad2(n) { return String(n).padStart(2, '0'); }
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  function nowTime() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  // Toast
  function toast(msg, type='success') {
    const c = $('#toastContainer');
    const el = document.createElement('div');
    el.className = `toast${type==='error'?' error':type==='info'?' info':''}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity 0.3s'; setTimeout(()=>el.remove(),300); }, 3000);
  }

  // Confirm
  let confirmCb = null;
  function confirm(title, msg, onYes) {
    $('#confirmTitle').textContent = title;
    $('#confirmMsg').textContent = msg;
    confirmCb = onYes;
    $('#confirmOverlay').classList.add('open');
  }
  $('#btnConfirmYes').addEventListener('click', () => {
    if (confirmCb) confirmCb();
    $('#confirmOverlay').classList.remove('open');
    confirmCb = null;
  });
  $('#btnConfirmNo').addEventListener('click', () => {
    $('#confirmOverlay').classList.remove('open');
    confirmCb = null;
  });

  // Sheets
  function openSheet(id) { $('#'+id).classList.add('open'); document.body.style.overflow='hidden'; }
  function closeSheet(id) { $('#'+id).classList.remove('open'); document.body.style.overflow=''; }

  $$('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeSheet(btn.dataset.close));
  });
  $$('.sheet-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeSheet(overlay.id);
    });
  });

  // ============================================================
  // الشارات
  // ============================================================
  function incomingBadge(status) {
    const m = {'جديد':'badge-new','قيد المعالجة':'badge-processing','تم الإنجاز':'badge-done','مؤرشف':'badge-archived'};
    return `<span class="badge ${m[status]||'badge-new'}">${escHtml(status)}</span>`;
  }
  function priorityBadge(p) {
    const m = {'عادي':'badge-normal','عاجل':'badge-urgent','سري':'badge-secret'};
    return `<span class="badge ${m[p]||'badge-normal'}">${escHtml(p)}</span>`;
  }
  function outgoingBadge(s) {
    const m = {'قيد الإرسال':'badge-sending','تم الإرسال':'badge-sent','فشل الإرسال':'badge-failed'};
    return `<span class="badge ${m[s]||'badge-sending'}">${escHtml(s)}</span>`;
  }

  // ============================================================
  // التنقل
  // ============================================================
  const mainPages = ['dashboard','incoming','outgoing','search','more'];
  let currentPage = 'dashboard';
  let currentIncomingFilter = '';
  let currentOutgoingFilter = '';

  function showPage(pageId) {
    $$('.page').forEach(p => p.classList.remove('active'));
    $('#page-'+pageId).classList.add('active');

    const isMain = mainPages.includes(pageId);
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    if (isMain) {
      const nb = $(`.nav-btn[data-page="${pageId}"]`);
      if (nb) nb.classList.add('active');
    }

    const fabPages = ['incoming','outgoing'];
    $('#fabBtn').classList.toggle('hidden', !fabPages.includes(pageId));

    currentPage = pageId;

    const loaders = {
      dashboard: loadDashboard,
      incoming: loadIncoming,
      outgoing: loadOutgoing,
      archive: loadArchive,
      activity: loadActivity,
    };
    if (loaders[pageId]) loaders[pageId]();
  }

  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });

  $('#btnGoArchive').addEventListener('click', () => showPage('archive'));
  $('#btnGoActivity').addEventListener('click', () => showPage('activity'));
  $('#btnBackFromArchive').addEventListener('click', () => showPage('more'));
  $('#btnBackFromActivity').addEventListener('click', () => showPage('more'));

  // FAB
  $('#fabBtn').addEventListener('click', () => {
    if (currentPage === 'incoming') openIncomingSheet();
    else if (currentPage === 'outgoing') openOutgoingSheet();
  });

  // ============================================================
  // لوحة التحكم
  // ============================================================
  async function loadDashboard() {
    const stats = await FaxDB.getDashboardStats();
    $('#statIncomingToday').textContent = stats.incomingToday;
    $('#statOutgoingToday').textContent = stats.outgoingToday;
    $('#statArchived').textContent = stats.archivedCount;
    $('#statOpen').textContent = stats.openCount;
    $('#statIncomingTotal').textContent = stats.incomingTotal;
    $('#statOutgoingTotal').textContent = stats.outgoingTotal;

    const list = $('#recentActivityList');
    if (!stats.recentActivity.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">لا توجد عمليات بعد</div></div>`;
    } else {
      list.innerHTML = stats.recentActivity.map(a => `
        <div class="activity-item">
          <div class="activity-dot"></div>
          <div class="fax-item-content">
            <div class="activity-text">${escHtml(a.description)}</div>
            <div class="activity-time">${escHtml(a.action_type)} · ${escHtml(a.target_type)} · ${escHtml(a.created_at)}</div>
          </div>
        </div>`).join('');
    }
  }

  // ============================================================
  // الفاكس الوارد
  // ============================================================
  async function loadIncoming() {
    const search = $('#incomingSearch').value.trim().toLowerCase();
    const filters = { archived: 0 };
    if (currentIncomingFilter) filters.status = currentIncomingFilter;
    let rows = await FaxDB.getAllIncoming(filters);
    if (search) rows = rows.filter(r =>
      (r.fax_number||'').toLowerCase().includes(search) ||
      (r.sender_entity||'').toLowerCase().includes(search) ||
      (r.subject||'').toLowerCase().includes(search)
    );
    renderIncomingList(rows);
  }

  function renderIncomingList(rows) {
    const list = $('#incomingList');
    if (!rows.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">📥</div><div class="empty-text">لا توجد فاكسات واردة</div><div class="empty-sub">اضغط + لإضافة فاكس وارد</div></div>`;
      return;
    }
    list.innerHTML = rows.map(r => `
      <div class="fax-item" data-action="view-incoming" data-id="${r.id}">
        <div class="fax-item-icon">📥</div>
        <div class="fax-item-content">
          <div class="fax-item-number">${escHtml(r.fax_number)}</div>
          <div class="fax-item-entity">${escHtml(r.sender_entity)}</div>
          <div class="fax-item-subject">${escHtml(r.subject||'-')}</div>
        </div>
        <div class="fax-item-meta">
          <div class="fax-item-date">${escHtml(r.received_date)}</div>
          ${incomingBadge(r.status)}
          ${priorityBadge(r.priority)}
        </div>
      </div>`).join('');
  }

  // فلاتر الوارد
  $$('#incomingFilters .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      $$('#incomingFilters .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentIncomingFilter = pill.dataset.status;
      loadIncoming();
    });
  });
  $('#incomingSearch').addEventListener('input', debounce(loadIncoming, 250));

  // نموذج الوارد
  let editingIncomingId = null;

  function openIncomingSheet(fax = null) {
    editingIncomingId = fax ? fax.id : null;
    $('#sheetIncomingTitle').textContent = fax ? 'تعديل فاكس وارد' : 'فاكس وارد جديد';
    $('#incId').value = fax?.id || '';
    $('#incFaxNum').value = fax?.fax_number || '';
    $('#incDate').value = fax?.received_date || todayISO();
    $('#incTime').value = fax?.received_time || nowTime();
    $('#incSender').value = fax?.sender_entity || '';
    $('#incSubject').value = fax?.subject || '';
    $('#incDept').value = fax?.department || '';
    $('#incPriority').value = fax?.priority || 'عادي';
    $('#incStatus').value = fax?.status || 'جديد';
    $('#incNotes').value = fax?.notes || '';
    openSheet('sheetIncoming');
  }

  $('#btnSaveIncoming').addEventListener('click', async () => {
    const faxNum = $('#incFaxNum').value.trim();
    const sender = $('#incSender').value.trim();
    const date = $('#incDate').value;
    const time = $('#incTime').value;
    if (!faxNum || !sender || !date || !time) {
      toast('الرجاء تعبئة الحقول الإلزامية (رقم الفاكس، الجهة، التاريخ، الوقت)', 'error');
      return;
    }
    const data = {
      fax_number: faxNum,
      received_date: date,
      received_time: time,
      sender_entity: sender,
      subject: $('#incSubject').value.trim(),
      department: $('#incDept').value.trim(),
      priority: $('#incPriority').value,
      status: $('#incStatus').value,
      notes: $('#incNotes').value.trim(),
    };
    try {
      if (editingIncomingId) {
        await FaxDB.updateIncoming(editingIncomingId, data);
        toast('تم تحديث الفاكس الوارد بنجاح');
      } else {
        await FaxDB.addIncoming(data);
        toast('تم تسجيل الفاكس الوارد بنجاح');
      }
      closeSheet('sheetIncoming');
      loadIncoming();
      loadDashboard();
    } catch(e) {
      toast('حدث خطأ أثناء الحفظ', 'error');
    }
  });

  // عرض تفاصيل الوارد
  async function viewIncoming(id) {
    const fax = await FaxDB.getIncomingById(id);
    if (!fax) return;
    $('#sheetDetailTitle').textContent = 'تفاصيل الفاكس الوارد';
    $('#sheetDetailBody').innerHTML = `
      <div class="detail-row"><span class="detail-label">رقم الفاكس</span><span class="detail-value">${escHtml(fax.fax_number)}</span></div>
      <div class="detail-row"><span class="detail-label">التاريخ والوقت</span><span class="detail-value">${escHtml(fax.received_date)} - ${escHtml(fax.received_time)}</span></div>
      <div class="detail-row"><span class="detail-label">الجهة المرسلة</span><span class="detail-value">${escHtml(fax.sender_entity)}</span></div>
      <div class="detail-row"><span class="detail-label">الموضوع</span><span class="detail-value">${escHtml(fax.subject||'-')}</span></div>
      <div class="detail-row"><span class="detail-label">القسم</span><span class="detail-value">${escHtml(fax.department||'-')}</span></div>
      <div class="detail-row"><span class="detail-label">الأهمية</span><span class="detail-value">${priorityBadge(fax.priority)}</span></div>
      <div class="detail-row"><span class="detail-label">الحالة</span><span class="detail-value">${incomingBadge(fax.status)}</span></div>
      <div class="detail-row"><span class="detail-label">ملاحظات</span><span class="detail-value">${escHtml(fax.notes||'-')}</span></div>
    `;
    $('#sheetDetailActions').innerHTML = `
      <button class="btn btn-light" data-action="edit-inc" data-id="${fax.id}">✏️ تعديل</button>
      <button class="btn btn-light" data-action="archive-inc" data-id="${fax.id}">🗄️ أرشفة</button>
      <button class="btn btn-danger" data-action="delete-inc" data-id="${fax.id}">🗑️</button>
    `;
    openSheet('sheetDetail');
  }

  // ============================================================
  // الفاكس الصادر
  // ============================================================
  async function loadOutgoing() {
    const search = $('#outgoingSearch').value.trim().toLowerCase();
    const filters = { archived: 0 };
    if (currentOutgoingFilter) filters.send_status = currentOutgoingFilter;
    let rows = await FaxDB.getAllOutgoing(filters);
    if (search) rows = rows.filter(r =>
      (r.fax_number||'').toLowerCase().includes(search) ||
      (r.recipient_entity||'').toLowerCase().includes(search) ||
      (r.subject||'').toLowerCase().includes(search)
    );
    renderOutgoingList(rows);
  }

  function renderOutgoingList(rows) {
    const list = $('#outgoingList');
    if (!rows.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">📤</div><div class="empty-text">لا توجد فاكسات صادرة</div><div class="empty-sub">اضغط + لإنشاء فاكس صادر</div></div>`;
      return;
    }
    list.innerHTML = rows.map(r => `
      <div class="fax-item" data-action="view-outgoing" data-id="${r.id}">
        <div class="fax-item-icon">📤</div>
        <div class="fax-item-content">
          <div class="fax-item-number">${escHtml(r.fax_number)}</div>
          <div class="fax-item-entity">${escHtml(r.recipient_entity)}</div>
          <div class="fax-item-subject">${escHtml(r.subject||'-')}</div>
        </div>
        <div class="fax-item-meta">
          <div class="fax-item-date">${escHtml(r.sent_date)}</div>
          ${outgoingBadge(r.send_status)}
        </div>
      </div>`).join('');
  }

  $$('#outgoingFilters .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      $$('#outgoingFilters .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentOutgoingFilter = pill.dataset.status;
      loadOutgoing();
    });
  });
  $('#outgoingSearch').addEventListener('input', debounce(loadOutgoing, 250));

  let editingOutgoingId = null;

  async function openOutgoingSheet(fax = null) {
    editingOutgoingId = fax ? fax.id : null;
    $('#sheetOutgoingTitle').textContent = fax ? 'تعديل فاكس صادر' : 'فاكس صادر جديد';
    $('#outId').value = fax?.id || '';
    $('#outFaxNum').value = fax?.fax_number || '';
    $('#outDate').value = fax?.sent_date || todayISO();
    $('#outTime').value = fax?.sent_time || nowTime();
    $('#outRecipient').value = fax?.recipient_entity || '';
    $('#outSubject').value = fax?.subject || '';
    $('#outDept').value = fax?.department || '';
    $('#outStatus').value = fax?.send_status || 'قيد الإرسال';
    $('#outNotes').value = fax?.notes || '';
    openSheet('sheetOutgoing');
  }

  $('#btnSaveOutgoing').addEventListener('click', async () => {
    const faxNum = $('#outFaxNum').value.trim();
    const recipient = $('#outRecipient').value.trim();
    const subject = $('#outSubject').value.trim();
    const date = $('#outDate').value;
    const time = $('#outTime').value;
    if (!faxNum || !recipient || !subject || !date || !time) {
      toast('الرجاء تعبئة الحقول الإلزامية (الرقم، الجهة، الموضوع، التاريخ، الوقت)', 'error');
      return;
    }
    const data = {
      fax_number: faxNum,
      sent_date: date,
      sent_time: time,
      recipient_entity: recipient,
      subject,
      department: $('#outDept').value.trim(),
      send_status: $('#outStatus').value,
      notes: $('#outNotes').value.trim(),
    };
    try {
      if (editingOutgoingId) {
        await FaxDB.updateOutgoing(editingOutgoingId, data);
        toast('تم تحديث الفاكس الصادر بنجاح');
      } else {
        await FaxDB.addOutgoing(data);
        toast('تم إنشاء الفاكس الصادر بنجاح');
      }
      closeSheet('sheetOutgoing');
      loadOutgoing();
      loadDashboard();
    } catch(e) {
      toast('حدث خطأ أثناء الحفظ. تأكد من أن رقم الصادر غير مكرر', 'error');
    }
  });

  async function viewOutgoing(id) {
    const fax = await FaxDB.getOutgoingById(id);
    if (!fax) return;
    $('#sheetDetailTitle').textContent = 'تفاصيل الفاكس الصادر';
    $('#sheetDetailBody').innerHTML = `
      <div class="detail-row"><span class="detail-label">رقم الصادر</span><span class="detail-value">${escHtml(fax.fax_number)}</span></div>
      <div class="detail-row"><span class="detail-label">التاريخ والوقت</span><span class="detail-value">${escHtml(fax.sent_date)} - ${escHtml(fax.sent_time)}</span></div>
      <div class="detail-row"><span class="detail-label">الجهة المرسل إليها</span><span class="detail-value">${escHtml(fax.recipient_entity)}</span></div>
      <div class="detail-row"><span class="detail-label">الموضوع</span><span class="detail-value">${escHtml(fax.subject||'-')}</span></div>
      <div class="detail-row"><span class="detail-label">القسم</span><span class="detail-value">${escHtml(fax.department||'-')}</span></div>
      <div class="detail-row"><span class="detail-label">حالة الإرسال</span><span class="detail-value">${outgoingBadge(fax.send_status)}</span></div>
      <div class="detail-row"><span class="detail-label">ملاحظات</span><span class="detail-value">${escHtml(fax.notes||'-')}</span></div>
    `;
    $('#sheetDetailActions').innerHTML = `
      <button class="btn btn-light" data-action="edit-out" data-id="${fax.id}">✏️ تعديل</button>
      <button class="btn btn-light" data-action="archive-out" data-id="${fax.id}">🗄️ أرشفة</button>
      <button class="btn btn-danger" data-action="delete-out" data-id="${fax.id}">🗑️</button>
    `;
    openSheet('sheetDetail');
  }

  // ============================================================
  // معالج النقرات الموحّد
  // ============================================================
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const id = Number(el.dataset.id);

    if (action === 'view-incoming') { await viewIncoming(id); }
    if (action === 'view-outgoing') { await viewOutgoing(id); }

    if (action === 'edit-inc') {
      const fax = await FaxDB.getIncomingById(id);
      closeSheet('sheetDetail');
      setTimeout(() => openIncomingSheet(fax), 200);
    }
    if (action === 'archive-inc') {
      confirm('أرشفة الفاكس', 'هل تريد نقل هذا الفاكس للأرشيف؟', async () => {
        await FaxDB.archiveIncoming(id, 1);
        toast('تم أرشفة الفاكس');
        closeSheet('sheetDetail');
        loadIncoming(); loadDashboard();
      });
    }
    if (action === 'delete-inc') {
      confirm('حذف نهائي', 'سيتم حذف هذا الفاكس نهائياً ولا يمكن التراجع. هل أنت متأكد؟', async () => {
        await FaxDB.deleteIncoming(id);
        toast('تم الحذف النهائي', 'error');
        closeSheet('sheetDetail');
        loadIncoming(); loadDashboard();
      });
    }
    if (action === 'edit-out') {
      const fax = await FaxDB.getOutgoingById(id);
      closeSheet('sheetDetail');
      setTimeout(() => openOutgoingSheet(fax), 200);
    }
    if (action === 'archive-out') {
      confirm('أرشفة الفاكس', 'هل تريد نقل هذا الفاكس للأرشيف؟', async () => {
        await FaxDB.archiveOutgoing(id, 1);
        toast('تم أرشفة الفاكس');
        closeSheet('sheetDetail');
        loadOutgoing(); loadDashboard();
      });
    }
    if (action === 'delete-out') {
      confirm('حذف نهائي', 'سيتم حذف هذا الفاكس نهائياً ولا يمكن التراجع. هل أنت متأكد؟', async () => {
        await FaxDB.deleteOutgoing(id);
        toast('تم الحذف النهائي', 'error');
        closeSheet('sheetDetail');
        loadOutgoing(); loadDashboard();
      });
    }
    if (action === 'restore-inc') {
      confirm('استرجاع من الأرشيف', 'هل تريد استرجاع هذا الفاكس من الأرشيف؟', async () => {
        await FaxDB.archiveIncoming(id, 0);
        toast('تم الاسترجاع بنجاح');
        closeSheet('sheetDetail');
        loadArchive(); loadDashboard();
      });
    }
    if (action === 'restore-out') {
      confirm('استرجاع من الأرشيف', 'هل تريد استرجاع هذا الفاكس من الأرشيف؟', async () => {
        await FaxDB.archiveOutgoing(id, 0);
        toast('تم الاسترجاع بنجاح');
        closeSheet('sheetDetail');
        loadArchive(); loadDashboard();
      });
    }
  });

  // ============================================================
  // البحث المتقدم
  // ============================================================
  $('#searchType').addEventListener('change', () => {
    const type = $('#searchType').value;
    const sel = $('#searchStatus');
    const opts = type === 'incoming'
      ? ['','جديد','قيد المعالجة','تم الإنجاز','مؤرشف']
      : ['','قيد الإرسال','تم الإرسال','فشل الإرسال'];
    sel.innerHTML = opts.map(o => `<option value="${o}">${o||'الكل'}</option>`).join('');
  });

  $('#btnSearch').addEventListener('click', async () => {
    const type = $('#searchType').value;
    const faxNum = $('#searchFaxNum').value.trim();
    const entity = $('#searchEntity').value.trim();
    const dateFrom = $('#searchDateFrom').value;
    const dateTo = $('#searchDateTo').value;
    const status = $('#searchStatus').value;

    const filters = {};
    if (faxNum) filters.fax_number = faxNum;
    if (dateFrom) filters.date_from = dateFrom;
    if (dateTo) filters.date_to = dateTo;
    if (status) {
      if (type === 'incoming') filters.status = status;
      else filters.send_status = status;
    }
    if (entity) {
      if (type === 'incoming') filters.sender_entity = entity;
      else filters.recipient_entity = entity;
    }

    const rows = type === 'incoming'
      ? await FaxDB.getAllIncoming(filters)
      : await FaxDB.getAllOutgoing(filters);

    const card = $('#searchResultsCard');
    const results = $('#searchResults');
    card.style.display = '';

    if (!rows.length) {
      results.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">لا توجد نتائج مطابقة</div></div>`;
      return;
    }

    if (type === 'incoming') {
      results.innerHTML = rows.map(r => `
        <div class="fax-item" data-action="view-incoming" data-id="${r.id}">
          <div class="fax-item-icon">📥</div>
          <div class="fax-item-content">
            <div class="fax-item-number">${escHtml(r.fax_number)}</div>
            <div class="fax-item-entity">${escHtml(r.sender_entity)}</div>
            <div class="fax-item-subject">${escHtml(r.subject||'-')}</div>
          </div>
          <div class="fax-item-meta">
            <div class="fax-item-date">${escHtml(r.received_date)}</div>
            ${incomingBadge(r.status)}
          </div>
        </div>`).join('');
    } else {
      results.innerHTML = rows.map(r => `
        <div class="fax-item" data-action="view-outgoing" data-id="${r.id}">
          <div class="fax-item-icon">📤</div>
          <div class="fax-item-content">
            <div class="fax-item-number">${escHtml(r.fax_number)}</div>
            <div class="fax-item-entity">${escHtml(r.recipient_entity)}</div>
            <div class="fax-item-subject">${escHtml(r.subject||'-')}</div>
          </div>
          <div class="fax-item-meta">
            <div class="fax-item-date">${escHtml(r.sent_date)}</div>
            ${outgoingBadge(r.send_status)}
          </div>
        </div>`).join('');
    }
  });

  // ============================================================
  // الأرشيف
  // ============================================================
  let archiveType = 'incoming';

  async function loadArchive() {
    const list = $('#archiveList');
    let rows;
    if (archiveType === 'incoming') {
      rows = await FaxDB.getAllIncoming({ archived: 1 });
      if (!rows.length) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">🗄️</div><div class="empty-text">لا توجد فاكسات واردة مؤرشفة</div></div>`;
        return;
      }
      list.innerHTML = rows.map(r => `
        <div class="fax-item">
          <div class="fax-item-icon">📥</div>
          <div class="fax-item-content">
            <div class="fax-item-number">${escHtml(r.fax_number)}</div>
            <div class="fax-item-entity">${escHtml(r.sender_entity)}</div>
            <div class="fax-item-subject">${escHtml(r.subject||'-')}</div>
          </div>
          <div class="fax-item-meta">
            <div class="fax-item-date">${escHtml(r.received_date)}</div>
            <button class="btn btn-light" style="font-size:11px;padding:4px 8px;" data-action="restore-inc" data-id="${r.id}">↩️ استرجاع</button>
          </div>
        </div>`).join('');
    } else {
      rows = await FaxDB.getAllOutgoing({ archived: 1 });
      if (!rows.length) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">🗄️</div><div class="empty-text">لا توجد فاكسات صادرة مؤرشفة</div></div>`;
        return;
      }
      list.innerHTML = rows.map(r => `
        <div class="fax-item">
          <div class="fax-item-icon">📤</div>
          <div class="fax-item-content">
            <div class="fax-item-number">${escHtml(r.fax_number)}</div>
            <div class="fax-item-entity">${escHtml(r.recipient_entity)}</div>
            <div class="fax-item-subject">${escHtml(r.subject||'-')}</div>
          </div>
          <div class="fax-item-meta">
            <div class="fax-item-date">${escHtml(r.sent_date)}</div>
            <button class="btn btn-light" style="font-size:11px;padding:4px 8px;" data-action="restore-out" data-id="${r.id}">↩️ استرجاع</button>
          </div>
        </div>`).join('');
    }
  }

  $('#archiveTabIn').addEventListener('click', () => {
    archiveType = 'incoming';
    $('#archiveTabIn').classList.add('active');
    $('#archiveTabOut').classList.remove('active');
    loadArchive();
  });
  $('#archiveTabOut').addEventListener('click', () => {
    archiveType = 'outgoing';
    $('#archiveTabOut').classList.add('active');
    $('#archiveTabIn').classList.remove('active');
    loadArchive();
  });

  // ============================================================
  // سجل النشاط
  // ============================================================
  async function loadActivity() {
    const logs = await FaxDB.getActivityLog(200);
    const list = $('#activityList');
    if (!logs.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">📜</div><div class="empty-text">لا توجد عمليات مسجلة</div></div>`;
      return;
    }
    list.innerHTML = logs.map(a => `
      <div class="activity-item">
        <div class="activity-dot"></div>
        <div class="fax-item-content">
          <div class="activity-text">${escHtml(a.description)}</div>
          <div class="activity-time">${escHtml(a.action_type)} · ${escHtml(a.target_type)} · ${escHtml(a.created_at)}</div>
        </div>
      </div>`).join('');
  }

  // ============================================================
  // النسخ الاحتياطي
  // ============================================================
  $('#btnExportBackup').addEventListener('click', async () => {
    const json = await FaxDB.exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `fax533_backup_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('تم تصدير النسخة الاحتياطية بنجاح');
  });

  $('#btnImportBackupBtn').addEventListener('click', () => {
    $('#importFileInput').click();
  });

  $('#importFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    confirm('استيراد نسخة احتياطية', 'سيتم استبدال جميع البيانات الحالية ببيانات النسخة المختارة. هل تريد المتابعة؟', async () => {
      try {
        const text = await file.text();
        await FaxDB.importBackup(text);
        toast('تم استيراد النسخة الاحتياطية بنجاح');
        loadDashboard();
      } catch(e) {
        toast('فشل الاستيراد - تأكد من صحة الملف', 'error');
      }
    });
    e.target.value = '';
  });

  // ============================================================
  // Service Worker
  // ============================================================
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => {
      $('#topBarSub').textContent = 'يعمل بدون إنترنت ✓';
    }).catch(() => {});
  }

  // ============================================================
  // تهيئة التطبيق
  // ============================================================
  async function init() {
    await FaxDB.openDB();
    loadDashboard();
  }

  init().catch(console.error);

})();
