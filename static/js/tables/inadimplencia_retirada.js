/**
 * tables/inadimplencia_retirada.js
 * fetchAndRenderContratosBoletosAbertos
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import * as utils from '../utils.js';
import { registerFetchFn, renderCustomTable } from './shared.js';

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
    'Desistente': 'bg-gray-100 text-gray-600',
};

const _STATUS_ACESSO_CLS = {
    'Ativo':                'bg-green-100 text-green-800',
    'Financeiro em atraso': 'bg-orange-100 text-orange-800',
    'Bloqueio Automático':  'bg-red-100 text-red-800',
    'Bloqueio Manual':      'bg-red-100 text-red-800',
    'Desativado':           'bg-gray-200 text-gray-500',
};

export async function fetchAndRenderContratosBoletosAbertos(searchTerm = '', page = 1) {
    utils.showLoading(true);
    state.setCustomAnalysisState({
        currentPage: page,
        currentAnalysis: 'contratos_boletos_abertos',
        currentSearchTerm: searchTerm,
    });

    const s = state.getCustomAnalysisState();
    const offset = (page - 1) * s.rowsPerPage;
    const params = new URLSearchParams({ search_term: searchTerm, limit: s.rowsPerPage, offset });
    const url = `${state.API_BASE_URL}/api/custom_analysis/contratos_boletos_abertos?${params}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar análise.'));
        const result = await response.json();

        if (state.getCustomAnalysisState().currentAnalysis !== 'contratos_boletos_abertos') return;

        dom.dashboardContentDiv.innerHTML = '';

        renderCustomTable(result, 'Contratos com 3+ Boletos em Aberto', [
            { header: 'ID', key: 'Contrato_ID' },
            { header: 'Cliente', render: r => `<span title="${r.Cliente}">${r.Cliente}</span>` },
            { header: 'Cidade', key: 'Cidade' },
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
        ]);
    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'contratos_boletos_abertos')
            utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'contratos_boletos_abertos')
            utils.showLoading(false);
    }
}
