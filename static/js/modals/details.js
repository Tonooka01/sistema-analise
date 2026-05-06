/**
 * modals/details.js
 * Modal unificado de detalhes com abas (financeiro, OS, atendimentos, logins, comodato)
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import { handleFetchError, renderGenericDetailTable } from '../utils.js';

export function openDetailsModal(contractId, clientName, type) {
    state.setCurrentDetailsContractInfo(contractId, clientName);
    if (dom.detailsModalTitle) dom.detailsModalTitle.textContent = `Detalhes de ${clientName} (Contrato: ${contractId})`;
    if (dom.detailsModal) dom.detailsModal.classList.add('show');

    document.querySelectorAll('#detailsModalTabs .tab-link').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('#detailsModalTabContent .tab-pane').forEach(pane => {
        pane.classList.remove('active');
        pane.innerHTML = '';
    });

    let initialTab = 'financeiro';
    if (type === 'complaints') initialTab = 'os';
    else if (type === 'logins') initialTab = 'logins';

    const initialTabElement = document.querySelector(`#detailsModalTabs .tab-link[data-tab="${initialTab}"]`);
    const initialPaneElement = document.getElementById(`tab-content-${initialTab}`);
    if (initialTabElement && initialPaneElement) {
        initialTabElement.classList.add('active');
        initialPaneElement.classList.add('active');
        fetchAndRenderTabData(initialTab, 1);
    } else {
        console.error(`Aba inicial '${initialTab}' ou seu painel não encontrado.`);
    }
}

export function closeDetailsModal() {
    if (dom.detailsModal) dom.detailsModal.classList.remove('show');
    state.resetDetailsState();
}

export async function fetchAndRenderTabData(tab, page = 1) {
    const tabContent = document.getElementById(`tab-content-${tab}`);
    if (!tabContent) { console.error(`Painel de conteúdo para aba '${tab}' não encontrado.`); return; }

    state.setDetailsState(tab, { currentPage: page });
    const currentTabState = state.getDetailsState()[tab];
    const offset = (page - 1) * currentTabState.rowsPerPage;
    const limit = currentTabState.rowsPerPage;

    tabContent.innerHTML = '<div class="loading-spinner"></div>';

    const currentContractId = state.getDetailsState().currentContractId;
    const currentClientName = state.getDetailsState().currentClientName;
    const params = new URLSearchParams({ limit, offset });

    let url;
    switch (tab) {
        case 'financeiro':   url = `${state.API_BASE_URL}/api/details/financial/${currentContractId}?${params.toString()}`; break;
        case 'os':           url = `${state.API_BASE_URL}/api/details/complaints/${encodeURIComponent(currentClientName)}?type=os&${params.toString()}`; break;
        case 'atendimentos': url = `${state.API_BASE_URL}/api/details/complaints/${encodeURIComponent(currentClientName)}?type=atendimentos&${params.toString()}`; break;
        case 'logins':       url = `${state.API_BASE_URL}/api/details/logins/${currentContractId}?${params.toString()}`; break;
        case 'comodato':
            url = `${state.API_BASE_URL}/api/details/comodato/${currentContractId}`;
            params.delete('limit'); params.delete('offset');
            break;
        default:
            tabContent.innerHTML = `<p class="text-red-500">Erro: Tipo de aba desconhecido.</p>`;
            return;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await handleFetchError(response, `Não foi possível carregar dados para ${tab}.`));
        const result = await response.json();
        state.setDetailsState(tab, { totalRows: result.total_rows || 0 });
        _renderDetailTabContent(tab, result.data || []);
    } catch (error) {
        console.error(`Erro ao buscar dados da aba ${tab}:`, error);
        tabContent.innerHTML = `<p class="text-red-500">${error.message}</p>`;
    }
}

function _renderDetailTabContent(tab, data) {
    const tabContent = document.getElementById(`tab-content-${tab}`);
    if (!tabContent) return;

    if (!data || data.length === 0) {
        tabContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum dado encontrado.</p>';
        return;
    }

    let columns = [];
    switch (tab) {
        case 'financeiro':
            columns = [
                { header: 'ID', key: 'ID' }, { header: 'Parcela', key: 'Parcela_R' },
                { header: 'Emissão', key: 'Emissao', isDate: true }, { header: 'Vencimento', key: 'Vencimento', isDate: true },
                { header: 'Pagamento', key: 'Data_pagamento', isDate: true }, { header: 'Valor', key: 'Valor', isCurrency: true }, { header: 'Status', key: 'Status' }
            ]; break;
        case 'os':
            columns = [{ header: 'ID', key: 'ID' }, { header: 'Abertura', key: 'Abertura', isDate: true }, { header: 'Assunto', key: 'Assunto' }, { header: 'Status', key: 'Status' }]; break;
        case 'atendimentos':
            columns = [{ header: 'ID', key: 'ID' }, { header: 'Criação', key: 'Criado_em', isDate: true }, { header: 'Assunto', key: 'Assunto' }, { header: 'Status', key: 'Novo_status' }]; break;
        case 'logins':
            columns = [{ header: 'Login', key: 'Login' }, { header: 'Última Conexão', key: 'ltima_conex_o_inicial', isDate: true }, { header: 'Sinal RX', key: 'Sinal_RX' }, { header: 'ONU/Plano', key: 'ONU_tipo' }, { header: 'IPV4', key: 'IPV4' }, { header: 'Transmissor', key: 'Transmissor' }]; break;
        case 'comodato':
            columns = [{ header: 'Produto', key: 'Descricao_produto' }, { header: 'Status', key: 'Status_comodato' }]; break;
    }

    const tableHtml = renderGenericDetailTable(null, data, columns, true);
    const currentTabState = state.getDetailsState()[tab];
    let paginationHtml = '';
    const totalPages = Math.ceil(currentTabState.totalRows / currentTabState.rowsPerPage);
    if (totalPages > 1 && tab !== 'comodato') {
        paginationHtml = `
            <div class="pagination-controls flex justify-center items-center gap-2 mt-4">
                <button data-tab="${tab}" data-page="${currentTabState.currentPage - 1}" class="prev-page-btn bg-gray-200 px-3 py-1 rounded disabled:opacity-50" ${currentTabState.currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
                <span>Página ${currentTabState.currentPage} de ${totalPages}</span>
                <button data-tab="${tab}" data-page="${currentTabState.currentPage + 1}" class="next-page-btn bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50" ${currentTabState.currentPage >= totalPages ? 'disabled' : ''}>Próxima</button>
            </div>`;
    }
    tabContent.innerHTML = `<div class="table-wrapper border rounded-lg overflow-hidden">${tableHtml}</div>` + paginationHtml;
}
