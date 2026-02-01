const analysisInput = document.getElementById('analysis_code');
const reportType = document.getElementById('report_type');
const analysisBtn = document.getElementById('analysis_btn');
const taskList = document.getElementById('task_list');
const refreshBtn = document.getElementById('refresh_tasks');
const metrics = {
  tasks: document.getElementById('metric_tasks'),
  running: document.getElementById('metric_running'),
  success: document.getElementById('metric_success')
};

const tasks = new Map();
const POLL_INTERVAL_MS = 3000;
let pollInterval = null;

const apiConfig = window.APP_CONFIG || {};
const apiBase = (apiConfig.apiBase || '').trim();

analysisInput.addEventListener('input', () => {
  analysisInput.value = analysisInput.value.toLowerCase().replace(/[^a-z0-9]/g, '');
  updateButtonState();
});

analysisInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    if (!analysisBtn.disabled) {
      submitAnalysis();
    }
  }
});

analysisBtn.addEventListener('click', submitAnalysis);
refreshBtn.addEventListener('click', () => fetchTasks());

function updateButtonState() {
  const code = analysisInput.value.trim().toLowerCase();
  const isAStock = /^\d{6}$/.test(code);
  const isHKStock = /^hk\d{5}$/.test(code);
  const isUSStock = /^[a-z]{1,5}$/.test(code);
  analysisBtn.disabled = !(isAStock || isHKStock || isUSStock);
}

function getBaseUrl() {
  return apiBase ? apiBase.replace(/\/$/, '') : '';
}

function buildUrl(path) {
  const base = getBaseUrl();
  return base ? `${base}${path}` : path;
}

function updateMetrics() {
  const taskArray = Array.from(tasks.values());
  const total = taskArray.length;
  const running = taskArray.filter(task => task.status === 'running' || task.status === 'pending').length;
  const success = taskArray.filter(task => task.status === 'completed').length;
  metrics.tasks.textContent = total;
  metrics.running.textContent = running;
  metrics.success.textContent = total ? `${Math.round((success / total) * 100)}%` : '0%';
}

function renderTasks() {
  if (tasks.size === 0) {
    taskList.innerHTML = '<div class="empty-state">暂无任务，输入股票代码开始分析。</div>';
    updateMetrics();
    return;
  }

  const taskCards = Array.from(tasks.entries())
    .sort((a, b) => (b[1].start_time || '').localeCompare(a[1].start_time || ''))
    .map(([taskId, task]) => renderTaskCard(taskId, task))
    .join('');

  taskList.innerHTML = taskCards;
  updateMetrics();
}

function renderTaskCard(taskId, task) {
  const status = task.status || 'pending';
  const statusLabel = status === 'completed'
    ? '完成'
    : status === 'running'
      ? '分析中'
      : status === 'failed'
        ? '失败'
        : '等待中';

  return `
    <div class="task-card ${status}">
      <div class="task-status">${statusLabel}</div>
      <div>
        <p class="task-title">${task.code || taskId}</p>
        <p class="task-meta">${task.report_type || 'simple'} · ${task.start_time ? new Date(task.start_time).toLocaleTimeString('zh-CN') : '-'} · ${task.result?.operation_advice || '等待中'}</p>
      </div>
      <button class="task-action" data-task="${taskId}">×</button>
    </div>
  `;
}

function attachTaskHandlers() {
  taskList.querySelectorAll('.task-action').forEach(button => {
    button.addEventListener('click', (event) => {
      const taskId = event.currentTarget.dataset.task;
      tasks.delete(taskId);
      renderTasks();
    });
  });
}

function submitAnalysis() {
  const code = analysisInput.value.trim().toLowerCase();
  if (!code) return;

  analysisBtn.disabled = true;
  analysisBtn.textContent = '提交中...';

  const requestUrl = buildUrl(`/analysis?code=${encodeURIComponent(code)}&report_type=${encodeURIComponent(reportType.value)}`);

  fetch(requestUrl)
    .then(response => response.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.error || '分析提交失败');
      }
      const taskId = data.task_id;
      tasks.set(taskId, {
        code,
        status: 'running',
        start_time: new Date().toISOString(),
        report_type: reportType.value
      });
      analysisInput.value = '';
      renderTasks();
      startPolling();
    })
    .catch(error => {
      alert(error.message);
    })
    .finally(() => {
      analysisBtn.disabled = false;
      analysisBtn.textContent = '开始分析';
      updateButtonState();
    });
}

function fetchTasks() {
  const requestUrl = buildUrl('/tasks');
  fetch(requestUrl)
    .then(response => response.json())
    .then(data => {
      if (!data.success || !data.tasks) return;
      data.tasks.forEach(task => {
        tasks.set(task.id, task);
      });
      renderTasks();
      attachTaskHandlers();
    })
    .catch(() => {
      renderTasks();
    });
}

function pollTask(taskId) {
  const requestUrl = buildUrl(`/task?id=${encodeURIComponent(taskId)}`);
  return fetch(requestUrl)
    .then(response => response.json())
    .then(data => {
      if (data.success && data.task) {
        tasks.set(taskId, data.task);
      }
    });
}

function pollAllTasks() {
  const runningTasks = Array.from(tasks.entries()).filter(([, task]) => task.status === 'running' || task.status === 'pending');
  if (runningTasks.length === 0) {
    stopPolling();
    return;
  }

  Promise.all(runningTasks.map(([taskId]) => pollTask(taskId))).finally(() => {
    renderTasks();
    attachTaskHandlers();
  });
}

function startPolling() {
  if (!pollInterval) {
    pollInterval = setInterval(pollAllTasks, POLL_INTERVAL_MS);
  }
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

updateButtonState();
renderTasks();
attachTaskHandlers();
