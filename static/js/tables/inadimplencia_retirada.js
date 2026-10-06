/**
 * tables/inadimplencia_retirada.js
 * fetchAndRenderContratosBoletosAbertos — com barra de filtros inline
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import * as utils from '../utils.js';
import { registerFetchFn, renderCustomTable } from './shared.js';

// Estado dos filtros (persiste entre páginas)
let _filters = {
    status_contrato:   '',
    status_acesso:     '',
    situacao_retirada: '',
    cidade:            '',
    min_boletos:       3,
};

registerFetchFn('contratos_boletos_abertos', (s, p) =>
    fetchAndRenderContratosBoletosAbertos(s.currentSearchTerm, p)
);

const _SITUACAO = {
    retirada_fin_sem_neg: { label: '⚠️ Retirada finalizada — não negativado', cls: 'bg-orange-100 text-orange-800' },
    retirada_aberta:      { label: '🔧 Retirada em aberto',                   cls: 'bg-yellow-100 text-yellow-800' },
    retirada_fin_ok:      { label: '✅ Retirada finalizada',                   cls: 'bg-green-100 text-green-800'  },
    sem_retirada:         { label: '❌ Sem OS de retirada',                    cls: 'bg-gray-100 text-gray-600'    },
};

const _STATUS_CONTRATO_CLS = {
    'Ativo':      'bg-green-100 text-green-800',
    'Negativado': 'bg-red-100 text-red-800',
    'Pendente':   'bg-yellow-100 text-yellow-800',
    'Desistente': 'bg-gray-200 text-gray-600',
};

const _STATUS_ACESSO_CLS = {
    'Ativo':                'bg-green-100 text-green-800',
    'Financeiro em atraso': 'bg-orange-100 text-orange-800',
    'Bloqueio Automático':  'bg-red-100 text-red-800',
    'Bloqueio Manual':      'bg-red-100 text-red-800',
    'Desativado':           'bg-gray-200 text-gray-500',
};

const COLUMNS = [
    { header: 'ID', key: 'Contrato_ID' },
    { header: 'Cliente', render: r => `<span title="${r.Cliente}">${r.Cliente}</span>` },
    { header: 'Cidade', key: 'Cidade' },
    { header: 'Bairro', key: 'Bairro' },
    {
        header: 'Status Contrato',
        render: r => {
            const cls = _STATUS_CONTRATO_CLS[r.Status_contrato] || 'bg-gray-100 text-gray-600';
            return `<span class="text-xs font-semibold px-2 py-0.5 rounded-full ${cls}">${r.Status_contrato || '—'}</span>`;
        },
    },
    {
        header: 'Status Acesso',
        render: r => {
            const cls = _STATUS_ACESSO_CLS[r.Status_acesso] || 'bg-gray-100 text-gray-600';
            return `<span class="text-xs font-semibold px-2 py-0.5 rounded-full ${cls}">${r.Status_acesso || '—'}</span>`;
        },
    },
    {
        header: 'Boletos Abertos',
        render: r => `<span class="font-bold text-red-700">${r.Qtd_Boletos_Abertos}</span>`,
    },
    {
        header: 'Total em Aberto',
        render: r => `R$ ${Number(r.Total_Em_Aberto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    },
    {
        header: 'Venc. Mais Antigo',
        render: r => r.Vencimento_Mais_Antigo ? utils.formatDate(r.Vencimento_Mais_Antigo) : '—',
    },
    {
        header: 'Situação Retirada',
        render: r => {
            const info = _SITUACAO[r.Situacao_Retirada] || _SITUACAO.sem_retirada;
            let extra = '';
            if (r.Situacao_Retirada === 'retirada_aberta' && r.Status_OS_Retirada)
                extra = ` <span class="text-xs text-gray-500">(${r.Status_OS_Retirada})</span>`;
            if (r.Situacao_Retirada === 'retirada_fin_sem_neg' && r.Data_Retirada_Finalizada)
                extra = ` <span class="text-xs text-gray-500">em ${utils.formatDate(r.Data_Retirada_Finalizada)}</span>`;
            return `<span class="text-xs font-semibold px-2 py-0.5 rounded-full ${info.cls}">${info.label}</span>${extra}`;
        },
    },
];

function _buildUrl(searchTerm, page, rowsPerPage) {
    const offset = (page - 1) * rowsPerPage;
    const p = new URLSearchParams({
        search_term: searchTerm,
        limit:       rowsPerPage,
        offset,
        min_boletos: _filters.min_boletos,
    });
    if (_filters.status_contrato)   p.append('status_contrato',   _filters.status_contrato);
    if (_filters.status_acesso)     p.append('status_acesso',     _filters.status_acesso);
    if (_filters.situacao_retirada) p.append('situacao_retirada', _filters.situacao_retirada);
    if (_filters.cidade)            p.append('cidade',            _filters.cidade);
    return `${state.API_BASE_URL}/api/custom_analysis/contratos_boletos_abertos?${p}`;
}

function _readBar() {
    const bar = document.getElementById('boletos-filter-bar');
    if (!bar) return;
    _filters.status_contrato   = bar.querySelector('#bf-sc').value;
    _filters.status_acesso     = bar.querySelector('#bf-sa').value;
    _filters.situacao_retirada = bar.querySelector('#bf-sr').value;
    _filters.cidade            = bar.querySelector('#bf-cid').value;
    _filters.min_boletos       = Math.max(1, parseInt(bar.querySelector('#bf-min').value) || 3);
}

function _syncBar() {
    const bar = document.getElementById('boletos-filter-bar');
    if (!bar) return;
    bar.querySelector('#bf-sc').value  = _filters.status_contrato;
    bar.querySelector('#bf-sa').value  = _filters.status_acesso;
    bar.querySelector('#bf-sr').value  = _filters.situacao_retirada;
    bar.querySelector('#bf-cid').value = _filters.cidade;
    bar.querySelector('#bf-min').value = _filters.min_boletos;
}

function _setupFilterBar(parent, cidades) {
    const bar = document.createElement('div');
    bar.id = 'boletos-filter-bar';
    bar.className = 'flex flex-wrap gap-3 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 items-end';

    const sel = (id, label, opts) => `
        <div class="flex flex-col gap-1 min-w-[160px]">
            <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide">${label}</label>
            <select id="${id}" class="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none">
                ${opts}
            </select>
        </div>`;

    const cidOpts = ['<option value="">Todas</option>',
        ...cidades.map(c => `<option value="${c}">${c}</option>`)].join('');

    bar.innerHTML = `
        ${sel('bf-sc', 'Status Contrato', `
            <option value="">Todos</option>
            <option value="Ativo">Ativo</option>
            <option value="Negativado">Negativado</option>
            <option value="Pendente">Pendente</option>
            <option value="Desistente">Desistente</option>
        `)}
        ${sel('bf-sa', 'Status Acesso', `
            <option value="">Todos</option>
            <option value="Ativo">Ativo</option>
            <option value="Financeiro em atraso">Financeiro em atraso</option>
            <option value="Bloqueio Automático">Bloqueio Automático</option>
            <option value="Bloqueio Manual">Bloqueio Manual</option>
            <option value="Desativado">Desativado</option>
        `)}
        ${sel('bf-sr', 'Situação Retirada', `
            <option value="">Todas</option>
            <option value="sem_retirada">❌ Sem OS de retirada</option>
            <option value="retirada_aberta">🔧 Retirada em aberto</option>
            <option value="retirada_fin_sem_neg">⚠️ Retirada finalizada — não negativado</option>
            <option value="retirada_fin_ok">✅ Retirada finalizada (ok)</option>
        `)}
        ${sel('bf-cid', 'Cidade', cidOpts)}
        <div class="flex flex-col gap-1">
            <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mín. Boletos</label>
            <input type="number" id="bf-min" value="${_filters.min_boletos}" min="1"
                   class="text-sm border border-gray-300 rounded-md px-2 py-1.5 w-20 bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none">
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

    bar.querySelector('#bf-aplicar').addEventListener('click', () => {
        _readBar();
        fetchAndRenderContratosBoletosAbertos(state.getCustomAnalysisState().currentSearchTerm, 1);
    });

    bar.querySelector('#bf-limpar').addEventListener('click', () => {
        _filters = { status_contrato: '', status_acesso: '', situacao_retirada: '', cidade: '', min_boletos: 3 };
        _syncBar();
        fetchAndRenderContratosBoletosAbertos('', 1);
    });

    // Enter nos selects também aplica
    bar.querySelectorAll('select, input').forEach(el =>
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter') bar.querySelector('#bf-aplicar').click();
        })
    );
}

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

        // Primeira renderização: limpar tudo e criar barra de filtros
        if (!document.getElementById('boletos-filter-bar')) {
            dom.dashboardContentDiv.innerHTML = '';
            _setupFilterBar(dom.dashboardContentDiv, result.cidades || []);
        } else {
            // Repopular cidades se chegaram novas (após limpar filtros)
            const cidSel = document.getElementById('bf-cid');
            if (cidSel && result.cidades && result.cidades.length > cidSel.options.length - 1) {
                const cur = cidSel.value;
                cidSel.innerHTML = '<option value="">Todas</option>' +
                    (result.cidades || []).map(c => `<option value="${c}">${c}</option>`).join('');
                cidSel.value = cur;
            }
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
