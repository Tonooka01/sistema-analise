/**
 * static/js/dre.js  v2
 * DRE — Demonstração do Resultado do Exercício
 * Visual: date-range + Chart.js + structured DRE table with income vs expenses
 */

import * as state from './state.js';
import { formatCurrency } from './utils.js';
import { renderAuxiliar, reloadAuxiliar } from './dre_auxiliar.js';

const API = state.API_BASE_URL;

const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// DRE group order
const G_CMV  = '3. CMV / Custos Diretos';
const G_DESP = '4. Despesas Operacionais';
const G_ENC  = '5. Encargos e Tributos';
const G_FIN  = '6. Despesas Financeiras';
const G_OUT  = '7. Outros / Extraordinários';

let _chart   = null;
let _filters = { start_date: '', end_date: '', situacao: '' };
let _detPage = 1;
let _detTotal = 0;
let _activeTab = 'dre';
let _mainTab   = 'principal';
const PER_PAGE = 50;

// ============================================================
// Entry point
// ============================================================
export async function renderDreDashboard(container) {
    if (!container) return;
    container.innerHTML = _shell();
    _initDates();
    _bindEvents();
    await _loadReport();
}

// ============================================================
// Shell HTML
// ============================================================
function _shell() {
    return `
<div id="dre-root">

<style>
  #dre-root { font-family:'Inter',sans-serif; padding:0.5rem 0; }
  #dre-root .cf-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.25rem; }
  #dre-root .cf-title  { font-size:1.5rem; font-weight:800; color:#0f2d5e; margin:0; }
  #dre-root .cf-subtitle { font-size:0.8rem; color:#64748b; margin:0.2rem 0 0; }
  #dre-root .cf-header-actions { display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center; }
  #dre-root .cf-select,
  #dre-root .cf-date-input { background:#f8fafc; border:1.5px solid #dde3ec; border-radius:7px; padding:0.42rem 0.7rem; font-size:0.82rem; color:#1e293b; height:34px; }
  #dre-root .cf-btn-primary { background:#1d6dcc; color:#fff; border:none; border-radius:7px; padding:0.42rem 1.1rem; font-size:0.82rem; font-weight:600; cursor:pointer; height:34px; }
  #dre-root .cf-btn-primary:hover { background:#1558a8; }
  #dre-root .cf-btn-secondary { background:#f1f5f9; color:#0f2d5e; border:1.5px solid #dde3ec; border-radius:7px; padding:0.42rem 0.9rem; font-size:0.82rem; font-weight:600; cursor:pointer; height:34px; display:inline-flex; align-items:center; gap:0.3rem; }
  #dre-root .cf-btn-secondary:hover { background:#e2e8f0; }
  #dre-root .cf-kpi-row { display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1.25rem; }
  #dre-root .cf-kpi { flex:1 1 180px; background:#fff; border-radius:12px; padding:1.1rem 1.25rem; box-shadow:0 2px 8px rgba(15,45,94,0.08); border:1px solid #dde3ec; display:flex; flex-direction:column; gap:0.3rem; }
  #dre-root .cf-kpi-green { border-left:4px solid #10b981; }
  #dre-root .cf-kpi-red   { border-left:4px solid #ef4444; }
  #dre-root .cf-kpi-blue  { border-left:4px solid #00aaff; }
  #dre-root .cf-kpi-label { font-size:0.72rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; }
  #dre-root .cf-kpi-value { font-size:1.5rem; font-weight:800; color:#0f2d5e; }
  #dre-root .cf-chart-card { background:#fff; border-radius:12px; padding:1.25rem; box-shadow:0 2px 8px rgba(15,45,94,0.08); border:1px solid #dde3ec; margin-bottom:1.25rem; }
  #dre-root .cf-chart-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.875rem; padding-bottom:0.6rem; border-bottom:2px solid #6366f1; }
  #dre-root .cf-chart-title { font-size:0.875rem; font-weight:700; color:#0f2d5e; }
  #dre-root .cf-legend { display:flex; gap:0.75rem; font-size:0.75rem; color:#64748b; align-items:center; }
  #dre-root .cf-legend-dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:3px; }
</style>

    <!-- Abas principais: Dashboard Principal / Auxiliar ------->
    <div style="border-bottom:2px solid #dde3ec;margin-bottom:1rem;">
        <nav style="display:flex;gap:0.25rem;padding:0.25rem 0.25rem 0;">
            <button class="dre-main-tab-btn" data-main-tab="principal"
                style="padding:0.65rem 1.5rem;border:none;border-radius:6px 6px 0 0;
                       font-size:0.88rem;font-weight:700;cursor:pointer;
                       border-bottom:3px solid #6366f1;color:#4f46e5;background:#f5f3ff;
                       margin-bottom:-2px;">
                📊 Dashboard Principal
            </button>
            <button class="dre-main-tab-btn" data-main-tab="auxiliar"
                style="padding:0.65rem 1.5rem;border:none;border-radius:6px 6px 0 0;
                       font-size:0.88rem;font-weight:500;cursor:pointer;
                       border-bottom:3px solid transparent;color:#64748b;background:transparent;
                       margin-bottom:-2px;">
                🔬 Auxiliar
            </button>
        </nav>
    </div>

    <!-- Dashboard Principal (conteúdo existente) ------------->
    <div id="dreMainPrincipal">

    <!-- Header ------------------------------------------------>
    <div class="cf-header">
        <div>
            <h2 class="cf-title">📊 DRE — Demonstração do Resultado</h2>
            <p class="cf-subtitle">Receita × Despesas em regime de competência</p>
        </div>
        <div class="cf-header-actions">
            <input type="date" id="dreStartDate" class="cf-date-input">
            <input type="date" id="dreEndDate"   class="cf-date-input">
            <select id="dreSituacao" class="cf-select">
                <option value="">Todas as Situações</option>
                <option value="Confirmado">✅ Confirmado</option>
                <option value="Em aberto">🟡 Em aberto</option>
            </select>
            <button id="dreFilterBtn" class="cf-btn-primary">Filtrar</button>
            <label class="cf-btn-secondary" style="cursor:pointer;">
                📂 Atualizar DRE
                <input type="file" id="dreFileInput" accept=".xlsx,.csv,.pdf" style="display:none">
            </label>
        </div>
    </div>

    <!-- Upload status ----------------------------------------->
    <div id="dreUploadStatus" style="display:none;padding:0.45rem 1rem;border-radius:6px;
         margin-bottom:0.6rem;font-size:0.85rem;font-weight:500;"></div>

    <!-- KPI Cards --------------------------------------------->
    <div class="cf-kpi-row">
        <div class="cf-kpi cf-kpi-green">
            <span class="cf-kpi-label">Receita Bruta</span>
            <span class="cf-kpi-value" id="dreKpiReceita">—</span>
        </div>
        <div class="cf-kpi cf-kpi-red">
            <span class="cf-kpi-label">Total Despesas</span>
            <span class="cf-kpi-value" id="dreKpiDespesas">—</span>
        </div>
        <div class="cf-kpi" id="dreKpiResultCard" style="border-left:4px solid #6366f1;">
            <span class="cf-kpi-label">Resultado Líquido</span>
            <span class="cf-kpi-value" id="dreKpiResultado">—</span>
        </div>
        <div class="cf-kpi" style="border-left:4px solid #94a3b8;">
            <span class="cf-kpi-label">Margem Líquida</span>
            <span class="cf-kpi-value" id="dreKpiMargem" style="font-size:1.5rem;">—</span>
        </div>
    </div>

    <!-- Chart ------------------------------------------------->
    <div class="cf-chart-card">
        <div class="cf-chart-header">
            <span class="cf-chart-title">Receita × Despesas × Resultado</span>
            <div class="cf-legend">
                <span class="cf-legend-dot" style="background:#10b981"></span>Receita
                <span class="cf-legend-dot" style="background:#ef4444"></span>Despesas
                <span style="display:inline-block;width:18px;height:3px;background:#6366f1;
                      vertical-align:middle;margin:0 4px 0 8px;border-radius:2px;"></span>Resultado
            </div>
        </div>
        <div style="position:relative;height:300px;">
            <canvas id="dreMainChart"></canvas>
        </div>
    </div>

    <!-- Tabs -------------------------------------------------->
    <div style="border-bottom:2px solid #e2e8f0;margin:0.2rem 0 1rem;">
        <nav style="display:flex;">
            <button class="dre-tab-btn active" data-tab="dre"
                style="padding:0.6rem 1.4rem;border:none;background:none;font-size:0.88rem;
                       font-weight:600;cursor:pointer;border-bottom:3px solid #6366f1;
                       color:#4f46e5;margin-bottom:-2px;">
                Estrutura DRE
            </button>
            <button class="dre-tab-btn" data-tab="lancamentos"
                style="padding:0.6rem 1.4rem;border:none;background:none;font-size:0.88rem;
                       font-weight:400;cursor:pointer;border-bottom:3px solid transparent;
                       color:#64748b;margin-bottom:-2px;">
                Lançamentos
            </button>
        </nav>
    </div>

    <!-- Tab: Estrutura DRE ------------------------------------>
    <div id="dreTabDre">
        <div id="dreSummaryWrap" style="overflow-x:auto;"></div>
    </div>

    <!-- Tab: Lançamentos -------------------------------------->
    <div id="dreTabLancamentos" style="display:none;">
        <div style="display:flex;gap:0.5rem;margin-bottom:0.8rem;flex-wrap:wrap;align-items:center;">
            <input type="text" id="dreSearch"
                placeholder="🔍 Fornecedor, plano de contas, centro de custo…"
                class="cf-date-input" style="min-width:280px;flex:1;height:auto;">
            <select id="dreGrupoFiltro" class="cf-select">
                <option value="">Todos os Grupos</option>
                <option value="${G_CMV}">${G_CMV}</option>
                <option value="${G_DESP}">${G_DESP}</option>
                <option value="${G_ENC}">${G_ENC}</option>
                <option value="${G_FIN}">${G_FIN}</option>
                <option value="${G_OUT}">${G_OUT}</option>
            </select>
            <button id="dreSearchBtn" class="cf-btn-primary">Buscar</button>
        </div>
        <div id="dreLancWrap" style="overflow-x:auto;"></div>
        <div id="drePagination"
             style="display:flex;justify-content:center;align-items:center;gap:0.4rem;
                    margin-top:0.8rem;flex-wrap:wrap;"></div>
    </div>

    </div><!-- /dreMainPrincipal -->

    <!-- Aba Auxiliar ----------------------------------------->
    <div id="dreMainAuxiliar" style="display:none;">
        <div id="dreAuxContainer"></div>
    </div>

</div>`;
}

// ============================================================
// Init default dates (last 12 months)
// ============================================================
function _initDates() {
    const now   = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end   = new Date(now.getFullYear(), now.getMonth(), 0);

    const fmt = d => d.toISOString().slice(0, 10);

    const se = document.getElementById('dreStartDate');
    const ee = document.getElementById('dreEndDate');
    if (se) se.value = fmt(start);
    if (ee) ee.value = fmt(end);

    _filters.start_date = se?.value || '';
    _filters.end_date   = ee?.value || '';
}

// ============================================================
// Load report
// ============================================================
async function _loadReport() {
    const wrap = document.getElementById('dreSummaryWrap');
    if (wrap) wrap.innerHTML = '<p style="color:#888;padding:1rem;">Carregando…</p>';

    const qs = new URLSearchParams(_filters);
    try {
        const r = await fetch(`${API}/api/dre/dre_report?${qs}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (d.error) throw new Error(d.error);

        _renderKpis(d.kpis);
        _renderChart(d.chart);
        if (wrap) wrap.innerHTML = _buildDreTable(d);
    } catch (e) {
        if (wrap) wrap.innerHTML =
            `<p style="color:#e11d48;padding:1rem;">Erro: ${e.message}</p>`;
    }
}

// ============================================================
// KPIs
// ============================================================
function _renderKpis(kpis) {
    _setText('dreKpiReceita',  formatCurrency(kpis.receita  || 0));
    _setText('dreKpiDespesas', formatCurrency(kpis.despesas || 0));
    _setText('dreKpiResultado',formatCurrency(kpis.resultado || 0));

    const card = document.getElementById('dreKpiResultCard');
    if (card) {
        const pos = (kpis.resultado || 0) >= 0;
        card.style.borderLeft = `4px solid ${pos ? '#10b981' : '#ef4444'}`;
    }
    const resEl = document.getElementById('dreKpiResultado');
    if (resEl) resEl.style.color = (kpis.resultado || 0) >= 0 ? '#16a34a' : '#dc2626';

    const pct = kpis.receita > 0 ? (kpis.resultado / kpis.receita * 100) : 0;
    const mel = document.getElementById('dreKpiMargem');
    if (mel) {
        mel.textContent = pct.toFixed(1) + '%';
        mel.style.color = pct >= 0 ? '#16a34a' : '#dc2626';
    }
}

function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ============================================================
// Chart (bar + line, like Cashflow)
// ============================================================
function _renderChart(chartData) {
    const canvas = document.getElementById('dreMainChart');
    if (!canvas || !chartData?.length) return;

    if (_chart) { _chart.destroy(); _chart = null; }

    const labels   = chartData.map(r => {
        const [y, m] = r.periodo.split('-');
        return MONTHS_SHORT[parseInt(m) - 1] + '/' + y.slice(2);
    });
    const receitas = chartData.map(r => r.receita  || 0);
    const despesas = chartData.map(r => r.despesas || 0);
    const result   = chartData.map(r => r.resultado || 0);

    _chart = new Chart(canvas.getContext('2d'), {
        data: {
            labels,
            datasets: [
                {
                    type: 'bar', label: 'Receita',
                    data: receitas,
                    backgroundColor: 'rgba(16,185,129,0.72)',
                    borderColor: '#10b981', borderWidth: 1,
                    order: 2,
                },
                {
                    type: 'bar', label: 'Despesas',
                    data: despesas,
                    backgroundColor: 'rgba(239,68,68,0.72)',
                    borderColor: '#ef4444', borderWidth: 1,
                    order: 2,
                },
                {
                    type: 'line', label: 'Resultado',
                    data: result,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99,102,241,0.08)',
                    borderWidth: 2.5, pointRadius: 4, tension: 0.35,
                    fill: true, order: 1,
                    segment: {
                        borderColor: ctx =>
                            ctx.p1.parsed.y < 0 ? '#ef4444' : '#6366f1',
                    },
                },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ' ' + ctx.dataset.label + ': ' +
                            (ctx.parsed.y || 0).toLocaleString('pt-BR', {
                                style: 'currency', currency: 'BRL'
                            }),
                    },
                },
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: {
                        font: { size: 11 },
                        callback: v => {
                            const abs = Math.abs(v);
                            const s   = v < 0 ? '-' : '';
                            if (abs >= 1e6) return s + 'R$' + (abs / 1e6).toFixed(1) + 'M';
                            if (abs >= 1e3) return s + 'R$' + (abs / 1e3).toFixed(0) + 'k';
                            return s + 'R$' + abs;
                        },
                    },
                },
            },
        },
    });
}

// ============================================================
// DRE structured table
// ============================================================
function _buildDreTable(d) {
    const { periodos, receita_by_periodo: recByP, tree } = d;

    if (!periodos?.length) {
        return '<p style="color:#888;padding:1rem;">Sem dados no período selecionado.</p>';
    }

    // --- Column headers ---
    const colLabel = p => {
        const [y, m] = p.split('-');
        return MONTHS_SHORT[parseInt(m) - 1] + '/' + y.slice(2);
    };

    const th = `
        <th style="${_thStyle(false)}min-width:220px;position:sticky;left:0;z-index:2;">Descrição</th>
        ${periodos.map(p => `<th style="${_thStyle()}">${colLabel(p)}</th>`).join('')}
        <th style="${_thStyle()}font-weight:800;">Total</th>`;

    // --- Precompute grupo totals by period ---
    const grpByP = {}, subByP = {};
    for (const [g, subs] of Object.entries(tree || {})) {
        grpByP[g] = {};
        subByP[g] = subs;
        for (const p of periodos) {
            grpByP[g][p] = Object.values(subs).reduce((s, sv) => s + (sv[p] || 0), 0);
        }
    }

    const _gArr = g => periodos.map(p => grpByP[g]?.[p] || 0);
    const sum   = arr => arr.reduce((a, b) => a + b, 0);

    const recArr  = periodos.map(p => recByP[p] || 0);
    const cmvArr  = _gArr(G_CMV);
    const deopArr = _gArr(G_DESP);
    const encArr  = _gArr(G_ENC);
    const finArr  = _gArr(G_FIN);
    const outArr  = _gArr(G_OUT);

    const lucroArr  = recArr.map((r, i) => r - cmvArr[i]);
    const ebitdaArr = lucroArr.map((l, i) => l - deopArr[i]);
    const resultArr = ebitdaArr.map((e, i) => e - encArr[i] - finArr[i] - outArr[i]);

    // --- Row builders ---
    const _vals = arr =>
        arr.map(v => `<td style="${_tdStyle()}">${_fmtN(v)}</td>`).join('');
    const _total = arr =>
        `<td style="${_tdStyle()}font-weight:700;">${_fmtN(sum(arr))}</td>`;

    const _rowReceita = (label, arr) => `
        <tr style="background:#dcfce7;">
            <td style="${_tdStyle(false)}font-weight:800;color:#166534;
                       position:sticky;left:0;z-index:1;background:#dcfce7;">
                ${label}</td>
            ${arr.map(v => `<td style="${_tdStyle()}font-weight:700;color:#16a34a;">${_fmtN(v)}</td>`).join('')}
            <td style="${_tdStyle()}font-weight:800;color:#166534;">${_fmtN(sum(arr))}</td>
        </tr>`;

    const _rowGrupo = (label, arr, bg = '#dbeafe', col = '#1e40af') => `
        <tr style="background:${bg};">
            <td style="${_tdStyle(false)}font-weight:700;color:${col};
                       position:sticky;left:0;z-index:1;background:${bg};">
                ${label}</td>
            ${arr.map(v => `<td style="${_tdStyle()}color:${col};">${_fmtN(v)}</td>`).join('')}
            <td style="${_tdStyle()}font-weight:700;color:${col};">${_fmtN(sum(arr))}</td>
        </tr>`;

    const _rowSub = (label, arr, idx) => {
        const bg = idx % 2 === 0 ? '#f8fafc' : '#fff';
        return `<tr style="background:${bg};">
            <td style="${_tdStyle(false)}padding-left:1.8rem;color:#475569;
                       position:sticky;left:0;z-index:1;background:${bg};">
                ${label}</td>
            ${arr.map(v => `<td style="${_tdStyle()}color:#475569;">${_fmtN(v)}</td>`).join('')}
            <td style="${_tdStyle()}font-weight:600;color:#334155;">${_fmtN(sum(arr))}</td>
        </tr>`;
    };

    const _rowSubtotal = (label, arr) => {
        const grand = sum(arr);
        const col   = grand >= 0 ? '#16a34a' : '#dc2626';
        return `<tr style="background:#f0f9ff;border-top:2px solid #93c5fd;border-bottom:1px solid #bfdbfe;">
            <td style="${_tdStyle(false)}font-weight:800;color:${col};font-size:0.85rem;
                       position:sticky;left:0;z-index:1;background:#f0f9ff;">
                ${label}</td>
            ${arr.map(v => {
                const c = v >= 0 ? '#16a34a' : '#dc2626';
                return `<td style="${_tdStyle()}font-weight:700;color:${c};">${_fmtN(v)}</td>`;
            }).join('')}
            <td style="${_tdStyle()}font-weight:800;color:${col};">${_fmtN(grand)}</td>
        </tr>`;
    };

    const _rowSpacer = () =>
        `<tr><td colspan="${periodos.length + 2}"
              style="height:5px;background:#f1f5f9;border-top:1px solid #e2e8f0;"></td></tr>`;

    const _rowResult = (arr) => {
        const grand = sum(arr);
        const col   = grand >= 0 ? '#10b981' : '#ef4444';
        return `<tr style="background:#0f2d5e;border-top:3px solid #3b82f6;">
            <td style="padding:0.75rem 0.9rem;font-weight:900;font-size:0.9rem;color:${col};
                       position:sticky;left:0;z-index:1;background:#0f2d5e;letter-spacing:0.02em;">
                = RESULTADO LÍQUIDO</td>
            ${arr.map(v => {
                const c = v >= 0 ? '#10b981' : '#ef4444';
                return `<td style="${_tdStyle()}font-weight:800;font-size:0.85rem;color:${c};">${_fmtN(v)}</td>`;
            }).join('')}
            <td style="${_tdStyle()}font-weight:900;font-size:0.9rem;color:${col};">${_fmtN(grand)}</td>
        </tr>`;
    };

    // --- Assemble table ---
    let rows = '';

    // 1. Receita Bruta
    rows += _rowReceita('🟢 RECEITA BRUTA', recArr);

    // 2. CMV
    if (grpByP[G_CMV]) {
        rows += _rowSpacer();
        rows += _rowGrupo('(-) ' + G_CMV, cmvArr);
        Object.entries(subByP[G_CMV] || {}).forEach(([s, byP], i) =>
            rows += _rowSub(s, periodos.map(p => byP[p] || 0), i));
    }

    // 3. LUCRO BRUTO
    rows += _rowSubtotal('= LUCRO BRUTO', lucroArr);

    // 4. Despesas Operacionais
    if (grpByP[G_DESP]) {
        rows += _rowSpacer();
        rows += _rowGrupo('(-) ' + G_DESP, deopArr);
        Object.entries(subByP[G_DESP] || {}).forEach(([s, byP], i) =>
            rows += _rowSub(s, periodos.map(p => byP[p] || 0), i));
    }

    // 5. EBITDA
    rows += _rowSubtotal('= EBITDA (Resultado Operacional)', ebitdaArr);

    // 6. Encargos, Financeiras, Outros
    const belowGroups = [
        [G_ENC, encArr, '#fef9c3', '#92400e'],
        [G_FIN, finArr, '#fef9c3', '#92400e'],
        [G_OUT, outArr, '#fef9c3', '#92400e'],
    ];
    for (const [g, arr, bg, col] of belowGroups) {
        if (grpByP[g]) {
            rows += _rowSpacer();
            rows += _rowGrupo('(-) ' + g, arr, bg, col);
            Object.entries(subByP[g] || {}).forEach(([s, byP], i) =>
                rows += _rowSub(s, periodos.map(p => byP[p] || 0), i));
        }
    }

    // 7. RESULTADO LÍQUIDO
    rows += _rowResult(resultArr);

    return `
    <table style="width:100%;border-collapse:collapse;font-size:0.82rem;
                  min-width:700px;border:1px solid #e2e8f0;">
        <thead><tr style="background:#0f2d5e;">${th}</tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

// Shared cell style helpers
function _thStyle(right = true) {
    return `padding:0.6rem 0.65rem;text-align:${right ? 'right' : 'left'};
            white-space:nowrap;background:#0f2d5e;color:#fff;font-size:0.78rem;
            font-weight:600;position:sticky;top:0;`;
}
function _tdStyle(right = true) {
    return `text-align:${right ? 'right' : 'left'};padding:0.5rem 0.65rem;
            white-space:nowrap;`;
}
function _fmtN(v) {
    if (v === null || v === undefined) return '—';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================
// Detail / Lançamentos
// ============================================================
async function _loadDetail() {
    const wrap  = document.getElementById('dreLancWrap');
    const pgDiv = document.getElementById('drePagination');
    if (!wrap) return;
    wrap.innerHTML = '<p style="color:#888;padding:1rem;">Carregando…</p>';

    const params = new URLSearchParams({
        ..._filters,
        grupo:    document.getElementById('dreGrupoFiltro')?.value || '',
        page:     _detPage,
        per_page: PER_PAGE,
        search:   document.getElementById('dreSearch')?.value || '',
    });

    try {
        const r = await fetch(`${API}/api/dre/data?${params}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        _detTotal = d.total;

        if (!d.data.length) {
            wrap.innerHTML = '<p style="color:#888;padding:1rem;">Nenhum lançamento encontrado.</p>';
            if (pgDiv) pgDiv.innerHTML = '';
            return;
        }
        wrap.innerHTML = _buildDetailTable(d.data);
        if (pgDiv) pgDiv.innerHTML = _buildPagination(d.page, d.pages);
    } catch (e) {
        wrap.innerHTML = `<p style="color:#e11d48;padding:1rem;">Erro: ${e.message}</p>`;
    }
}

function _buildDetailTable(rows) {
    const cols = [
        { key: 'Ano_Mes',          label: 'Período'      },
        { key: 'Grupo_DRE',        label: 'Grupo DRE'    },
        { key: 'Subgrupo_DRE',     label: 'Subgrupo'     },
        { key: 'Plano_de_Contas',  label: 'Plano'        },
        { key: 'Centro_de_Custo',  label: 'Centro Custo' },
        { key: 'Fornecedor',       label: 'Fornecedor'   },
        { key: 'Situacao',         label: 'Situação'     },
        { key: 'Valor',            label: 'Valor (R$)'   },
        { key: 'Data_Competencia', label: 'Competência'  },
    ];

    const th = cols.map(c =>
        `<th style="padding:0.5rem 0.7rem;text-align:left;white-space:nowrap;
                    position:sticky;top:0;background:#0f2d5e;color:#fff;
                    font-size:0.78rem;">${c.label}</th>`
    ).join('');

    const trs = rows.map((r, i) => {
        const bg  = i % 2 === 0 ? '#fff' : '#f8fafc';
        const sit = r.Situacao === 'Confirmado'
            ? '<span style="color:#16a34a;">●</span> Confirmado'
            : '<span style="color:#d97706;">●</span> Em aberto';

        const tds = cols.map(c => {
            let val = r[c.key] ?? '—';
            if (c.key === 'Valor')    val = _fmtN(r.Valor);
            if (c.key === 'Situacao') val = sit;
            return `<td style="padding:0.45rem 0.7rem;font-size:0.8rem;white-space:nowrap;">${val}</td>`;
        }).join('');

        return `<tr style="background:${bg};">${tds}</tr>`;
    }).join('');

    return `<table style="width:100%;border-collapse:collapse;min-width:800px;">
        <thead><tr>${th}</tr></thead>
        <tbody>${trs}</tbody>
    </table>`;
}

function _buildPagination(current, pages) {
    if (pages <= 1) return '';
    const btn = (p, label, disabled, active) =>
        `<button data-page="${p}" class="dre-page-btn"
            style="padding:0.3rem 0.7rem;border:1px solid ${active ? '#0f2d5e' : '#cbd5e1'};
                   background:${active ? '#0f2d5e' : '#fff'};
                   color:${active ? '#fff' : '#334155'};
                   border-radius:4px;cursor:${disabled ? 'default' : 'pointer'};font-size:0.8rem;"
            ${disabled ? 'disabled' : ''}>${label}</button>`;

    let html = btn(1,'«', current===1, false) + btn(current-1,'‹', current===1, false);
    const st = Math.max(1, current-2), en = Math.min(pages, current+2);
    for (let p = st; p <= en; p++) html += btn(p, p, false, p === current);
    html += btn(current+1,'›', current===pages, false) + btn(pages,'»', current===pages, false);
    html += `<span style="font-size:0.8rem;color:#64748b;padding:0 0.4rem;">
                 ${current}/${pages} · ${_detTotal.toLocaleString('pt-BR')} registros
             </span>`;
    return html;
}

// ============================================================
// Events
// ============================================================
function _bindEvents() {
    document.getElementById('dreFilterBtn')?.addEventListener('click', () => {
        _filters = {
            start_date: document.getElementById('dreStartDate')?.value || '',
            end_date:   document.getElementById('dreEndDate')?.value   || '',
            situacao:   document.getElementById('dreSituacao')?.value  || '',
        };
        _detPage = 1;
        _loadReport();
        if (_activeTab === 'lancamentos') _loadDetail();
        // Recarrega aba Métricas se estiver ativa
        if (_mainTab === 'auxiliar') reloadAuxiliar(_filters);
    });

    // Delegation on #dre-root: main tabs, inner tabs, pagination, search
    document.getElementById('dre-root')?.addEventListener('click', e => {
        const mainTabBtn = e.target.closest('.dre-main-tab-btn');
        if (mainTabBtn) { _switchMainTab(mainTabBtn.dataset.mainTab); return; }

        const tabBtn = e.target.closest('.dre-tab-btn');
        if (tabBtn) { _switchTab(tabBtn.dataset.tab); return; }

        if (e.target.id === 'dreSearchBtn') { _detPage = 1; _loadDetail(); return; }

        const pgBtn = e.target.closest('.dre-page-btn');
        if (pgBtn && !pgBtn.disabled) {
            const p = parseInt(pgBtn.dataset.page);
            if (!isNaN(p) && p !== _detPage) { _detPage = p; _loadDetail(); }
        }
    });

    document.getElementById('dreSearch')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { _detPage = 1; _loadDetail(); }
    });

    document.getElementById('dreGrupoFiltro')?.addEventListener('change', () => {
        _detPage = 1; _loadDetail();
    });

    document.getElementById('dreFileInput')?.addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        await _uploadFile(file);
    });
}

function _switchTab(tab) {
    _activeTab = tab;
    document.querySelectorAll('#dre-root .dre-tab-btn').forEach(btn => {
        const a = btn.dataset.tab === tab;
        btn.style.fontWeight   = a ? '600' : '400';
        btn.style.borderBottom = a ? '3px solid #6366f1' : '3px solid transparent';
        btn.style.color        = a ? '#4f46e5' : '#64748b';
    });
    document.getElementById('dreTabDre').style.display         = tab === 'dre'         ? '' : 'none';
    document.getElementById('dreTabLancamentos').style.display = tab === 'lancamentos' ? '' : 'none';

    if (tab === 'lancamentos' && !document.querySelector('#dreLancWrap table')) {
        _loadDetail();
    }
}

// ============================================================
// Main tab switch (Dashboard Principal / Auxiliar)
// ============================================================
function _switchMainTab(tab) {
    _mainTab = tab;

    document.querySelectorAll('#dre-root .dre-main-tab-btn').forEach(btn => {
        const a = btn.dataset.mainTab === tab;
        btn.style.fontWeight   = a ? '700' : '500';
        btn.style.borderBottom = a ? '3px solid #6366f1' : '3px solid transparent';
        btn.style.color        = a ? '#4f46e5' : '#64748b';
        btn.style.background   = a ? '#f5f3ff' : 'transparent';
    });

    const principal = document.getElementById('dreMainPrincipal');
    const auxiliar  = document.getElementById('dreMainAuxiliar');
    if (principal) principal.style.display = tab === 'principal' ? '' : 'none';
    if (auxiliar)  auxiliar.style.display  = tab === 'auxiliar'  ? '' : 'none';

    if (tab === 'auxiliar') {
        const c = document.getElementById('dreAuxContainer');
        if (c) { c.innerHTML = ''; renderAuxiliar(c, _filters); }
    }
}

// ============================================================
// Upload
// ============================================================
async function _uploadFile(file) {
    const st = document.getElementById('dreUploadStatus');
    const _setStatus = (msg, bg, col) => {
        if (!st) return;
        st.style.display    = '';
        st.style.background = bg;
        st.style.color      = col;
        st.textContent      = msg;
    };

    _setStatus(`⏳ Enviando "${file.name}"…`, '#f1f5f9', '#334155');

    const fd = new FormData();
    fd.append('file', file);

    try {
        const r = await fetch(`${API}/api/dre/upload`, { method: 'POST', body: fd });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);

        _setStatus(`✅ ${d.inserted.toLocaleString('pt-BR')} registros importados com sucesso.`,
                   '#dcfce7', '#166534');
        _detPage = 1;
        await _loadReport();
        if (_activeTab === 'lancamentos') await _loadDetail();
        setTimeout(() => { if (st) st.style.display = 'none'; }, 5000);
    } catch (err) {
        _setStatus(`❌ Erro no upload: ${err.message}`, '#fef2f2', '#991b1b');
    }
}
