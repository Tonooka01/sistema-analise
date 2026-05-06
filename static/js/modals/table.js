/**
 * modals/table.js
 * Modal principal de tabela (openModal, fetchAndDisplayTableInModal)
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import { formatDate, handleFetchError } from '../utils.js';

export function openModal(collectionName) {
    state.setModalCurrentCollection(collectionName);
    state.setModalCurrentPage(1);

    let title = `Dados da Tabela: ${collectionName}`;
    if (collectionName === 'saude_financeira_contrato_atraso')        title = 'Análise Completa: Saúde Financeira (Atraso > 10 dias)';
    else if (collectionName === 'saude_financeira_contrato_bloqueio') title = 'Análise Completa: Saúde Financeira (Bloqueio Automático)';
    else if (collectionName === 'cancellations')                      title = 'Análise Completa: Cancelamentos';
    else if (collectionName === 'negativacao')                        title = 'Análise Completa: Negativações';

    if (dom.modalTitle) dom.modalTitle.textContent = title;
    if (dom.tableModal) dom.tableModal.classList.add('show');
    fetchAndDisplayTableInModal(collectionName, 1);
}

export function closeModal() {
    if (dom.tableModal) dom.tableModal.classList.remove('show');
}

export async function fetchAndDisplayTableInModal(collectionName, page = 1) {
    if (dom.modalLoadingDiv) dom.modalLoadingDiv.classList.remove('hidden');
    if (dom.modalErrorMessageDiv) dom.modalErrorMessageDiv.classList.add('hidden');
    if (dom.modalTableHead) dom.modalTableHead.innerHTML = '';
    if (dom.modalTableBody) dom.modalTableBody.innerHTML = '';
    if (dom.modalPaginationControls) dom.modalPaginationControls.classList.add('hidden');

    let limit = state.MODAL_ROWS_PER_PAGE;
    let offset = (page - 1) * limit;
    let url = '';
    let isFullView = false;

    const customAnalysesTypes = [
        'saude_financeira_contrato_atraso',
        'saude_financeira_contrato_bloqueio',
        'cancellations',
        'negativacao'
    ];

    if (customAnalysesTypes.includes(collectionName)) {
        isFullView = true;
        limit = 100000;
        offset = 0;

        let endpoint = '';
        let params = new URLSearchParams({ limit, offset });
        const searchTerm = dom.clientSearchInput?.value || '';
        if (searchTerm) params.append('search_term', searchTerm);
        const currentState = state.getCustomAnalysisState();

        if (collectionName.startsWith('saude_financeira')) {
            endpoint = collectionName.includes('bloqueio') ? 'financial_health_auto_block' : 'financial_health';
            const contractStatus = dom.contractStatusFilter?.value || '';
            let accessStatus = '';
            if (dom.accessStatusContainer) {
                const checked = dom.accessStatusContainer.querySelectorAll('input[type="checkbox"]:checked');
                accessStatus = Array.from(checked).map(cb => cb.value).join(',');
            }
            if (contractStatus) params.append('status_contrato', contractStatus);
            if (accessStatus) params.append('status_acesso', accessStatus);
            if (dom.relevanceFilterSearch?.value) params.append('relevance', dom.relevanceFilterSearch.value);

        } else if (collectionName === 'cancellations') {
            endpoint = 'cancellations';
            if (dom.customStartDate?.value) params.append('start_date', dom.customStartDate.value);
            if (dom.customEndDate?.value) params.append('end_date', dom.customEndDate.value);
            if (dom.relevanceFilterSearch?.value) params.append('relevance', dom.relevanceFilterSearch.value);
            if (currentState.chartFilterColumn && currentState.chartFilterValue) {
                params.append('filter_column', currentState.chartFilterColumn);
                params.append('filter_value', currentState.chartFilterValue);
            }
            params.append('sort_order', state.getCustomAnalysisState().sortOrder || 'desc');

        } else if (collectionName === 'negativacao') {
            endpoint = 'negativacao';
            if (dom.customStartDate?.value) params.append('start_date', dom.customStartDate.value);
            if (dom.customEndDate?.value) params.append('end_date', dom.customEndDate.value);
            if (dom.relevanceFilterSearch?.value) params.append('relevance', dom.relevanceFilterSearch.value);
            if (currentState.chartFilterColumn && currentState.chartFilterValue) {
                params.append('filter_column', currentState.chartFilterColumn);
                params.append('filter_value', currentState.chartFilterValue);
            }
            params.append('sort_order', state.getCustomAnalysisState().sortOrder || 'desc');
        }

        url = `${state.API_BASE_URL}/api/custom_analysis/${endpoint}?${params.toString()}`;

    } else {
        const apiCollectionName = collectionName.replace(/ /g, '_');
        url = `${state.API_BASE_URL}/api/data/${apiCollectionName}?limit=${limit}&offset=${offset}`;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await handleFetchError(response, 'Não foi possível carregar os dados da tabela.'));
        const result = await response.json();
        state.setModalTotalRows(result.total_rows);
        state.setModalCurrentPage(page);

        if (!result.data || result.data.length === 0) {
            if (dom.modalTableBody) dom.modalTableBody.innerHTML = '<tr><td colspan="50" class="text-center py-4 text-gray-500">Nenhum dado encontrado para os filtros selecionados.</td></tr>';
            return;
        }

        _renderDataTableInModal(result.data);

        if (isFullView) {
            if (dom.modalPaginationControls) {
                dom.modalPaginationControls.classList.remove('hidden');
                dom.modalPaginationControls.innerHTML = `<div class="text-center w-full text-gray-600 text-sm">Exibindo <strong>${result.data.length}</strong> registros filtrados (Total Original: ${result.total_rows}). Role a tabela para ver mais.</div>`;
            }
        } else {
            _renderModalPaginationControls();
        }

    } catch (error) {
        console.error('Erro no modal:', error);
        if (dom.modalErrorTextSpan) dom.modalErrorTextSpan.textContent = `Erro: ${error.message}.`;
        if (dom.modalErrorMessageDiv) dom.modalErrorMessageDiv.classList.remove('hidden');
    } finally {
        if (dom.modalLoadingDiv) dom.modalLoadingDiv.classList.add('hidden');
    }
}

function _renderDataTableInModal(data) {
    if (!dom.modalTableHead || !dom.modalTableBody || !data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    dom.modalTableHead.innerHTML = headers.map(h =>
        `<th class="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-100 sticky top-0 border-b border-gray-200 z-10 shadow-sm">${h.replace(/_/g, ' ')}</th>`
    ).join('');
    dom.modalTableBody.innerHTML = data.map(item => `
        <tr class="border-b border-gray-200 hover:bg-gray-50 transition duration-150">
            ${headers.map(h => {
                let value = item[h];
                if (value === null || value === undefined) value = '';
                if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) value = formatDate(value);
                return `<td class="py-3 px-4 text-sm text-gray-800 whitespace-nowrap" title="${item[h] || ''}">${value}</td>`;
            }).join('')}
        </tr>`).join('');
}

function _renderModalPaginationControls() {
    if (dom.modalPaginationControls && !dom.modalPaginationControls.querySelector('button')) {
        dom.modalPaginationControls.innerHTML = `
            <button id="modalPrevPageBtn" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed">Página Anterior</button>
            <span id="modalPageInfo" class="text-gray-700 font-medium"></span>
            <button id="modalNextPageBtn" class="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed">Próxima Página</button>
        `;
    }

    const totalRows = state.getModalTotalRows();
    const totalPages = Math.ceil(totalRows / state.MODAL_ROWS_PER_PAGE);

    if (totalPages <= 1 && totalRows > 0) {
        if (dom.modalPaginationControls) dom.modalPaginationControls.classList.add('hidden');
        return;
    }

    const pageInfo = document.getElementById('modalPageInfo');
    const prevBtn = document.getElementById('modalPrevPageBtn');
    const nextBtn = document.getElementById('modalNextPageBtn');

    if (!dom.modalPaginationControls || !pageInfo || !prevBtn || !nextBtn) return;

    pageInfo.textContent = `Página ${state.getModalCurrentPage()} de ${totalPages} (${totalRows} registros)`;
    prevBtn.disabled = state.getModalCurrentPage() <= 1;
    nextBtn.disabled = state.getModalCurrentPage() >= totalPages;
    dom.modalPaginationControls.classList.remove('hidden');
}
