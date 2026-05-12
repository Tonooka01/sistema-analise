/**
 * static/js/cashflow.js
 * Análise de Fluxo de Caixa — tela inicial do dashboard.
 */

import * as state from './state.js';
import { renderChart } from './charts.js';
import { showLoading, showError, formatCurrency } from './utils.js';

const API = state.API_BASE_URL;

// ---- Render inicial ----

export async function renderCashflowDashboard(container) {
    if (!container) return;

    container.innerHTML = `
        <div id="cashflow-root">
            <!-- Header -->
            <div class="cf-header">
                <div>
                    <h2 class="cf-title">💰 Fluxo de Caixa</h2>
                    <p class="cf-subtitle">Entradas vs Saídas — visão consolidada</p>
                </div>
                <div class="cf-header-actions">
                    <select id="cfPeriod" class="cf-select">
                        <option value="month">Por Mês</option>
                        <option value="year">Por Ano</option>
                    </select>
                    <input type="date" id="cfStartDate" class="cf-date-input" placeholder="Início">
                    <input type="date" id="cfEndDate"   class="cf-date-input" placeholder="Fim">
                    <button id="cfFilterBtn" class="cf-btn-primary">Filtrar</button>
                    <button id="cfPlanosToggle" class="cf-btn-secondary">🗂️ Planos de Contas</button>
                </div>
            </div>

            <!-- Painel de Planos de Contas -->
            <div id="cfPlanosPanel" class="cf-planos-panel hidden">
                <div class="cf-planos-header">
                    <span style="font-weight:700;color:#0f2d5e;font-size:0.85rem;">Filtrar por Plano de Contas</span>
                    <div style="display:flex;gap:0.5rem;">
                        <button id="cfSelectAll"   class="cf-btn-xs cf-btn-navy">✅ Selecionar Tudo</button>
                        <button id="cfDeselectAll" class="cf-btn-xs cf-btn-gray">☐ Limpar</button>
                    </div>
                </div>
                <div class="cf-planos-search">
                    <input type="text" id="cfPlanosSearch" placeholder="🔍 Pesquisar..." class="cf-date-input" style="width:100%">
                </div>
                <div id="cfPlanosCheckboxes" class="cf-planos-list">
                    <div style="color:#999;font-size:0.82rem;padding:0.5rem">Carregando...</div>
                </div>
                <div style="padding:0.75rem 1rem;border-top:1px solid #eee;text-align:right;">
                    <button id="cfApplyPlanos" class="cf-btn-primary">Aplicar Filtro</button>
                </div>
            </div>

            <!-- KPI Cards -->
            <div class="cf-kpi-row" id="cfKpiRow">
                <div class="cf-kpi cf-kpi-green">
                    <span class="cf-kpi-label">Total Entradas</span>
                    <span class="cf-kpi-value" id="cfKpiEntrada">—</span>
                </div>
                <div class="cf-kpi cf-kpi-red">
                    <span class="cf-kpi-label">Total Saídas</span>
                    <span class="cf-kpi-value" id="cfKpiSaida">—</span>
                </div>
                <div class="cf-kpi cf-kpi-blue" id="cfKpiSaldoCard">
                    <span class="cf-kpi-label">Saldo Líquido</span>
                    <span class="cf-kpi-value" id="cfKpiSaldo">—</span>
                </div>
            </div>

            <!-- Gráfico principal -->
            <div class="cf-chart-card">
                <div class="cf-chart-header">
                    <span class="cf-chart-title">Entradas × Saídas × Saldo</span>
                    <div class="cf-legend">
                        <span class="cf-legend-dot" style="background:#10b981"></span>Entradas
                        <span class="cf-legend-dot" style="background:#ef4444"></span>Saídas
                        <span class="cf-legend-dot" style="background:#00aaff; border-radius:0"></span>Saldo
                    </div>
                </div>
                <div style="position:relative; height:320px;">
                    <canvas id="cfMainChart"></canvas>
                </div>
            </div>

            <!-- Gráfico categorias + tabela -->
            <div class="cf-bottom-row">
                <div class="cf-chart-card cf-chart-small">
                    <div class="cf-chart-header">
                        <span class="cf-chart-title">Despesas por Categoria</span>
                    </div>
                    <div style="position:relative; height:260px;">
                        <canvas id="cfCatChart"></canvas>
                    </div>
                </div>
                <div class="cf-chart-card cf-chart-table">
                    <div class="cf-chart-header">
                        <span class="cf-chart-title">Detalhamento por Período</span>
                    </div>
                    <div class="cf-table-wrap">
                        <table class="cf-table" id="cfTable">
                            <thead><tr><th>Período</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr></thead>
                            <tbody id="cfTableBody"><tr><td colspan="4" style="text-align:center;color:#999">Carregando...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <style>
            #cashflow-root { font-family: 'Inter', sans-serif; padding: 0.5rem 0; }
            .cf-header { display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; margin-bottom:1.25rem; }
            .cf-title { font-size:1.4rem; font-weight:800; color:#0f2d5e; margin:0; }
            .cf-subtitle { font-size:0.8rem; color:#64748b; margin:0.2rem 0 0; }
            .cf-header-actions { display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center; }
            .cf-upload-btn { background:#0f2d5e; color:#fff; padding:0.42rem 0.9rem; border-radius:7px; font-size:0.82rem; font-weight:600; cursor:pointer; white-space:nowrap; transition:background 0.18s; }
            .cf-upload-btn:hover { background:#163a75; }
            .cf-select, .cf-date-input { background:#f8fafc; border:1.5px solid #dde3ec; border-radius:7px; padding:0.42rem 0.7rem; font-size:0.82rem; color:#1e293b; }
            .cf-btn-primary { background:#1d6dcc; color:#fff; border:none; border-radius:7px; padding:0.42rem 1rem; font-size:0.82rem; font-weight:600; cursor:pointer; }
            .cf-btn-primary:hover { background:#1558a8; }
            .cf-upload-status { padding:0.6rem 1rem; border-radius:8px; font-size:0.85rem; font-weight:500; margin-bottom:1rem; }
            .cf-upload-status.success { background:#dcfce7; color:#166534; border:1px solid #bbf7d0; }
            .cf-upload-status.error   { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; }
            .cf-upload-status.hidden  { display:none; }
            .cf-btn-secondary { background:#f1f5f9; color:#0f2d5e; border:1.5px solid #dde3ec; border-radius:7px; padding:0.42rem 0.9rem; font-size:0.82rem; font-weight:600; cursor:pointer; }
            .cf-btn-secondary:hover { background:#e2e8f0; }
            .cf-btn-xs { font-size:0.75rem; font-weight:600; padding:0.3rem 0.7rem; border-radius:6px; border:none; cursor:pointer; }
            .cf-btn-navy { background:#0f2d5e; color:#fff; }
            .cf-btn-navy:hover { background:#163a75; }
            .cf-btn-gray { background:#e2e8f0; color:#475569; }
            .cf-btn-gray:hover { background:#cbd5e1; }
            .cf-planos-panel { background:#fff; border:1.5px solid #dde3ec; border-radius:12px; margin-bottom:1.25rem; box-shadow:0 2px 8px rgba(15,45,94,0.08); overflow:hidden; }
            .cf-planos-header { display:flex; justify-content:space-between; align-items:center; padding:0.875rem 1.25rem; border-bottom:1px solid #eee; background:#f8fafc; }
            .cf-planos-search { padding:0.75rem 1.25rem; border-bottom:1px solid #eee; }
            .cf-planos-list { display:flex; flex-wrap:wrap; gap:0.4rem; padding:0.875rem 1.25rem; max-height:220px; overflow-y:auto; }
            .cf-plano-item { display:flex; align-items:center; gap:0.4rem; background:#f8fafc; border:1px solid #dde3ec; border-radius:6px; padding:0.3rem 0.7rem; font-size:0.78rem; cursor:pointer; transition:background 0.15s; }
            .cf-plano-item:hover { background:#eff6ff; border-color:#93c5fd; }
            .cf-plano-item input { cursor:pointer; accent-color:#0f2d5e; }
            .cf-plano-item.checked { background:#eff6ff; border-color:#3b82f6; }
            .hidden { display:none !important; }
            .cf-kpi-row { display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1.25rem; }
            .cf-kpi { flex:1 1 180px; background:#fff; border-radius:12px; padding:1.1rem 1.25rem; box-shadow:0 2px 8px rgba(15,45,94,0.08); border:1px solid #dde3ec; display:flex; flex-direction:column; gap:0.3rem; }
            .cf-kpi-green { border-left:4px solid #10b981; }
            .cf-kpi-red   { border-left:4px solid #ef4444; }
            .cf-kpi-blue  { border-left:4px solid #00aaff; }
            .cf-kpi-label { font-size:0.72rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; }
            .cf-kpi-value { font-size:1.5rem; font-weight:800; color:#0f2d5e; }
            .cf-chart-card { background:#fff; border-radius:12px; padding:1.25rem; box-shadow:0 2px 8px rgba(15,45,94,0.08); border:1px solid #dde3ec; margin-bottom:1.25rem; }
            .cf-chart-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.875rem; padding-bottom:0.6rem; border-bottom:2px solid #00aaff; }
            .cf-chart-title { font-size:0.875rem; font-weight:700; color:#0f2d5e; }
            .cf-legend { display:flex; gap:0.75rem; font-size:0.75rem; color:#64748b; align-items:center; }
            .cf-legend-dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:3px; }
            .cf-bottom-row { display:flex; gap:1.25rem; flex-wrap:wrap; }
            .cf-chart-small { flex:1 1 300px; }
            .cf-chart-table { flex:2 1 400px; }
            .cf-table-wrap { max-height:280px; overflow-y:auto; }
            .cf-table { width:100%; border-collapse:collapse; font-size:0.82rem; }
            .cf-table th { background:#0f2d5e; color:#fff; padding:8px 12px; font-size:0.72rem; font-weight:600; text-align:right; }
            .cf-table th:first-child { text-align:left; }
            .cf-table td { padding:7px 12px; border-bottom:1px solid #eef0f4; text-align:right; }
            .cf-table td:first-child { text-align:left; font-weight:600; color:#0f2d5e; }
            .cf-table tr:hover td { background:#f5f8ff; }
            .td-pos { color:#10b981; font-weight:700; }
            .td-neg { color:#ef4444; font-weight:700; }
        </style>
    `;

    // Eventos
    document.getElementById('cfFilterBtn').addEventListener('click', _loadCashflow);
    document.getElementById('cfFileInput')?.addEventListener('change', _handleUpload);

    // Toggle painel de planos
    document.getElementById('cfPlanosToggle').addEventListener('click', async () => {
        const panel = document.getElementById('cfPlanosPanel');
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden') && !panel.dataset.loaded) {
            await _loadPlanos();
            panel.dataset.loaded = '1';
        }
    });

    document.getElementById('cfSelectAll').addEventListener('click', () => {
        document.querySelectorAll('#cfPlanosCheckboxes input[type="checkbox"]').forEach(cb => { cb.checked = true; cb.closest('.cf-plano-item').classList.add('checked'); });
    });
    document.getElementById('cfDeselectAll').addEventListener('click', () => {
        document.querySelectorAll('#cfPlanosCheckboxes input[type="checkbox"]').forEach(cb => { cb.checked = false; cb.closest('.cf-plano-item').classList.remove('checked'); });
    });
    document.getElementById('cfPlanosSearch').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.cf-plano-item').forEach(item => {
            item.style.display = item.querySelector('label').textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });
    document.getElementById('cfApplyPlanos').addEventListener('click', () => {
        document.getElementById('cfPlanosPanel').classList.add('hidden');
        _loadCashflow();
    });

    // Carrega com últimos 12 meses por padrão
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    document.getElementById('cfStartDate').value = start.toISOString().slice(0,10);
    document.getElementById('cfEndDate').value   = now.toISOString().slice(0,10);

    await _loadCashflow();
}

async function _loadPlanosAndFilter(filterLabel) {
    await _loadPlanos();
    document.getElementById('cfPlanosPanel').dataset.loaded = '1';
    const checkboxes = document.querySelectorAll('#cfPlanosCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = cb.value === filterLabel;
        cb.closest('.cf-plano-item').classList.toggle('checked', cb.checked);
    });
    _loadCashflow();
}

async function _loadPlanos() {
    const container = document.getElementById('cfPlanosCheckboxes');
    try {
        const res = await fetch(`${API}/api/cashflow/planos_contas`);
        const data = await res.json();
        container.innerHTML = data.planos.map((p, i) => `
            <label class="cf-plano-item checked" id="cfpl_${i}">
                <input type="checkbox" value="${p.replace(/"/g,'&quot;')}" checked>
                <span>${p}</span>
            </label>
        `).join('');
        container.querySelectorAll('input').forEach(cb => {
            cb.addEventListener('change', () => cb.closest('.cf-plano-item').classList.toggle('checked', cb.checked));
        });
    } catch(e) {
        container.innerHTML = '<span style="color:red;font-size:0.8rem">Erro ao carregar planos</span>';
    }
}

function _getSelectedPlanos() {
    const checkboxes = document.querySelectorAll('#cfPlanosCheckboxes input[type="checkbox"]');
    if (!checkboxes.length) return ''; // se painel não foi aberto, sem filtro = tudo
    const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    // Se tudo selecionado, não filtra
    if (selected.length === checkboxes.length) return '';
    return selected.join('||');
}

async function _loadCashflow() {
    const start  = document.getElementById('cfStartDate')?.value  || '';
    const end    = document.getElementById('cfEndDate')?.value    || '';
    const period = document.getElementById('cfPeriod')?.value     || 'month';
    const planos = _getSelectedPlanos();

    const params = new URLSearchParams({ period });
    if (start)  params.append('start_date', start);
    if (end)    params.append('end_date',   end);
    if (planos) params.append('planos',     planos);

    try {
        const res = await fetch(`${API}/api/cashflow/fluxo_caixa?${params}`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        _renderKpis(data);
        _renderMainChart(data);
        _renderCatChart(data);
        _renderTable(data);
    } catch (e) {
        console.error('Cashflow error:', e);
    }
}

function _renderKpis(d) {
    const fmt = v => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:2 }).format(v);
    document.getElementById('cfKpiEntrada').textContent = fmt(d.total_entrada);
    document.getElementById('cfKpiSaida').textContent   = fmt(d.total_saida);
    const saldoEl = document.getElementById('cfKpiSaldo');
    saldoEl.textContent = fmt(d.total_saldo);
    saldoEl.style.color = d.total_saldo >= 0 ? '#10b981' : '#ef4444';
}

function _renderMainChart(d) {
    const labels   = d.data.map(r => r.periodo);
    const entradas = d.data.map(r => r.entrada);
    const saidas   = d.data.map(r => r.saida);
    const saldos   = d.data.map(r => r.saldo);

    const canvas = document.getElementById('cfMainChart');
    if (!canvas) return;

    // Destroy existing
    if (canvas._cfChart) canvas._cfChart.destroy();

    canvas._cfChart = new Chart(canvas.getContext('2d'), {
        data: {
            labels,
            datasets: [
                {
                    type: 'bar', label: 'Entradas',
                    data: entradas, backgroundColor: 'rgba(16,185,129,0.75)',
                    borderColor: '#10b981', borderWidth: 1, borderRadius: 4, order: 2
                },
                {
                    type: 'bar', label: 'Saídas',
                    data: saidas, backgroundColor: 'rgba(239,68,68,0.75)',
                    borderColor: '#ef4444', borderWidth: 1, borderRadius: 4, order: 2
                },
                {
                    type: 'line', label: 'Saldo',
                    data: saldos, borderColor: '#00aaff', backgroundColor: 'rgba(0,170,255,0.08)',
                    borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#00aaff',
                    fill: true, tension: 0.3, order: 1,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                datalabels: {
                    display: ctx => ctx.dataset.type === 'bar' && ctx.dataset.data[ctx.dataIndex] > 0,
                    anchor: 'end',
                    align: 'end',
                    offset: 2,
                    color: ctx => ctx.datasetIndex === 0 ? '#065f46' : '#991b1b',
                    font: { weight: '700', size: 9 },
                    formatter: v => {
                        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
                    }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const v = ctx.raw;
                            const fmt = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:0, maximumFractionDigits:0 });
                            return ` ${ctx.dataset.label}: ${fmt.format(v)}`;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                y: { beginAtZero: false, ticks: {
                    font: { size: 10 },
                    callback: v => 'R$ ' + new Intl.NumberFormat('pt-BR', { notation:'compact', maximumFractionDigits:1 }).format(v)
                }}
            }
        }
    });
}

let _activeCatFilter = null;

function _renderCatChart(d) {
    if (!d.categories || d.categories.length === 0) return;
    const canvas = document.getElementById('cfCatChart');
    if (!canvas) return;
    if (canvas._cfCatChart) canvas._cfCatChart.destroy();

    const colors = ['#ef4444','#f97316','#eab308','#10b981','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f43f5e','#0f2d5e','#a16207','#0891b2','#7c3aed','#be185d','#166534','#9a3412','#1d4ed8','#6d28d9','#0e7490'];
    const cats = d.categories.slice(0, 20);

    // Indicador de filtro ativo
    const header = canvas.closest('.cf-chart-card')?.querySelector('.cf-chart-header');
    let filterBadge = canvas.closest('.cf-chart-card')?.querySelector('.cf-cat-filter-badge');
    if (!filterBadge && header) {
        filterBadge = document.createElement('span');
        filterBadge.className = 'cf-cat-filter-badge';
        filterBadge.style.cssText = 'font-size:0.72rem;background:#eff6ff;color:#1d4ed8;border:1px solid #93c5fd;border-radius:5px;padding:0.2rem 0.5rem;cursor:pointer;display:none';
        filterBadge.title = 'Clique para limpar filtro';
        filterBadge.addEventListener('click', () => {
            _activeCatFilter = null;
            filterBadge.style.display = 'none';
            _loadCashflow();
        });
        header.appendChild(filterBadge);
    }

    canvas._cfCatChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: cats.map(c => c.categoria),
            datasets: [{ data: cats.map(c => c.total), backgroundColor: colors.slice(0, cats.length), borderWidth: 2 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            onClick: (evt, elements) => {
                if (!elements.length) return;
                const label = cats[elements[0].index]?.categoria;
                if (!label) return;
                _activeCatFilter = label;
                if (filterBadge) { filterBadge.textContent = `🔍 ${label} ✕`; filterBadge.style.display = 'inline'; }

                // Desmarca todos os checkboxes e marca só o clicado
                const checkboxes = document.querySelectorAll('#cfPlanosCheckboxes input[type="checkbox"]');
                if (checkboxes.length) {
                    checkboxes.forEach(cb => {
                        cb.checked = cb.value === label;
                        cb.closest('.cf-plano-item').classList.toggle('checked', cb.checked);
                    });
                    _loadCashflow();
                } else {
                    // Painel não foi carregado ainda — carrega e filtra
                    _loadPlanosAndFilter(label);
                }
            },
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 11, font: { size: 10 }, padding: 8 } },
                datalabels: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const fmt = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:0 });
                            return ` ${fmt.format(ctx.raw)}`;
                        }
                    }
                }
            }
        }
    });
}

function _renderTable(d) {
    const body = document.getElementById('cfTableBody');
    if (!body) return;
    const fmt = v => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:2 }).format(v);
    if (!d.data || d.data.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#999;padding:1rem">Sem dados para o período</td></tr>';
        return;
    }
    body.innerHTML = d.data.map(r => `
        <tr>
            <td>${r.periodo}</td>
            <td style="color:#10b981;font-weight:600">${fmt(r.entrada)}</td>
            <td style="color:#ef4444;font-weight:600">${fmt(r.saida)}</td>
            <td class="${r.saldo >= 0 ? 'td-pos' : 'td-neg'}">${fmt(r.saldo)}</td>
        </tr>
    `).join('');
}

async function _handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById('cfUploadStatus');
    statusEl.className = 'cf-upload-status';
    statusEl.textContent = '⏳ Importando...';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(`${API}/api/cashflow/upload_despesas`, { method: 'POST', body: formData });
        const data = await res.json();
        if (res.ok && data.success) {
            statusEl.className = 'cf-upload-status success';
            statusEl.textContent = '✅ ' + data.message;
            await _loadCashflow();
        } else {
            statusEl.className = 'cf-upload-status error';
            statusEl.textContent = '❌ ' + (data.error || 'Erro desconhecido');
        }
    } catch (err) {
        statusEl.className = 'cf-upload-status error';
        statusEl.textContent = '❌ Erro de conexão: ' + err.message;
    }

    setTimeout(() => { statusEl.className = 'cf-upload-status hidden'; }, 5000);
    e.target.value = '';
}
