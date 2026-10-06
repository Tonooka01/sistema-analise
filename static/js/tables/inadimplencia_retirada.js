/**
 * tables/inadimplencia_retirada.js
 * fetchAndRenderContratosBoletosAbertos — filtros multi-select por todas as colunas
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import * as utils from '../utils.js';
import { registerFetchFn, renderCustomTable } from './shared.js';

let _filters = {
    status_contrato:   [],
    status_acesso:     [],
    situacao_retirada: [],
    cidade:            [],
    min_boletos:       3,
};

registerFetchFn('contratos_boletos_abertos', (s, p) =>
    fetchAndRenderContratosBoletosAbertos(s.currentSearchTerm, p)
);

// ── Lookup tables ──────────────────────────────────────────────────────────
const _SITUACAO = {
    retirada_fin_sem_neg: { label: '⚠️ Retirada finalizada — não negativado', cls: 'bg-orange-100 text-orange-800' },
    retirada_aberta:      { label: '🔧 Retirada em aberto',                   cls: 'bg-yellow-100 text-yellow-800' },
    retirada_fin_ok:      { label: '✅ Retirada finalizada',                   cls: 'bg-green-100 text-green-800'  },
    sem_retirada:         { label: '❌ Sem OS de retirada',                    cls: 'bg-gray-100 text-gray-600'    },
};
const _SC_CLS = {
    'Ativo':      'bg-green-100 text-green-800',
    'Negativado': 'bg-red-100 text-red-800',
    'Pendente':   'bg-yellow-100 text-yellow-800',
    'Desistente': 'bg-gray-200 text-gray-600',
};
const _SA_CLS = {
    'Ativo':                'bg-green-100 text-green-800',
    'Financeiro em atraso': 'bg-orange-100 text-orange-800',
    'Bloqueio Automático':  'bg-red-100 text-red-800',
    'Bloqueio Manual':      'bg-red-100 text-red-800',
    'Desativado':           'bg-gray-200 text-gray-500',
};

const COLUMNS = [
    { header: 'ID',    key: 'Contrato_ID' },
    { header: 'Cliente', render: r => `<span title="${r.Cliente}">${r.Cliente}</span>` },
    { header: 'Cidade',  key: 'Cidade' },
    { header: 'Bairro',  key: 'Bairro' },
    { header: 'Status Contrato', render: r => {
        const cls = _SC_CLS[r.Status_contrato] || 'bg-gray-100 text-gray-600';
        return `<span class="text-xs font-semibold px-2 py-0.5 rounded-full ${cls}">${r.Status_contrato||'—'}</span>`;
    }},
    { header: 'Status Acesso', render: r => {
        const cls = _SA_CLS[r.Status_acesso] || 'bg-gray-100 text-gray-600';
        return `<span class="text-xs font-semibold px-2 py-0.5 rounded-full ${cls}">${r.Status_acesso||'—'}</span>`;
    }},
    { header: 'Boletos Abertos', render: r =>
        `<span class="font-bold text-red-700">${r.Qtd_Boletos_Abertos}</span>` },
    { header: 'Total em Aberto', render: r =>
        `R$ ${Number(r.Total_Em_Aberto||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}` },
    { header: 'Venc. Mais Antigo', render: r =>
        r.Vencimento_Mais_Antigo ? utils.formatDate(r.Vencimento_Mais_Antigo) : '—' },
    { header: 'Situação Retirada', render: r => {
        const info = _SITUACAO[r.Situacao_Retirada] || _SITUACAO.sem_retirada;
        let extra = '';
        if (r.Situacao_Retirada === 'retirada_aberta' && r.Status_OS_Retirada)
            extra = ` <span class="text-xs text-gray-500">(${r.Status_OS_Retirada})</span>`;
        if (r.Situacao_Retirada === 'retirada_fin_sem_neg' && r.Data_Retirada_Finalizada)
            extra = ` <span class="text-xs text-gray-500">em ${utils.formatDate(r.Data_Retirada_Finalizada)}</span>`;
        return `<span class="text-xs font-semibold px-2 py-0.5 rounded-full ${info.cls}">${info.label}</span>${extra}`;
    }},
];

// ── Multi-select helpers ───────────────────────────────────────────────────
function _getChecked(id) {
    const panel = document.getElementById(`${id}-panel`);
    if (!panel) return [];
    return [...panel.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);
}

function _setChecked(id, values) {
    const panel = document.getElementById(`${id}-panel`);
    if (!panel) return;
    panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = values.includes(cb.value);
    });
    _updateLabel(id);
}

function _updateLabel(id) {
    const panel = document.getElementById(`${id}-panel`);
    const lbl   = document.getElementById(`${id}-lbl`);
    if (!panel || !lbl) return;
    const checked = [...panel.querySelectorAll('input[type=checkbox]:checked')];
    if (checked.length === 0) {
        lbl.textContent = 'Todos';
    } else if (checked.length === 1) {
        lbl.textContent = checked[0].dataset.label || checked[0].value;
    } else {
        lbl.textContent = `${checked.length} selecionados`;
    }
}

function _mkMultiSel(id, label, opts) {
    const rows = opts.map(o =>
        `<label class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm whitespace-nowrap">
            <input type="checkbox" value="${o.value}" data-label="${o.label}"
                   class="rounded border-gray-300 text-blue-600 cursor-pointer">
            <span>${o.label}</span>
        </label>`
    ).join('');

    return `
    <div class="flex flex-col gap-1">
        <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide">${label}</label>
        <div class="bf-ms relative" data-ms-id="${id}">
            <button type="button" id="${id}-btn"
                    class="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white text-left min-w-[160px] flex items-center justify-between gap-2 focus:ring-2 focus:ring-blue-400 focus:outline-none hover:border-gray-400 transition">
                <span id="${id}-lbl" class="truncate">Todos</span>
                <span class="text-gray-400 flex-shrink-0 text-xs">▾</span>
            </button>
            <div id="${id}-panel"
                 class="hidden absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg min-w-[200px] max-h-64 overflow-y-auto py-1">
                ${rows}
            </div>
        </div>
    </div>`;
}

function _setupMultiSelEvents(bar) {
    bar.querySelectorAll('.bf-ms').forEach(ms => {
        const id  = ms.dataset.msId;
        const btn = document.getElementById(`${id}-btn`);
        const panel = document.getElementById(`${id}-panel`);

        btn.addEventListener('click', e => {
            e.stopPropagation();
            // Fecha todos os outros
            bar.querySelectorAll('[id$="-panel"]').forEach(p => {
                if (p !== panel) p.classList.add('hidden');
            });
            panel.classList.toggle('hidden');
        });

        panel.addEventListener('click', e => e.stopPropagation());

        panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
            cb.addEventListener('change', () => _updateLabel(id));
        });
    });

    // Clique fora fecha todos os painéis
    const closeAll = () =>
        bar.querySelectorAll('[id$="-panel"]').forEach(p => p.classList.add('hidden'));
    document.addEventListener('click', closeAll);
    // Cleanup quando a barra sumir
    new MutationObserver((_, obs) => {
        if (!document.contains(bar)) { document.removeEventListener('click', closeAll); obs.disconnect(); }
    }).observe(document.body, { childList: true, subtree: true });
}

function _readBar() {
    _filters.status_contrato   = _getChecked('bf-sc');
    _filters.status_acesso     = _getChecked('bf-sa');
    _filters.situacao_retirada = _getChecked('bf-sr');
    _filters.cidade            = _getChecked('bf-cid');
    _filters.min_boletos = Math.max(1, parseInt(document.getElementById('bf-min')?.value) || 3);
}

function _syncBar() {
    _setChecked('bf-sc',  _filters.status_contrato);
    _setChecked('bf-sa',  _filters.status_acesso);
    _setChecked('bf-sr',  _filters.situacao_retirada);
    _setChecked('bf-cid', _filters.cidade);
    const minEl = document.getElementById('bf-min');
    if (minEl) minEl.value = _filters.min_boletos;
}

function _populateCidades(cidades) {
    const panel = document.getElementById('bf-cid-panel');
    if (!panel) return;
    const prev = _getChecked('bf-cid');
    panel.innerHTML = cidades.map(c =>
        `<label class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm whitespace-nowrap">
            <input type="checkbox" value="${c}" data-label="${c}"
                   class="rounded border-gray-300 text-blue-600 cursor-pointer">
            <span>${c}</span>
        </label>`
    ).join('');
    panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
        if (prev.includes(cb.value)) cb.checked = true;
        cb.addEventListener('change', () => _updateLabel('bf-cid'));
    });
    _updateLabel('bf-cid');
}

function _setupFilterBar(parent, cidades) {
    const bar = document.createElement('div');
    bar.id = 'boletos-filter-bar';
    bar.className = 'flex flex-wrap gap-3 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 items-end';

    bar.innerHTML = `
        ${_mkMultiSel('bf-sc', 'Status Contrato', [
            { value: 'Ativo',      label: 'Ativo'      },
            { value: 'Negativado', label: 'Negativado' },
            { value: 'Pendente',   label: 'Pendente'   },
            { value: 'Desistente', label: 'Desistente' },
        ])}
        ${_mkMultiSel('bf-sa', 'Status Acesso', [
            { value: 'Ativo',                label: 'Ativo'                },
            { value: 'Financeiro em atraso', label: 'Financeiro em atraso' },
            { value: 'Bloqueio Automático',  label: 'Bloqueio Automático'  },
            { value: 'Bloqueio Manual',      label: 'Bloqueio Manual'      },
            { value: 'Desativado',           label: 'Desativado'           },
        ])}
        ${_mkMultiSel('bf-sr', 'Situação Retirada', [
            { value: 'sem_retirada',         label: '❌ Sem OS de retirada'                 },
            { value: 'retirada_aberta',      label: '🔧 Retirada em aberto'                 },
            { value: 'retirada_fin_sem_neg', label: '⚠️ Retirada finalizada — não negativado'},
            { value: 'retirada_fin_ok',      label: '✅ Retirada finalizada (ok)'            },
        ])}
        ${_mkMultiSel('bf-cid', 'Cidade', cidades.map(c => ({ value: c, label: c })))}
        <div class="flex flex-col gap-1">
            <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mín. Boletos</label>
            <input type="number" id="bf-min" value="${_filters.min_boletos}" min="1"
                   class="text-sm border border-gray-300 rounded-md px-2 py-1.5 w-20 bg-white
                          focus:ring-2 focus:ring-blue-400 focus:outline-none">
        </div>
        <button id="bf-aplicar"
                class="self-end px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition">
            Filtrar
        </button>
        <button id="bf-limpar"
                class="self-end px-4 py-1.5 bg-gray-200 text-gray-700 text-sm font-semibold rounded-md hover:bg-gray-300 transition">
            Limpar
        </button>
    `;

    parent.appendChild(bar);
    _setupMultiSelEvents(bar);

    bar.querySelector('#bf-aplicar').addEventListener('click', () => {
        _readBar();
        fetchAndRenderContratosBoletosAbertos(state.getCustomAnalysisState().currentSearchTerm, 1);
    });

    bar.querySelector('#bf-limpar').addEventListener('click', () => {
        _filters = { status_contrato: [], status_acesso: [], situacao_retirada: [], cidade: [], min_boletos: 3 };
        _syncBar();
        fetchAndRenderContratosBoletosAbertos('', 1);
    });

    bar.querySelector('#bf-min').addEventListener('keydown', e => {
        if (e.key === 'Enter') bar.querySelector('#bf-aplicar').click();
    });
}

// ── URL builder ───────────────────────────────────────────────────────────
function _buildUrl(searchTerm, page, rowsPerPage) {
    const offset = (page - 1) * rowsPerPage;
    const p = new URLSearchParams({ search_term: searchTerm, limit: rowsPerPage, offset, min_boletos: _filters.min_boletos });
    if (_filters.status_contrato.length)   p.append('status_contrato',   _filters.status_contrato.join(','));
    if (_filters.status_acesso.length)     p.append('status_acesso',     _filters.status_acesso.join(','));
    if (_filters.situacao_retirada.length) p.append('situacao_retirada', _filters.situacao_retirada.join(','));
    if (_filters.cidade.length)            p.append('cidade',            _filters.cidade.join(','));
    return `${state.API_BASE_URL}/api/custom_analysis/contratos_boletos_abertos?${p}`;
}

// ── Main fetch ────────────────────────────────────────────────────────────
export async function fetchAndRenderContratosBoletosAbertos(searchTerm = '', page = 1) {
    utils.showLoading(true);
    state.setCustomAnalysisState({
        currentPage: page,
        currentAnalysis: 'contratos_boletos_abertos',
        currentSearchTerm: searchTerm,
    });

    const s = state.getCustomAnalysisState();

    try {
        const response = await fetch(_buildUrl(searchTerm, page, s.rowsPerPage));
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar análise.'));
        const result = await response.json();

        if (state.getCustomAnalysisState().currentAnalysis !== 'contratos_boletos_abertos') return;

        if (!document.getElementById('boletos-filter-bar')) {
            dom.dashboardContentDiv.innerHTML = '';
            _setupFilterBar(dom.dashboardContentDiv, result.cidades || []);
        } else {
            _populateCidades(result.cidades || []);
        }

        renderCustomTable(result, 'Contratos com 3+ Boletos em Aberto', COLUMNS);

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'contratos_boletos_abertos')
            utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'contratos_boletos_abertos')
            utils.showLoading(false);
    }
}
