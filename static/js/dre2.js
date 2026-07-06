/**
 * static/js/dre2.js
 * Gestão Financeira — DRE · DFC · CAC · Lançamentos
 * Dados: Excel Gestao_Completa_v9 importado no SQLite
 */

import * as state from './state.js';
import { renderAuxiliar } from './dre_auxiliar.js';

const API = state.API_BASE_URL;

let _chart     = null;
let _chart2    = null;
let _activeTab = 'dre';
let _dateFrom  = '';
let _dateTo    = '';
let _lancPage  = 1;
let _lancTotal = 0;
let _lancFilters = { ano: '', mes: '', grupo: '', situacao: '', capex_opex: '', search: '', date_from: '', date_to: '' };
const PER_PAGE   = 50;

const _MESES = [
    ['','Todos os meses'],['01','Janeiro'],['02','Fevereiro'],['03','Março'],
    ['04','Abril'],['05','Maio'],['06','Junho'],['07','Julho'],['08','Agosto'],
    ['09','Setembro'],['10','Outubro'],['11','Novembro'],['12','Dezembro']
];
function _mesOpts(selectedVal) {
    return _MESES.map(([v,l]) => `<option value="${v}" ${v===selectedVal?'selected':''}>${l}</option>`).join('');
}

// ─── Entry point ────────────────────────────────────────────────────────────
export async function renderDre2Dashboard(container) {
    if (!container) return;
    container.innerHTML = _shell();

    const now   = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end   = new Date(now.getFullYear(), now.getMonth(), 0);
    const fmt   = d => d.toISOString().slice(0, 10);
    _dateFrom = fmt(start);
    _dateTo   = fmt(end);
    const inpFrom = document.getElementById('d2DateFrom');
    const inpTo   = document.getElementById('d2DateTo');
    if (inpFrom) inpFrom.value = _dateFrom;
    if (inpTo)   inpTo.value   = _dateTo;

    _bindEvents();
    await _loadTab('dre');
}

// ─── Shell ───────────────────────────────────────────────────────────────────
function _shell() {
    const isAdmin = window._currentUser?.is_admin;
    return `
<div id="dre2-root">
<style>
  #dre2-root { font-family:'Inter',sans-serif; padding:.5rem 0; }
  #dre2-root .d2-hdr  { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:.75rem; margin-bottom:1.1rem; }
  #dre2-root .d2-ttl  { font-size:1.4rem; font-weight:800; color:#0f2d5e; margin:0; }
  #dre2-root .d2-sub  { font-size:.72rem; color:#64748b; margin:.1rem 0 0; }
  #dre2-root .d2-sel  { background:#f8fafc; border:1.5px solid #dde3ec; border-radius:7px; padding:.36rem .65rem; font-size:.82rem; color:#1e293b; height:32px; }
  #dre2-root .d2-btn  { background:#1d6dcc; color:#fff; border:none; border-radius:7px; padding:.36rem 1rem; font-size:.82rem; font-weight:600; cursor:pointer; height:32px; white-space:nowrap; }
  #dre2-root .d2-btn:hover  { background:#1558a8; }
  #dre2-root .d2-btn-sec { background:#f1f5f9; color:#374151; border:1.5px solid #dde3ec; border-radius:7px; padding:.36rem .9rem; font-size:.8rem; font-weight:600; cursor:pointer; height:32px; }
  #dre2-root .d2-btn-sec:hover { background:#e2e8f0; }
  #dre2-root .d2-tabs { display:flex; gap:.2rem; border-bottom:2px solid #dde3ec; margin-bottom:1rem; flex-wrap:wrap; }
  #dre2-root .d2-tab  { padding:.5rem 1.2rem; border:none; background:none; font-size:.84rem; font-weight:600; color:#64748b; cursor:pointer; border-bottom:3px solid transparent; margin-bottom:-2px; border-radius:4px 4px 0 0; }
  #dre2-root .d2-tab.on { color:#4f46e5; border-bottom-color:#4f46e5; background:#f5f3ff; }
  #dre2-root .d2-tab:hover:not(.on) { background:#f1f5f9; color:#1e293b; }
  #dre2-root .d2-kpis { display:flex; gap:.85rem; flex-wrap:wrap; margin-bottom:1.1rem; }
  #dre2-root .d2-kpi  { flex:1 1 155px; background:#fff; border-radius:10px; padding:.85rem 1rem; box-shadow:0 2px 8px rgba(15,45,94,.07); border:1px solid #dde3ec; }
  #dre2-root .d2-kpi-lbl { font-size:.66rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.05em; }
  #dre2-root .d2-kpi-val { font-size:1.3rem; font-weight:800; color:#0f2d5e; margin-top:.2rem; }
  #dre2-root .d2-card { background:#fff; border-radius:12px; padding:1rem 1.1rem; box-shadow:0 2px 8px rgba(15,45,94,.07); border:1px solid #dde3ec; margin-bottom:1rem; }
  #dre2-root .d2-ctitle { font-size:.83rem; font-weight:700; color:#0f2d5e; margin-bottom:.7rem; padding-bottom:.45rem; border-bottom:2px solid #e0e7ff; }
  #dre2-root table  { width:100%; border-collapse:collapse; font-size:.77rem; }
  #dre2-root th     { background:#f8fafc; color:#374151; font-weight:700; padding:.45rem .6rem; text-align:left; border-bottom:2px solid #dde3ec; white-space:nowrap; }
  #dre2-root td     { padding:.38rem .6rem; border-bottom:1px solid #f1f5f9; color:#374151; }
  #dre2-root tr:hover td { background:#f8fafc; }
  #dre2-root .r     { text-align:right; font-variant-numeric:tabular-nums; }
  #dre2-root .pos   { color:#10b981; font-weight:700; }
  #dre2-root .neg   { color:#ef4444; font-weight:700; }
  #dre2-root .d2-filters { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; margin-bottom:.75rem; }
  #dre2-root .d2-inp { background:#f8fafc; border:1.5px solid #dde3ec; border-radius:7px; padding:.36rem .65rem; font-size:.8rem; height:32px; }
  #dre2-root .d2-pag { display:flex; gap:.5rem; align-items:center; justify-content:flex-end; margin-top:.7rem; font-size:.8rem; color:#64748b; }
  #dre2-root .d2-pag button { background:#f1f5f9; border:1.5px solid #dde3ec; border-radius:6px; padding:.26rem .7rem; font-size:.8rem; cursor:pointer; }
  #dre2-root .d2-pag button:disabled { opacity:.4; cursor:default; }
  #dre2-root .d2-load { text-align:center; color:#64748b; padding:2.5rem; font-size:.9rem; }
  #dre2-root .chip-c { background:#d1fae5; color:#065f46; border-radius:4px; padding:.08rem .38rem; font-size:.68rem; font-weight:700; }
  #dre2-root .chip-p { background:#fef3c7; color:#92400e; border-radius:4px; padding:.08rem .38rem; font-size:.68rem; font-weight:700; }
  #dre2-root .import-bar { display:flex; align-items:center; gap:.75rem; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:.55rem .85rem; margin-bottom:1rem; font-size:.8rem; color:#1e40af; }
</style>

<div class="d2-hdr">
  <div>
    <p class="d2-ttl">📊 Gestão Financeira</p>
    <p class="d2-sub">DRE · DFC · CAC · Lançamentos — Competência · 2022–2026</p>
  </div>
  <div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;">
    <span style="font-size:.8rem;color:#64748b;font-weight:600;">De</span>
    <input type="date" id="d2DateFrom" class="d2-sel" style="width:150px;">
    <span style="font-size:.8rem;color:#64748b;font-weight:600;">Até</span>
    <input type="date" id="d2DateTo"   class="d2-sel" style="width:150px;">
    <button id="d2Filtrar" class="d2-btn">Filtrar</button>
    <button id="d2LimparFiltro" class="d2-btn-sec" title="Limpar filtros">✕</button>
  </div>
</div>

${isAdmin ? `
<div class="import-bar" id="d2ImportBar">
  <span id="d2ImportStatus">Verificando dados…</span>
  <div style="display:flex;align-items:center;gap:.5rem;margin-left:auto;flex-wrap:wrap;">
    <input type="file" id="d2ImportFile" accept=".xlsx" style="font-size:.78rem;max-width:220px;">
    <button id="d2BtnImportar" class="d2-btn-sec">⬆ Importar / Reimportar</button>
  </div>
  <span id="d2ImportMsg" style="font-size:.75rem;"></span>
</div>` : ''}

<div class="d2-tabs">
  <button class="d2-tab on" data-tab="dre">📈 DRE</button>
  <button class="d2-tab" data-tab="dfc">💵 Fluxo de Caixa</button>
  <button class="d2-tab" data-tab="cac">🎯 CAC</button>
  <button class="d2-tab" data-tab="lancamentos">📋 Lançamentos</button>
  <button class="d2-tab" data-tab="metricas">📊 Métricas</button>
  <button class="d2-tab" data-tab="dre_anual">📊 DRE Estruturado</button>
  <button class="d2-tab" data-tab="dfc_anual">💹 DFC Anual</button>
  <button class="d2-tab" data-tab="capex_opex">📉 CAPEX vs OPEX</button>
</div>

<div id="d2Content"><div class="d2-load">Carregando…</div></div>
</div>`;
}

// ─── Events ──────────────────────────────────────────────────────────────────
function _bindEvents() {
    document.querySelectorAll('#dre2-root .d2-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#dre2-root .d2-tab').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            _activeTab = btn.dataset.tab;
            _loadTab(_activeTab);
        });
    });

    document.getElementById('d2Filtrar')?.addEventListener('click', () => {
        _dateFrom = document.getElementById('d2DateFrom')?.value || '';
        _dateTo   = document.getElementById('d2DateTo')?.value   || '';
        _loadTab(_activeTab);
    });

    document.getElementById('d2LimparFiltro')?.addEventListener('click', () => {
        document.getElementById('d2DateFrom').value = '';
        document.getElementById('d2DateTo').value   = '';
        _dateFrom = ''; _dateTo = '';
        _loadTab(_activeTab);
    });

    // Admin: importar
    document.getElementById('d2BtnImportar')?.addEventListener('click', async () => {
        const fileInput = document.getElementById('d2ImportFile');
        const msg = document.getElementById('d2ImportMsg');
        const btn = document.getElementById('d2BtnImportar');
        if (!fileInput?.files?.length) {
            msg.textContent = 'Selecione um arquivo .xlsx'; msg.style.color = '#ef4444'; return;
        }
        btn.disabled = true; msg.textContent = 'Importando…'; msg.style.color = '#64748b';
        try {
            const form = new FormData();
            form.append('file', fileInput.files[0]);
            const d = await fetch(`${API}/api/dre2/importar`, { method: 'POST', body: form }).then(r => r.json());
            if (d.error) { msg.textContent = `Erro: ${d.error}`; msg.style.color = '#ef4444'; }
            else {
                const c = d.counts;
                msg.textContent = `✓ DRE:${c.dre} DFC:${c.dfc} CAC:${c.cac} Lanç:${c.lancamentos}`;
                msg.style.color = '#10b981';
                document.getElementById('d2ImportStatus').textContent = `${c.dre} meses importados`;
                _activeTab = 'dre_anual';
                document.querySelectorAll('.d2-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'dre_anual'));
                _loadTab('dre_anual');
            }
        } catch (e) {
            msg.textContent = `Erro: ${e}`; msg.style.color = '#ef4444';
        } finally { btn.disabled = false; }
    });

    // Verifica status inicial (admin)
    if (window._currentUser?.is_admin) {
        fetch(`${API}/api/dre2/status`).then(r => r.json()).then(d => {
            const el = document.getElementById('d2ImportStatus');
            if (el) el.textContent = d.imported ? `${d.rows} meses importados` : '⚠ Dados não importados — clique em Importar';
        }).catch(() => {});
    }
}

// ─── Tab dispatcher ──────────────────────────────────────────────────────────
async function _loadTab(tab) {
    const root = document.getElementById('d2Content');
    if (!root) return;
    root.innerHTML = '<div class="d2-load">Carregando…</div>';
    if (_chart)  { _chart.destroy();  _chart  = null; }
    if (_chart2) { _chart2.destroy(); _chart2 = null; }

    if      (tab === 'dre')         await _renderDre(root);
    else if (tab === 'dfc')         await _renderDfc(root);
    else if (tab === 'cac')         await _renderCac(root);
    else if (tab === 'metricas')    await _renderMetricas(root);
    else if (tab === 'dre_anual')   await _renderDreAnual(root);
    else if (tab === 'dfc_anual')   await _renderDfcAnual(root);
    else if (tab === 'capex_opex')  await _renderCapexOpex(root);
    else if (tab === 'lancamentos') { _lancPage = 1; _lancFilters = { ano: '', grupo: '', situacao: '', search: '', date_from: _dateFrom, date_to: _dateTo }; await _renderLancamentos(root, true); }
}

// ─── Tab DRE ─────────────────────────────────────────────────────────────────
async function _renderDre(root) {
    try {
        const d = await fetch(`${API}/api/dre2/dre?${new URLSearchParams({date_from:_dateFrom,date_to:_dateTo})}`).then(r => r.json());
        if (d.error) { root.innerHTML = `<div class="d2-load">Erro: ${d.error}</div>`; return; }
        const k = d.kpis;

        root.innerHTML = `
<div class="d2-kpis">
  <div class="d2-kpi" style="border-left:4px solid #3b82f6;">
    <div class="d2-kpi-lbl">Receita Bruta</div>
    <div class="d2-kpi-val">${_brl(k.receita)}</div>
  </div>
  <div class="d2-kpi" style="border-left:4px solid #ef4444;">
    <div class="d2-kpi-lbl">Total Despesas</div>
    <div class="d2-kpi-val">${_brl(k.despesas)}</div>
  </div>
  <div class="d2-kpi" style="border-left:4px solid ${k.resultado >= 0 ? '#10b981' : '#ef4444'};">
    <div class="d2-kpi-lbl">Resultado</div>
    <div class="d2-kpi-val ${k.resultado >= 0 ? 'pos' : 'neg'}">${_brl(k.resultado)}</div>
  </div>
  <div class="d2-kpi" style="border-left:4px solid #8b5cf6;">
    <div class="d2-kpi-lbl">Margem Média</div>
    <div class="d2-kpi-val ${k.margem >= 0 ? 'pos' : 'neg'}">${_pct(k.margem)}</div>
  </div>
</div>
<div class="d2-card">
  <div class="d2-ctitle">Receita × Despesas × Resultado</div>
  <canvas id="d2ChartDre" height="90"></canvas>
</div>
<div class="d2-card">
  <div class="d2-ctitle">Detalhamento Mensal</div>
  <div style="overflow-x:auto;">
  <table>
    <thead><tr>
      <th>Mês</th><th class="r">Receita Bruta</th><th class="r">CMV</th>
      <th class="r">Desp. Oper.</th><th class="r">Encargos</th><th class="r">Desp. Fin.</th>
      <th class="r">Total Desp.</th><th class="r">Resultado</th><th class="r">Margem</th>
    </tr></thead>
    <tbody>${d.data.map(r => `<tr>
      <td>${r.AnoMes}</td>
      <td class="r">${_brl(r.ReceitaBruta)}</td>
      <td class="r">${_brl(r.CMV)}</td>
      <td class="r">${_brl(r.DespOp)}</td>
      <td class="r">${_brl(r.Encargos)}</td>
      <td class="r">${_brl(r.DespFin)}</td>
      <td class="r">${_brl(r.TotalDespesas)}</td>
      <td class="r ${(r.Resultado||0) >= 0 ? 'pos' : 'neg'}">${_brl(r.Resultado)}</td>
      <td class="r ${(r.Margem||0) >= 0 ? 'pos' : 'neg'}">${_pct(r.Margem)}</td>
    </tr>`).join('')}</tbody>
  </table>
  </div>
</div>`;

        _chart = new Chart(document.getElementById('d2ChartDre'), {
            type: 'bar',
            data: {
                labels: d.data.map(r => r.AnoMes),
                datasets: [
                    { label: 'Receita Bruta',  data: d.data.map(r => r.ReceitaBruta  || 0), backgroundColor: 'rgba(59,130,246,.55)', yAxisID: 'y' },
                    { label: 'Total Despesas', data: d.data.map(r => r.TotalDespesas || 0), backgroundColor: 'rgba(239,68,68,.55)',   yAxisID: 'y' },
                    { label: 'Resultado',      data: d.data.map(r => r.Resultado     || 0), type: 'line', borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.1)', tension: .3, pointRadius: 3, borderWidth: 2, yAxisID: 'y' },
                    { label: 'Margem %',       data: d.data.map(r => (r.Margem || 0) * 100), type: 'line', borderColor: '#8b5cf6', borderDash: [5,3], tension: .3, pointRadius: 0, borderWidth: 1.5, yAxisID: 'y2' },
                ]
            },
            options: _opts('Margem (%)'),
        });
    } catch (e) { root.innerHTML = `<div class="d2-load">Erro: ${e}</div>`; }
}

// ─── Tab DFC ─────────────────────────────────────────────────────────────────
async function _renderDfc(root) {
    try {
        const d = await fetch(`${API}/api/dre2/dfc?${new URLSearchParams({date_from:_dateFrom,date_to:_dateTo})}`).then(r => r.json());
        if (d.error) { root.innerHTML = `<div class="d2-load">Erro: ${d.error}</div>`; return; }
        const k = d.kpis;

        const _pctOf = (v, base) => base ? ((v||0)/base*100).toFixed(1)+'%' : '—';
        const margem_periodo = k.entradas ? k.saldo_periodo / k.entradas : 0;
        const pct_saidas     = k.entradas ? k.saidas       / k.entradas : 0;

        root.innerHTML = `
<div class="d2-kpis">
  <div class="d2-kpi" style="border-left:4px solid #10b981;">
    <div class="d2-kpi-lbl">Total Entradas</div>
    <div class="d2-kpi-val pos">${_brl(k.entradas)}</div>
  </div>
  <div class="d2-kpi" style="border-left:4px solid #ef4444;">
    <div class="d2-kpi-lbl">Total Saídas</div>
    <div class="d2-kpi-val neg">${_brl(k.saidas)}</div>
    <div style="font-size:.72rem;color:#ef4444;margin-top:.15rem;">${_pct(pct_saidas)} das entradas</div>
  </div>
  <div class="d2-kpi" style="border-left:4px solid #3b82f6;">
    <div class="d2-kpi-lbl">Saldo do Período</div>
    <div class="d2-kpi-val ${k.saldo_periodo >= 0 ? 'pos' : 'neg'}">${_brl(k.saldo_periodo)}</div>
    <div style="font-size:.72rem;color:${margem_periodo >= 0 ? '#10b981' : '#ef4444'};margin-top:.15rem;">${_pct(margem_periodo)} margem caixa</div>
  </div>
  <div class="d2-kpi" style="border-left:4px solid #8b5cf6;">
    <div class="d2-kpi-lbl">Saldo Acumulado</div>
    <div class="d2-kpi-val ${k.saldo_acumulado >= 0 ? 'pos' : 'neg'}">${_brl(k.saldo_acumulado)}</div>
  </div>
</div>
<div class="d2-card">
  <div class="d2-ctitle">Entradas × Saídas × Saldo Acumulado</div>
  <canvas id="d2ChartDfc" height="90"></canvas>
</div>
<div class="d2-card">
  <div class="d2-ctitle">Detalhamento Mensal</div>
  <div style="overflow-x:auto;">
  <table>
    <thead><tr>
      <th>Mês</th><th class="r">Entradas</th><th class="r">CMV</th><th class="r">% CMV</th>
      <th class="r">Desp. Oper.</th><th class="r">% D.Op.</th>
      <th class="r">Encargos</th><th class="r">Desp. Fin.</th>
      <th class="r">Total Saídas</th><th class="r">% Saídas</th>
      <th class="r">Saldo Período</th><th class="r">% Margem</th><th class="r">Saldo Acum.</th>
    </tr></thead>
    <tbody>${d.data.map(r => {
      const ent = r.Entradas || 0;
      return `<tr>
      <td>${r.AnoMes}</td>
      <td class="r pos">${_brl(r.Entradas)}</td>
      <td class="r">${_brl(r.CMV)}</td>
      <td class="r" style="color:#64748b;font-size:.73rem;">${_pctOf(r.CMV,ent)}</td>
      <td class="r">${_brl(r.DespOp)}</td>
      <td class="r" style="color:#64748b;font-size:.73rem;">${_pctOf(r.DespOp,ent)}</td>
      <td class="r">${_brl(r.Encargos)}</td>
      <td class="r">${_brl(r.DespFin)}</td>
      <td class="r neg">${_brl(r.TotalSaidas)}</td>
      <td class="r" style="color:#ef4444;font-size:.73rem;font-weight:700;">${_pctOf(r.TotalSaidas,ent)}</td>
      <td class="r ${(r.SaldoPeriodo||0) >= 0 ? 'pos' : 'neg'}">${_brl(r.SaldoPeriodo)}</td>
      <td class="r" style="color:${(r.SaldoPeriodo||0)>=0?'#10b981':'#ef4444'};font-size:.73rem;font-weight:700;">${_pctOf(r.SaldoPeriodo,ent)}</td>
      <td class="r ${(r.SaldoAcumulado||0) >= 0 ? 'pos' : 'neg'}">${_brl(r.SaldoAcumulado)}</td>
    </tr>`;}).join('')}</tbody>
  </table>
  </div>
</div>
${d.data.some(r => (r.Pessoal||0) + (r.Marketing_DFC||0) > 0) ? `
<div class="d2-card">
  <div class="d2-ctitle">Composição das Saídas por Sub-categoria</div>
  <canvas id="d2ChartDfcSub" height="110"></canvas>
</div>` : ''}`;

        _chart = new Chart(document.getElementById('d2ChartDfc'), {
            type: 'bar',
            data: {
                labels: d.data.map(r => r.AnoMes),
                datasets: [
                    { label: 'Entradas',        data: d.data.map(r => r.Entradas    || 0), backgroundColor: 'rgba(16,185,129,.55)', yAxisID: 'y' },
                    { label: 'Total Saídas',    data: d.data.map(r => r.TotalSaidas || 0), backgroundColor: 'rgba(239,68,68,.55)',   yAxisID: 'y' },
                    { label: 'Saldo Acumulado', data: d.data.map(r => r.SaldoAcumulado || 0), type: 'line', borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,.1)', tension: .3, pointRadius: 3, borderWidth: 2, yAxisID: 'y' },
                ]
            },
            options: _opts(null),
        });

        if (d.data.some(r => (r.Pessoal||0) + (r.Marketing_DFC||0) > 0)) {
            _chart2 = new Chart(document.getElementById('d2ChartDfcSub'), {
                type: 'bar',
                data: {
                    labels: d.data.map(r => r.AnoMes),
                    datasets: [
                        { label: 'CMV',              data: d.data.map(r => r.CMV           ||0), backgroundColor: '#ef4444', stack: 's' },
                        { label: 'Pessoal',          data: d.data.map(r => r.Pessoal        ||0), backgroundColor: '#3b82f6', stack: 's' },
                        { label: 'Enc. Trabalhistas',data: d.data.map(r => r.EncargosTrabalh||0), backgroundColor: '#6366f1', stack: 's' },
                        { label: 'Marketing',        data: d.data.map(r => r.Marketing_DFC  ||0), backgroundColor: '#8b5cf6', stack: 's' },
                        { label: 'Infraestrutura',   data: d.data.map(r => r.Infraestrutura  ||0), backgroundColor: '#f97316', stack: 's' },
                        { label: 'Tecnologia',       data: d.data.map(r => r.Tecnologia     ||0), backgroundColor: '#06b6d4', stack: 's' },
                        { label: 'Frota',            data: d.data.map(r => r.Frota          ||0), backgroundColor: '#10b981', stack: 's' },
                        { label: 'Desp. Admin.',     data: d.data.map(r => r.DespAdmin      ||0), backgroundColor: '#f59e0b', stack: 's' },
                        { label: 'Atendimento',      data: d.data.map(r => r.Atendimento    ||0), backgroundColor: '#84cc16', stack: 's' },
                        { label: 'Impostos/IRPJ',    data: d.data.map(r => (r.Impostos||0)+(r.IRPJCSLL||0)), backgroundColor: '#64748b', stack: 's' },
                        { label: 'Desp. Financeiras',data: d.data.map(r => r.DespFin        ||0), backgroundColor: '#ec4899', stack: 's' },
                        { label: 'Outros',           data: d.data.map(r => r.Outros         ||0), backgroundColor: '#a78bfa', stack: 's' },
                    ]
                },
                options: { ...(_opts(null)), scales: { ...(_opts(null).scales), x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } }, y: { stacked: true, ticks: { font: { size: 10 }, callback: v => v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}k`:v }, grid: { color: 'rgba(0,0,0,.05)' } } } },
            });
        }
    } catch (e) { root.innerHTML = `<div class="d2-load">Erro: ${e}</div>`; }
}

// ─── Tab CAC ─────────────────────────────────────────────────────────────────
async function _renderCac(root) {
    try {
        const d = await fetch(`${API}/api/dre2/cac?${new URLSearchParams({date_from:_dateFrom,date_to:_dateTo})}`).then(r => r.json());
        if (d.error) { root.innerHTML = `<div class="d2-load">Erro: ${d.error}</div>`; return; }
        const k = d.kpis;

        root.innerHTML = `
<div class="d2-kpis">
  <div class="d2-kpi" style="border-left:4px solid #f97316;">
    <div class="d2-kpi-lbl">Total CAC</div>
    <div class="d2-kpi-val">${_brl(k.cac_total)}</div>
  </div>
  <div class="d2-kpi" style="border-left:4px solid #10b981;">
    <div class="d2-kpi-lbl">Instalações</div>
    <div class="d2-kpi-val">${(k.instalacoes||0).toLocaleString('pt-BR')}</div>
  </div>
  <div class="d2-kpi" style="border-left:4px solid #3b82f6;">
    <div class="d2-kpi-lbl">CAC Médio / Cliente</div>
    <div class="d2-kpi-val">${_brl(k.cac_medio)}</div>
  </div>
</div>
<div class="d2-card">
  <div class="d2-ctitle">CAC por Categoria + CAC/Cliente</div>
  <canvas id="d2ChartCac" height="100"></canvas>
</div>
<div class="d2-card">
  <div class="d2-ctitle">Detalhamento Mensal</div>
  <div style="overflow-x:auto;">
  <table>
    <thead><tr>
      <th>Mês</th><th class="r">Comission.</th><th class="r">Marketing</th>
      <th class="r">Mat. Campo</th><th class="r">ONTs / Equip.</th>
      <th class="r">Total CAC</th><th class="r">Instalações</th><th class="r">CAC/Cliente</th>
    </tr></thead>
    <tbody>${d.data.map(r => `<tr>
      <td>${r.AnoMes}</td>
      <td class="r">${_brl(r.Comissionamento)}</td>
      <td class="r">${_brl(r.Marketing)}</td>
      <td class="r">${_brl(r.MaterialCampo)}</td>
      <td class="r">${_brl(r.ONTs)}</td>
      <td class="r"><strong>${_brl(r.TotalCAC)}</strong></td>
      <td class="r">${(r.NInstalacoes||0).toLocaleString('pt-BR')}</td>
      <td class="r">${_brl(r.CACUnitario)}</td>
    </tr>`).join('')}</tbody>
  </table>
  </div>
</div>`;

        _chart = new Chart(document.getElementById('d2ChartCac'), {
            type: 'bar',
            data: {
                labels: d.data.map(r => r.AnoMes),
                datasets: [
                    { label: 'Comissionamento', data: d.data.map(r => r.Comissionamento||0), backgroundColor: '#3b82f6', stack: 'cac', yAxisID: 'y' },
                    { label: 'Marketing',       data: d.data.map(r => r.Marketing      ||0), backgroundColor: '#8b5cf6', stack: 'cac', yAxisID: 'y' },
                    { label: 'Material Campo',  data: d.data.map(r => r.MaterialCampo  ||0), backgroundColor: '#f97316', stack: 'cac', yAxisID: 'y' },
                    { label: 'ONTs / Equip.',   data: d.data.map(r => r.ONTs           ||0), backgroundColor: '#06b6d4', stack: 'cac', yAxisID: 'y' },
                    { label: 'CAC/Cliente (R$)',data: d.data.map(r => r.CACUnitario    ||0), type: 'line', borderColor: '#ef4444', backgroundColor: 'transparent', tension: .3, pointRadius: 3, borderWidth: 2, yAxisID: 'y2' },
                ]
            },
            options: _opts('CAC/Cliente (R$)'),
        });
    } catch (e) { root.innerHTML = `<div class="d2-load">Erro: ${e}</div>`; }
}

// ─── Tab Lançamentos ─────────────────────────────────────────────────────────
async function _renderLancamentos(root, init = false) {
    if (init) {
        root.innerHTML = `
<div class="d2-card">
  <div class="d2-ctitle">Filtros</div>
  <div class="d2-filters">
    <select id="d2LFAno"   class="d2-sel" style="min-width:85px;"><option value="">Ano</option></select>
    <select id="d2LFMes"   class="d2-sel" style="min-width:130px;">${_mesOpts('')}</select>
    <select id="d2LFGrupo" class="d2-sel" style="min-width:195px;"><option value="">Grupo DRE</option></select>
    <select id="d2LFSit"   class="d2-sel"><option value="">Situação</option></select>
    <select id="d2LFCapex" class="d2-sel"><option value="">CAPEX / OPEX</option></select>
  </div>
  <div class="d2-filters" style="margin-top:.4rem;">
    <span style="font-size:.75rem;color:#64748b;white-space:nowrap;">Data competência:</span>
    <input type="date" id="d2LFDateDe"  class="d2-inp" title="Data inicial">
    <span style="color:#94a3b8;font-size:.75rem;">até</span>
    <input type="date" id="d2LFDateAte" class="d2-inp" title="Data final">
    <input id="d2LFSrch" class="d2-inp" placeholder="Fornecedor / Plano de Contas…" style="flex:1;min-width:155px;">
    <button id="d2LFBuscar" class="d2-btn">Buscar</button>
    <button id="d2LFLimpar" class="d2-btn-sec">✕ Limpar</button>
  </div>
</div>
<div id="d2LancTable"><div class="d2-load">Carregando…</div></div>`;

        try {
            const d = await fetch(`${API}/api/dre2/lancamentos?page=1`).then(r => r.json());
            const f = d.filters || {};
            const sa = document.getElementById('d2LFAno');
            const sg = document.getElementById('d2LFGrupo');
            const ss = document.getElementById('d2LFSit');
            const sc = document.getElementById('d2LFCapex');
            (f.anos      || []).forEach(a => { const o = document.createElement('option'); o.value=a; o.textContent=a; sa.appendChild(o); });
            (f.grupos    || []).forEach(g => { const o = document.createElement('option'); o.value=g; o.textContent=g; sg.appendChild(o); });
            (f.situacoes || []).forEach(s => { const o = document.createElement('option'); o.value=s; o.textContent=s; ss.appendChild(o); });
            (f.capex_opts|| []).forEach(c => { const o = document.createElement('option'); o.value=c; o.textContent=c; sc.appendChild(o); });
            // pre-populate date filters if set
            if (_dateFrom) { const df = document.getElementById('d2LFDateDe'); if(df) df.value = _dateFrom; }
            if (_dateTo)   { const dt = document.getElementById('d2LFDateAte'); if(dt) dt.value = _dateTo; }
        } catch {}

        document.getElementById('d2LFBuscar')?.addEventListener('click', () => {
            _lancFilters.ano       = document.getElementById('d2LFAno')?.value     || '';
            _lancFilters.mes       = document.getElementById('d2LFMes')?.value     || '';
            _lancFilters.grupo     = document.getElementById('d2LFGrupo')?.value   || '';
            _lancFilters.situacao  = document.getElementById('d2LFSit')?.value     || '';
            _lancFilters.capex_opex= document.getElementById('d2LFCapex')?.value   || '';
            _lancFilters.search    = document.getElementById('d2LFSrch')?.value    || '';
            _lancFilters.date_from = document.getElementById('d2LFDateDe')?.value  || '';
            _lancFilters.date_to   = document.getElementById('d2LFDateAte')?.value || '';
            _lancPage = 1;
            _renderLancTable();
        });

        document.getElementById('d2LFLimpar')?.addEventListener('click', () => {
            ['d2LFAno','d2LFMes','d2LFGrupo','d2LFSit','d2LFCapex','d2LFSrch','d2LFDateDe','d2LFDateAte']
                .forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
            _lancFilters = { ano:'', mes:'', grupo:'', situacao:'', capex_opex:'', search:'', date_from:'', date_to:'' };
            _lancPage = 1;
            _renderLancTable();
        });
    }
    await _renderLancTable();
}

async function _renderLancTable() {
    const tr = document.getElementById('d2LancTable');
    if (!tr) return;
    tr.innerHTML = '<div class="d2-load">Carregando…</div>';
    try {
        const p = new URLSearchParams({ page: _lancPage, ano: _lancFilters.ano, mes: _lancFilters.mes||'', grupo: _lancFilters.grupo, situacao: _lancFilters.situacao, capex_opex: _lancFilters.capex_opex||'', search: _lancFilters.search, date_from: _lancFilters.date_from||'', date_to: _lancFilters.date_to||'' });
        const d = await fetch(`${API}/api/dre2/lancamentos?${p}`).then(r => r.json());
        _lancTotal = d.total || 0;
        const pages = Math.ceil(_lancTotal / PER_PAGE) || 1;

        tr.innerHTML = `
<div class="d2-card">
  <div class="d2-ctitle">Lançamentos <span style="font-weight:400;font-size:.73rem;color:#64748b;">${_lancTotal.toLocaleString('pt-BR')} registros</span></div>
  <div style="overflow-x:auto;">
  <table>
    <thead><tr>
      <th>Mês</th><th>Grupo DRE</th><th>Subgrupo</th><th>Fornecedor</th>
      <th>Centro Custo</th><th>Data Comp.</th><th>Situação</th><th>CAPEX/OPEX</th><th class="r">Valor</th>
    </tr></thead>
    <tbody>${d.data.map(r => `<tr>
      <td>${r.AnoMes||''}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.GrupoDRE||''}">${r.GrupoDRE||''}</td>
      <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.SubgrupoDRE||''}">${r.SubgrupoDRE||''}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.Fornecedor||''}">${r.Fornecedor||''}</td>
      <td style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.CentroCusto||''}</td>
      <td>${r.DataCompetencia||''}</td>
      <td>${r.Situacao === 'Confirmado' ? '<span class="chip-c">Confirmado</span>' : '<span class="chip-p">Em aberto</span>'}</td>
      <td style="font-size:.72rem;font-weight:600;color:${r.CapexOpex==='CAPEX'?'#f97316':'#6366f1'}">${r.CapexOpex||'—'}</td>
      <td class="r"><strong>${_brl(r.Valor)}</strong></td>
    </tr>`).join('')}</tbody>
  </table>
  </div>
  <div class="d2-pag">
    <button id="d2LancPrev" ${_lancPage <= 1 ? 'disabled' : ''}>← Anterior</button>
    <span>Pág. ${_lancPage} / ${pages}</span>
    <button id="d2LancNext" ${_lancPage >= pages ? 'disabled' : ''}>Próxima →</button>
  </div>
</div>`;

        document.getElementById('d2LancPrev')?.addEventListener('click', () => { _lancPage--; _renderLancTable(); });
        document.getElementById('d2LancNext')?.addEventListener('click', () => { _lancPage++; _renderLancTable(); });
    } catch (e) { tr.innerHTML = `<div class="d2-load">Erro: ${e}</div>`; }
}

// ─── Tab Métricas — reutiliza renderAuxiliar com período do filtro ─────────────
async function _renderMetricas(root) {
    await renderAuxiliar(root, { start_date: _dateFrom, end_date: _dateTo });
}

// ─── DRE Estruturado Anual ───────────────────────────────────────────────────
async function _renderDreAnual(root) {
    try {
        const d = await fetch(`${API}/api/dre2/dre_anual`).then(r => r.json());
        if (d.error) { root.innerHTML = `<div class="d2-load">Erro: ${d.error}</div>`; return; }
        const anos = d.anos || [];
        if (!anos.length) { root.innerHTML = '<div class="d2-load">Sem dados importados.</div>'; return; }

        const R = v => v == null ? '—' : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
        const P = v => v == null ? '' : `${v.toFixed(1)}%`;

        // Totals
        const T = k => anos.reduce((s,a) => s + (a[k] || 0), 0);
        const rb_tot = T('receita_bruta');
        const pT = v => rb_tot ? `${(v/rb_tot*100).toFixed(1)}%` : '';

        const yCols = anos.map(a => `<th class="r">${a.ano}<br><span style="font-size:.66rem;font-weight:400;color:#94a3b8;">(Jan–Dez)</span></th>`).join('');
        const yVals = (k, cls='') => anos.map(a => `<td class="r ${cls}">${R(a[k])}</td>`).join('');
        const yPct  = (pk) => anos.map(a => `<td class="r" style="color:#64748b;font-size:.72rem;">${P(a[pk])}</td>`).join('');
        const yNeg  = (k) => anos.map(a => `<td class="r neg">${a[k] ? R(a[k]) : '—'}</td>`).join('');
        const ySig  = (k) => anos.map(a => { const v=a[k]||0; return `<td class="r ${v>=0?'pos':'neg'}">${R(v)}</td>`; }).join('');

        const HDR = (label, bg='#1e3a5f', fg='#fff', bold=true) =>
            `<tr style="background:${bg};"><td colspan="${anos.length+2}" style="color:${fg};font-weight:${bold?700:600};padding:.5rem .7rem;font-size:.8rem;">${label}</td></tr>`;
        const ROW = (label, vals, tot, indent=false) =>
            `<tr><td style="${indent?'padding-left:1.6rem;':''}">${label}</td>${vals}<td class="r" style="font-weight:700;">${R(tot)}</td></tr>`;
        // yPctOf gera células de % para cada ano (sub-linha abaixo do TOTROW)
        const yPctOf = k => anos.map(a => `<td class="r" style="color:rgba(255,255,255,.6);font-size:.7rem;padding-bottom:.3rem;">${P(a[k])}</td>`).join('');
        // TOTROW: linha de valor + sub-linha com % da Receita Bruta abaixo
        const TOTROW = (label, vals, pctCells, tot, totPct, bg='#0f2d5e', fg='#fff') =>
            `<tr style="background:${bg};font-weight:800;color:${fg};">
               <td style="padding:.5rem .7rem .2rem;">${label}</td>${vals}
               <td class="r" style="padding-bottom:.2rem;">${R(tot)}</td>
             </tr>
             <tr style="background:${bg};">
               <td style="padding:.0rem .7rem .4rem 1.3rem;color:rgba(255,255,255,.55);font-size:.68rem;font-style:italic;">% da Receita Bruta</td>${pctCells}
               <td class="r" style="color:rgba(255,255,255,.6);font-size:.7rem;padding-bottom:.4rem;">${totPct}</td>
             </tr>`;

        root.innerHTML = `
<div class="d2-card" style="overflow-x:auto;">
  <div class="d2-ctitle">📊 DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE) | Estruturado por Ano <span style="font-size:.72rem;font-weight:400;color:#94a3b8;">— Regime de Competência · Fonte: Excel importado</span></div>
  <table>
    <thead>
      <tr style="background:#0f2d5e;">
        <th style="color:#fff;min-width:240px;">DESCRIÇÃO</th>
        ${yCols}
        <th class="r" style="color:#fff;background:#1e3a5f;">TOTAL</th>
      </tr>
    </thead>
    <tbody>
      ${HDR('➤ RECEITA BRUTA', '#166534', '#dcfce7')}
      ${ROW('&nbsp;', yVals('receita_bruta','pos'), T('receita_bruta'))}
      ${HDR('DEDUÇÕES DA RECEITA', '#374151', '#f9fafb')}
      ${ROW('&nbsp;&nbsp;– Impostos sobre Vendas (ISS/DAS)', yNeg('impostos_vendas'), T('impostos_vendas'), true)}
      ${TOTROW('➤ RECEITA LÍQUIDA', yVals('receita_liq'), yPctOf('pct_rl'), T('receita_liq'), pT(T('receita_liq')), '#1e40af', '#ffffff')}
      ${HDR('CUSTOS DIRETOS (CMV)', '#374151', '#f9fafb')}
      ${ROW('&nbsp;&nbsp;– Compras / Materiais / Equipamentos / Comissões', yNeg('cmv'), T('cmv'), true)}
      ${TOTROW('➤ LUCRO BRUTO', yVals('lucro_bruto'), yPctOf('pct_lb'), T('lucro_bruto'), pT(T('lucro_bruto')), '#0369a1', '#e0f2fe')}
      ${HDR('DESPESAS OPERACIONAIS (OPEX)', '#374151', '#f9fafb')}
      ${ROW('&nbsp;&nbsp;– Pessoal + Pró-labore (Salários, Remunerações)', yNeg('pessoal'), T('pessoal'), true)}
      ${ROW('&nbsp;&nbsp;– Encargos Trabalhistas', yNeg('enc_trabalh'), T('enc_trabalh'), true)}
      ${ROW('&nbsp;&nbsp;– Marketing e Publicidade', yNeg('marketing'), T('marketing'), true)}
      ${ROW('&nbsp;&nbsp;– Infraestrutura (Aluguel/Postes/Energia)', yNeg('infraestrutura'), T('infraestrutura'), true)}
      ${ROW('&nbsp;&nbsp;– Tecnologia e Conectividade (TI)', yNeg('tecnologia'), T('tecnologia'), true)}
      ${ROW('&nbsp;&nbsp;– Frota e Combustível', yNeg('frota'), T('frota'), true)}
      ${ROW('&nbsp;&nbsp;– Atendimento ao Cliente (Call Center)', yNeg('atendimento'), T('atendimento'), true)}
      ${ROW('&nbsp;&nbsp;– Demais Despesas Administrativas', yNeg('desp_admin'), T('desp_admin'), true)}
      ${TOTROW('➤ EBITDA (LAJIDA)', anos.map(a=>{const v=a.ebitda||0;return`<td class="r ${v>=0?'':'neg'}" style="color:${v>=0?'#dcfce7':'#fecaca'};">${R(v)}</td>`;}).join(''), yPctOf('pct_ebitda'), T('ebitda'), pT(T('ebitda')), '#1e3a5f', '#e0e7ff')}
      ${HDR('DEPRECIAÇÃO E AMORTIZAÇÃO', '#374151', '#f9fafb')}
      ${ROW('&nbsp;&nbsp;– Depreciação de Ativos (não disponível)', anos.map(()=>'<td class="r" style="color:#94a3b8;font-style:italic;">—</td>').join(''), null, true)}
      ${TOTROW('➤ EBIT (LAJIR)', anos.map(a=>{const v=a.ebitda||0;return`<td class="r" style="color:${v>=0?'#dcfce7':'#fecaca'};">${R(v)}</td>`;}).join(''), yPctOf('pct_ebitda'), T('ebitda'), pT(T('ebitda')), '#1e3a5f', '#e0e7ff')}
      ${HDR('RESULTADO FINANCEIRO', '#374151', '#f9fafb')}
      ${ROW('&nbsp;&nbsp;– Despesas Financeiras (Dívidas/Tarifas)', yNeg('desp_fin'), T('desp_fin'), true)}
      ${ROW('&nbsp;&nbsp;– Outros / Extraordinários', yNeg('outros'), T('outros'), true)}
      ${TOTROW('➤ LUCRO ANTES DO IR (LAIR)', anos.map(a=>{const v=a.resultado||0;return`<td class="r ${v>=0?'':'neg'}" style="color:${v>=0?'#dcfce7':'#fecaca'};">${R(v)}</td>`;}).join(''), yPctOf('pct_res'), T('resultado'), pT(T('resultado')), '#92400e', '#fef3c7')}
      ${HDR('IMPOSTO DE RENDA E CONTRIBUIÇÃO SOCIAL', '#374151', '#f9fafb')}
      ${ROW('&nbsp;&nbsp;– IRPJ / CSLL', anos.map(a=>`<td class="r">${a.irpj_csll ? R(a.irpj_csll) : '—'}</td>`).join(''), T('irpj_csll') || null, true)}
      ${TOTROW('➤ LUCRO LÍQUIDO', anos.map(a=>{const v=a.lucro_liq||0;return`<td class="r" style="color:${v>=0?'#dcfce7':'#fecaca'};">${R(v)}</td>`;}).join(''), yPctOf('pct_ll'), T('lucro_liq'), pT(T('lucro_liq')), '#166534', '#dcfce7')}
    </tbody>
  </table>
  <p style="font-size:.68rem;color:#94a3b8;margin-top:.6rem;">Fonte: aba 📋 DRE Estruturado do Excel importado. Regime de competência.</p>
</div>`;
    } catch(e) { root.innerHTML = `<div class="d2-load">Erro: ${e}</div>`; }
}

// ─── DFC Anual ───────────────────────────────────────────────────────────────
async function _renderDfcAnual(root) {
    try {
        const d = await fetch(`${API}/api/dre2/dfc_anual`).then(r => r.json());
        if (d.error) { root.innerHTML = `<div class="d2-load">Erro: ${d.error}</div>`; return; }
        const anos = d.anos || [];
        if (!anos.length) { root.innerHTML = '<div class="d2-load">Sem dados importados.</div>'; return; }

        const R = v => v == null ? '—' : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
        const T = k => anos.reduce((s,a) => s + (a[k] || 0), 0);

        const yCols = anos.map(a => `<th class="r">${a.Ano}</th>`).join('');
        const yR    = k => anos.map(a => `<td class="r">${R(a[k] || 0)}</td>`).join('');
        const yNeg  = k => anos.map(a => `<td class="r neg">${R(a[k] || 0)}</td>`).join('');
        const yPos  = k => anos.map(a => `<td class="r pos">${R(a[k] || 0)}</td>`).join('');
        const ySig  = k => anos.map(a => { const v=a[k]||0; return `<td class="r ${v>=0?'pos':'neg'}">${R(v)}</td>`; }).join('');

        const HDR = (label, bg='#1e3a5f', fg='#fff') =>
            `<tr style="background:${bg};"><td colspan="${anos.length+2}" style="color:${fg};font-weight:700;padding:.5rem .7rem;font-size:.8rem;">${label}</td></tr>`;
        const ROW = (num, label, vals, tot) =>
            `<tr><td><span style="color:#64748b;font-size:.72rem;margin-right:.4rem;">${num}</span>${label}</td>${vals}<td class="r" style="font-weight:700;">${R(tot)}</td></tr>`;
        const TOTROW = (label, vals, tot, bg, fg='#fff') =>
            `<tr style="background:${bg};font-weight:800;"><td style="color:${fg};padding:.5rem .7rem;">${label}</td>${vals}<td class="r" style="color:${fg};">${R(tot)}</td></tr>`;

        root.innerHTML = `
<div class="d2-card" style="overflow-x:auto;">
  <div class="d2-ctitle">💹 FLUXO DE CAIXA ANUAL | Regime de Caixa <span style="font-size:.72rem;font-weight:400;color:#94a3b8;">— Fonte: Excel importado · Entradas: Data Pagamento | Saídas: Data Confirmação</span></div>
  <table>
    <thead>
      <tr style="background:#0f2d5e;">
        <th style="color:#fff;min-width:260px;">DESCRIÇÃO</th>
        ${yCols}
        <th class="r" style="color:#fff;background:#1e3a5f;">TOTAL</th>
      </tr>
    </thead>
    <tbody>
      ${HDR('⬆ ENTRADAS', '#166534', '#dcfce7')}
      <tr><td style="padding-left:1rem;font-weight:700;color:#10b981;">Entradas de Caixa</td>${yPos('entradas')}<td class="r pos" style="font-weight:800;">${R(T('entradas'))}</td></tr>
      ${HDR('⬇ SAÍDAS POR CATEGORIA', '#1e3a5f', '#e0e7ff')}
      ${ROW('1.',  'Custos Diretos (CMV)',             yNeg('cmv'),           T('cmv'))}
      ${ROW('2.',  'Pessoal',                          yNeg('pessoal'),       T('pessoal'))}
      ${ROW('3.',  'Encargos Trabalhistas',             yNeg('enc_trabalh'),   T('enc_trabalh'))}
      ${ROW('4.',  'Marketing e Publicidade',           yNeg('marketing'),     T('marketing'))}
      ${ROW('5.',  'Infraestrutura',                    yNeg('infraestrutura'),T('infraestrutura'))}
      ${ROW('6.',  'Tecnologia e Conectividade',        yNeg('tecnologia'),    T('tecnologia'))}
      ${ROW('7.',  'Frota e Combustível',               yNeg('frota'),         T('frota'))}
      ${ROW('8.',  'Despesas Administrativas',          yNeg('desp_admin'),    T('desp_admin'))}
      ${ROW('9.',  'Atendimento ao Cliente',            yNeg('atendimento'),   T('atendimento'))}
      ${ROW('10.', 'Impostos e Taxas',                  yNeg('impostos'),      T('impostos'))}
      ${ROW('11.', 'IRPJ / CSLL',                      yNeg('irpj_csll'),     T('irpj_csll'))}
      ${ROW('12.', 'Despesas Financeiras',              yNeg('desp_fin'),      T('desp_fin'))}
      ${ROW('13.', 'Outros / Extraordinários',          yNeg('outros'),        T('outros'))}
      ${TOTROW('TOTAL SAÍDAS', anos.map(a=>`<td class="r neg" style="color:#fecaca;">${R(a.total_saidas||0)}</td>`).join(''), T('total_saidas'), '#7f1d1d', '#fecaca')}
      ${HDR('RESULTADO', '#374151', '#f9fafb')}
      <tr><td style="padding-left:1rem;">Saldo do Período</td>${ySig('saldo_periodo')}<td class="r ${T('saldo_periodo')>=0?'pos':'neg'}" style="font-weight:700;">${R(T('saldo_periodo'))}</td></tr>
      <tr style="background:#fffbeb;font-weight:800;">
        <td style="color:#92400e;padding:.5rem .7rem;">SALDO ACUMULADO (fim do ano)</td>
        ${anos.map(a=>`<td class="r" style="color:#92400e;">${R(a.saldo_acumulado||0)}</td>`).join('')}
        <td class="r" style="color:#92400e;">${R(anos[anos.length-1]?.saldo_acumulado||0)}</td>
      </tr>
    </tbody>
  </table>
</div>`;
    } catch(e) { root.innerHTML = `<div class="d2-load">Erro: ${e}</div>`; }
}

// ─── CAPEX vs OPEX Anual ─────────────────────────────────────────────────────
async function _renderCapexOpex(root) {
    try {
        const d = await fetch(`${API}/api/dre2/capex_opex`).then(r => r.json());
        if (d.error) { root.innerHTML = `<div class="d2-load">Erro: ${d.error}</div>`; return; }
        const { anos, capex, opex, total_capex, total_opex, rb_lancamentos, rb_dre } = d;
        if (!anos || !anos.length) { root.innerHTML = '<div class="d2-load">Sem dados importados.</div>'; return; }

        const R  = v => (v == null || v === 0) ? '—' : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
        const Rv = v => v == null ? '—' : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2}).format(v);

        const nCols = anos.length + 2; // descrição + anos + total + %receita = anos+3, mas colspan usa anos+3

        const yCols = anos.map(a => `<th class="r" style="color:#fff;">${a}<br><span style="font-size:.64rem;font-weight:400;color:#94a3b8;">(Jan–Dez)</span></th>`).join('');

        const HDR = (label, bg, fg='#fff') =>
            `<tr style="background:${bg};"><td colspan="${anos.length+3}" style="color:${fg};font-weight:700;padding:.55rem .8rem;font-size:.84rem;">${label}</td></tr>`;

        const CAT_ROW = (item, fg='#1e293b') =>
            `<tr>
               <td style="padding-left:1.3rem;color:${fg};">${item.cat}</td>
               ${anos.map(a => `<td class="r" style="color:${fg};">${R(item.vals[a])}</td>`).join('')}
               <td class="r" style="font-weight:700;color:${fg};">${Rv(item.total)}</td>
               <td class="r" style="color:#64748b;font-size:.72rem;">${item.pct.toFixed(1)}%</td>
             </tr>`;

        const TOT_ROW = (label, tdata, bg, fg='#fff') =>
            `<tr style="background:${bg};font-weight:800;">
               <td style="color:${fg};padding:.5rem .8rem;">${label}</td>
               ${anos.map(a => `<td class="r" style="color:${fg};">${Rv(tdata.vals[a])}</td>`).join('')}
               <td class="r" style="color:${fg};">${Rv(tdata.total)}</td>
               <td class="r" style="color:${fg};font-size:.72rem;">${tdata.pct.toFixed(1)}%</td>
             </tr>`;

        root.innerHTML = `
<div class="d2-card" style="overflow-x:auto;">
  <div class="d2-ctitle" style="font-size:1rem;">RESUMO CAPEX vs OPEX | <span style="font-size:.72rem;font-weight:400;">Jan/2022 – Mai/2026</span></div>
  <div style="font-size:.7rem;color:#94a3b8;margin-bottom:.8rem;">📌 CAPEX = investimento em ativos (não entra no DRE) | OPEX = despesa operacional (entra no DRE) | Base: Data de Competência</div>
  <table>
    <thead>
      <tr style="background:#0f2d5e;">
        <th style="color:#fff;min-width:220px;"></th>
        ${yCols}
        <th class="r" style="color:#fff;background:#1e3a5f;">TOTAL<br><span style="font-size:.64rem;font-weight:400;">2022–2026</span></th>
        <th class="r" style="color:#94a3b8;font-size:.72rem;">% RECEITA<br><span style="font-weight:400;">(total)</span></th>
      </tr>
    </thead>
    <tbody>
      ${HDR('CAPEX — INVESTIMENTOS', '#166534', '#dcfce7')}
      ${(capex||[]).map(item => CAT_ROW(item, '#166534')).join('')}
      ${total_capex ? TOT_ROW('TOTAL CAPEX', total_capex, '#14532d', '#dcfce7') : ''}

      ${HDR('OPEX — DESPESAS OPERACIONAIS', '#312e81', '#e0e7ff')}
      ${(opex||[]).map(item => CAT_ROW(item, '#1e1b4b')).join('')}
      ${total_opex ? TOT_ROW('TOTAL OPEX', total_opex, '#1e1b4b', '#e0e7ff') : ''}

      ${HDR('TOTAL GERAL (CAPEX + OPEX)', '#1f2937', '#f9fafb')}
      ${rb_lancamentos ? `<tr style="background:#f8fafc;">
        <td style="padding-left:1rem;color:#374151;">Receita Bruta</td>
        ${anos.map(a => `<td class="r" style="color:#374151;">${Rv(rb_lancamentos.vals[a])}</td>`).join('')}
        <td class="r" style="font-weight:700;color:#374151;">${Rv(rb_lancamentos.total)}</td>
        <td class="r" style="color:#64748b;font-size:.72rem;">${rb_lancamentos.pct.toFixed(1)}%</td>
      </tr>` : ''}
      ${rb_dre ? `<tr style="background:#dcfce7;font-weight:700;">
        <td style="padding-left:1rem;color:#166534;">Receita Bruta</td>
        ${anos.map(a => `<td class="r" style="color:#166534;">${Rv(rb_dre.vals[a])}</td>`).join('')}
        <td class="r" style="color:#166534;">${Rv(rb_dre.total)}</td>
        <td class="r" style="color:#166534;font-size:.72rem;">100,0%</td>
      </tr>` : ''}
    </tbody>
  </table>
  <p style="font-size:.68rem;color:#94a3b8;margin-top:.6rem;">Fonte: aba 📊 CAPEX vs OPEX do Excel importado.</p>
</div>`;
    } catch(e) { root.innerHTML = `<div class="d2-load">Erro: ${e}</div>`; }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function _brl(v) {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
}

function _pct(v) {
    if (v === null || v === undefined) return '—';
    return ((v || 0) * 100).toFixed(1) + '%';
}

function _opts(y2Label) {
    const scales = {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
        y: {
            position: 'left',
            ticks: { font: { size: 10 }, callback: v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}k` : v },
            grid: { color: 'rgba(0,0,0,.05)' }
        }
    };
    if (y2Label) {
        scales.y2 = {
            position: 'right',
            ticks: { font: { size: 10 }, callback: v => v.toFixed(1) },
            grid: { drawOnChartArea: false }
        };
    }
    return {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
            tooltip: {
                callbacks: {
                    label(ctx) {
                        const v = ctx.raw;
                        if (ctx.dataset.yAxisID === 'y2') return ` ${ctx.dataset.label}: ${(v||0).toFixed(1)}`;
                        return ` ${ctx.dataset.label}: ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(v)}`;
                    }
                }
            }
        },
        scales,
    };
}
