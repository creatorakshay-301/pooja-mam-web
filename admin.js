document.addEventListener('DOMContentLoaded', () => {
  const loginSection = document.querySelector('#admin-login');
  const dashboard = document.querySelector('#admin-dashboard');
  const loginForm = document.querySelector('#admin-login-form');
  const loginStatus = document.querySelector('#admin-login-status');
  const dashboardStatus = document.querySelector('#admin-dashboard-status');
  const logoutButton = document.querySelector('#admin-logout');

  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle('error', isError);
    element.classList.toggle('success', Boolean(message) && !isError);
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options
    });
    const result = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error(result.error || 'Request failed.'), { status: response.status });
    }
    return result;
  }

  function createTable(container, headers, rows, emptyMessage, statusOptions = null) {
    container.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-empty';
      empty.textContent = emptyMessage;
      container.append(empty);
      return;
    }

    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headers.forEach((header) => {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = header;
      headerRow.append(cell);
    });
    head.append(headerRow);
    table.append(head);

    const body = document.createElement('tbody');
    rows.forEach((row) => {
      const tableRow = document.createElement('tr');
      row.cells.forEach((value, index) => {
        const cell = document.createElement('td');
        if (statusOptions && index === headers.length - 1) {
          const controls = document.createElement('div');
          controls.className = 'admin-status-controls';
          const select = document.createElement('select');
          select.setAttribute('aria-label', `Update ${statusOptions.label} status`);
          statusOptions.values.forEach((optionValue) => {
            const option = document.createElement('option');
            option.value = optionValue;
            option.textContent = optionValue;
            option.selected = optionValue === value;
            select.append(option);
          });
          const button = document.createElement('button');
          button.className = 'secondary-btn small';
          button.type = 'button';
          button.textContent = 'Save';
          button.dataset.recordCollection = statusOptions.collection;
          button.dataset.recordId = row.id;
          button.dataset.currentStatus = value;
          controls.append(select, button);
          cell.append(controls);
        } else {
          cell.textContent = String(value ?? '');
        }
        tableRow.append(cell);
      });
      body.append(tableRow);
    });
    table.append(body);
    container.append(table);
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
  }

  function renderRecords(data) {
    const summaryItems = [
      ['Consultations', data.consultations.length],
      ['Messages', data.messages.length],
      ['Order Requests', data.orders.length]
    ];
    const summary = document.querySelector('#admin-summary');
    summary.replaceChildren();
    summaryItems.forEach(([label, count]) => {
      const card = document.createElement('div');
      card.className = 'info-card';
      const number = document.createElement('strong');
      number.textContent = count;
      const title = document.createElement('span');
      title.textContent = label;
      card.append(number, title);
      summary.append(card);
    });

    createTable(
      document.querySelector('#consultations-table'),
      ['Date', 'Name', 'Phone', 'Service', 'Query', 'Status'],
      data.consultations.map((item) => ({
        id: item.id,
        cells: [formatDate(item.createdAt), item.name, item.phone, item.service, item.message, item.status]
      })),
      'No consultation requests yet.',
      { collection: 'consultations', label: 'consultation', values: ['new', 'contacted', 'completed'] }
    );
    createTable(
      document.querySelector('#messages-table'),
      ['Date', 'Name', 'Email', 'Message', 'Status'],
      data.messages.map((item) => ({
        id: item.id,
        cells: [formatDate(item.createdAt), item.name, item.email, item.message, item.status]
      })),
      'No contact messages yet.',
      { collection: 'messages', label: 'message', values: ['new', 'replied', 'closed'] }
    );
    createTable(
      document.querySelector('#orders-table'),
      ['Date', 'Name', 'Phone', 'Delivery Address', 'Items', 'Total', 'Payment', 'Status'],
      data.orders.map((item) => ({
        id: item.id,
        cells: [
          formatDate(item.createdAt),
          item.name,
          item.phone,
          item.address,
          item.items.map((product) => `${product.name} × ${product.quantity}`).join(', '),
          new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(item.total),
          item.paymentStatus,
          item.status
        ]
      })),
      'No order requests yet.',
      { collection: 'orders', label: 'order', values: ['pending', 'confirmed', 'fulfilled', 'cancelled'] }
    );
  }

  async function loadRecords() {
    setStatus(dashboardStatus, 'Loading saved records…');
    try {
      const data = await request('/api/admin/records');
      renderRecords(data);
      setStatus(dashboardStatus, '');
      loginSection.hidden = true;
      dashboard.hidden = false;
      logoutButton.hidden = false;
    } catch (error) {
      if (error.status === 401) {
        dashboard.hidden = true;
        loginSection.hidden = false;
        logoutButton.hidden = true;
        setStatus(loginStatus, 'Please sign in to continue.', true);
      } else {
        setStatus(dashboardStatus, error.message || 'Could not load saved records.', true);
      }
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setStatus(loginStatus, 'Signing in…');
    try {
      await request('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginForm.querySelector('[name="password"]').value })
      });
      loginForm.reset();
      await loadRecords();
    } catch (error) {
      setStatus(loginStatus, error.message || 'Could not sign in.', true);
    } finally {
      submitButton.disabled = false;
    }
  });

  document.querySelector('#admin-refresh').addEventListener('click', loadRecords);

  dashboard.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-record-collection]');
    if (!button) return;

    const select = button.parentElement.querySelector('select');
    const status = select.value;
    if (status === button.dataset.currentStatus) return;

    button.disabled = true;
    setStatus(dashboardStatus, 'Saving status…');
    try {
      await request(`/api/admin/records/${button.dataset.recordCollection}/${button.dataset.recordId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      await loadRecords();
    } catch (error) {
      setStatus(dashboardStatus, error.message || 'Could not update status.', true);
    } finally {
      button.disabled = false;
    }
  });

  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    try {
      await request('/api/admin/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      dashboard.hidden = true;
      loginSection.hidden = false;
      logoutButton.hidden = true;
      setStatus(loginStatus, 'You have signed out.');
    } catch (error) {
      setStatus(dashboardStatus, error.message || 'Could not sign out.', true);
    } finally {
      logoutButton.disabled = false;
    }
  });
});
