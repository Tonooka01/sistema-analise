/**
 * tables/finance.js
 * fetchAndRenderLatePaymentsAnalysis
 * fetchAndRenderFinancialHealthAnalysis
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import * as utils from '../utils.js';
import { registerFetchFn, renderCustomTable } from './shared.js';

registerFetchFn('atrasos_e_nao_pagos', (s, p) =>
    fetchAndRenderLatePaymentsAnalysis(s.currentSearchTerm, p)
);
registerFetchFn('saude_financeira', (s, p) =>
    fetchAndRenderFinancialHealthAnalysis(s.currentSearchTerm, s.currentAnalysisType, p, s.currentStartDate, s.currentEndDate)
);

export async function fetchAndRenderLatePaymentsAnalysis(searchTerm = '', page = 1) {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentPage: page, currentAnalysis: 'atrasos_e_nao_pagos', currentSearchTerm: searchTerm });

    const currentState = state.getCustomAnalysisState();
    const offset = (page - 1) * currentState.rowsPerPage;
    const url = `${state.API_BASE_URL}/api/custom_analysis/contas_a_receber?search_term=${encodeURIComponent(searchTerm)}&limit=${currentState.rowsPerPage}&offset=${offset}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar atrasos.'));
        const result = await response.json();

        if (state.getCustomAnalysisState().currentAnalysis !== 'atrasos_e_nao_pagos') return;

        dom.dashboardContentDiv.innerHTML = '';
        renderCustomTable(result, 'Análise de Atrasos e Faturas Não Pagas', [
            { header: 'Cliente', render: r => `<span title="${r.Cliente}">${r.Cliente}</span>` },
            { header: 'ID Contrato', key: 'Contrato_ID' },
            { header: 'Atrasos Pagos', render: r => r.Atrasos_Pagos > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-type="atrasos_pagos" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Atrasos_Pagos}</span>` : r.Atrasos_Pagos },
            { header: 'Faturas Vencidas (Não Pagas)', render: r => r.Faturas_Nao_Pagas > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-type="faturas_nao_pagas" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Faturas_Nao_Pagas}</span>` : r.Faturas_Nao_Pagas }
        ]);
    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'atrasos_e_nao_pagos') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'atrasos_e_nao_pagos') utils.showLoading(false);
    }
}

export async function fetchAndRenderFinancialHealthAnalysis(searchTerm = '', analysisType = 'atraso', page = 1, startDate = '', endDate = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentPage: page, currentAnalysis: 'saude_financeira', currentSearchTerm: searchTerm, currentAnalysisType: analysisType });

    const currentState = state.getCustomAnalysisState();
    const contractStatus = dom.contractStatusFilter?.value || '';
    let accessStatus = '';
    if (dom.accessStatusContainer) {
        const checked = dom.accessStatusContainer.querySelectorAll('input[type="checkbox"]:checked');
        accessStatus = Array.from(checked).map(cb => cb.value).join(',');
    }

    const offset = (page - 1) * currentState.rowsPerPage;
    const endpoint = analysisType === 'bloqueio' ? 'financial_health_auto_block' : 'financial_health';
    const params = new URLSearchParams({ search_term: searchTerm, limit: currentState.rowsPerPage, offset: offset });
    if (contractStatus) params.append('status_contrato', contractStatus);
    if (accessStatus) params.append('status_acesso', accessStatus);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const url = `${state.API_BASE_URL}/api/custom_analysis/${endpoint}?${params.toString()}`;
    const title = analysisType === 'bloqueio'
        ? 'Análise de Saúde Financeira (Bloqueio Automático > 20 dias)'
        : 'Análise de Saúde Financeira (Atraso > 10 dias)';

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar saúde financeira.'));
        const result = await response.json();

        if (state.getCustomAnalysisState().currentAnalysis !== 'saude_financeira') return;

        dom.dashboardContentDiv.innerHTML = '';
        renderCustomTable(result, title, [
            { header: 'Cliente', render: r => `<span title="${r.Razao_Social}">${r.Razao_Social}</span>` },
            { header: 'ID Contrato', key: 'Contrato_ID' },
            { header: 'Status Contrato', key: 'Status_contrato' },
            { header: 'Status Acesso', key: 'Status_acesso' },
            { header: 'Data Ativação', render: r => r.Data_ativa_o ? utils.formatDate(r.Data_ativa_o) : 'N/A' },
            { header: '1ª Inadimplência', render: r => r.Primeira_Inadimplencia_Vencimento ? `<span class="detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-type="financial" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">${utils.formatDate(r.Primeira_Inadimplencia_Vencimento)}</span>` : 'N/A' },
            { header: 'Tem Reclamações?', render: r => r.Possui_Reclamacoes === 'Sim' ? `<span class="detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-type="complaints" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">Sim</span>` : 'Não' },
            { header: 'Última Conexão', render: r => r.Ultima_Conexao ? `<span class="detail-trigger cursor-pointer text-blue-600 hover:underline" data-type="logins" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">${utils.formatDate(r.Ultima_Conexao)}</span>` : 'N/A' }
        ]);

        if (dom.viewTableBtn) {
            dom.viewTableBtn.classList.remove('hidden');
            dom.viewTableBtn.textContent = 'Ver Tabela Completa (Paginação)';
        }
    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'saude_financeira') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'saude_financeira') utils.showLoading(false);
    }
}
