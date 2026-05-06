/**
 * tables/shared.js
 * Helpers compartilhados e renderCustomTable com registry de paginação.
 * Cada módulo de análise registra sua função de fetch via registerFetchFn().
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import * as utils from '../utils.js';

// --- Registry para changePage (evita dependência circular) ---
const _fetchRegistry = {};

/**
 * Registra a função de fetch de uma análise para ser chamada na troca de página.
 * @param {string} analysisType - Valor de currentAnalysis (ex: 'cancellations')
 * @param {function} fn - Função (stateSnapshot, newPage) => void
 */
export function registerFetchFn(analysisType, fn) {
    _fetchRegistry[analysisType] = fn;
}

// --- Helper: Download CSV/Excel ---
export function downloadCSV(data, filename) {
    if (!data || data.length === 0) {
        utils.showError('Sem dados para exportar.');
        return;
    }
    const separator = ';';
    const keys = Object.keys(data[0]);
    const csvContent = [
        keys.join(separator),
        ...data.map(row => keys.map(k => {
            let val = row[k] === null || row[k] === undefined ? '' : String(row[k]);
            val = val.replace(/"/g, '""').replace(/\n/g, ' ');
            return `"${val}"`;
        }).join(separator))
    ].join('\n');

    const blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- Helper: Badge de Comportamento de Pagamento ---
export function getPaymentBehaviorBadge(avgDays) {
    if (avgDays === null || avgDays === undefined)
        return '<span class="text-xs text-gray-400 mt-1 block">Sem histórico</span>';

    const days = Math.round(avgDays);

    if (days <= -1)
        return `<span class="text-xs font-semibold text-green-700 mt-1 bg-green-100 px-2 py-0.5 rounded-full w-fit block" title="Média: ${days} dias">Adiantado (${Math.abs(days)} dias)</span>`;
    if (days === 0)
        return `<span class="text-xs font-semibold text-gray-600 mt-1 bg-gray-100 px-2 py-0.5 rounded-full w-fit block">Em dia</span>`;
    if (days <= 5)
        return `<span class="text-xs font-semibold text-yellow-700 mt-1 bg-yellow-100 px-2 py-0.5 rounded-full w-fit block">Atraso Curto (+${days} dias)</span>`;
    if (days <= 15)
        return `<span class="text-xs font-semibold text-orange-700 mt-1 bg-orange-100 px-2 py-0.5 rounded-full w-fit block">Atraso Médio (+${days} dias)</span>`;
    if (days <= 30)
        return `<span class="text-xs font-semibold text-red-700 mt-1 bg-red-100 px-2 py-0.5 rounded-full w-fit block">Atraso Longo (+${days} dias)</span>`;

    return `<span class="text-xs font-bold text-white mt-1 bg-red-800 px-2 py-0.5 rounded-full w-fit block">Inadimplente Provável (+${days} dias)</span>`;
}

// --- Filtros de Status de Contrato ---
export async function populateContractStatusFilters() {
    if (dom.contractStatusFilter && dom.contractStatusFilter.options.length > 1) return;

    try {
        const response = await fetch(`${state.API_BASE_URL}/api/filters/contract_statuses`);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Falha ao buscar status.'));
        const data = await response.json();

        if (dom.contractStatusFilter && data.status_contrato) {
            const currentValue = dom.contractStatusFilter.value;
            dom.contractStatusFilter.innerHTML = '<option value="">Todos</option>';
            data.status_contrato.forEach(status => {
                const option = document.createElement('option');
                option.value = status;
                option.textContent = status;
                dom.contractStatusFilter.appendChild(option);
            });
            if (currentValue) dom.contractStatusFilter.value = currentValue;
        }

        if (dom.accessStatusContainer && data.status_acesso) {
            if (dom.accessStatusContainer.children.length > 0 && dom.accessStatusContainer.querySelector('input')) return;
            dom.accessStatusContainer.innerHTML = '';
            data.status_acesso.forEach(status => {
                const wrapper = document.createElement('div');
                wrapper.className = 'flex items-center mb-1 hover:bg-gray-50 p-1 rounded';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = status;
                checkbox.className = 'mr-2 form-checkbox h-4 w-4 text-purple-600 transition duration-150 ease-in-out cursor-pointer';
                const uniqueId = `chk_access_${status.replace(/\s+/g, '_')}`;
                checkbox.id = uniqueId;
                if (status === 'Ativo') checkbox.checked = true;

                const label = document.createElement('label');
                label.textContent = status;
                label.htmlFor = uniqueId;
                label.className = 'text-gray-700 cursor-pointer select-none w-full text-xs';

                wrapper.appendChild(checkbox);
                wrapper.appendChild(label);
                dom.accessStatusContainer.appendChild(wrapper);
            });
        }
    } catch (error) {
        console.error("Erro ao popular filtros de status:", error);
    }
}

// --- Paginação ---
export function renderCustomAnalysisPagination() {
    const currentState = state.getCustomAnalysisState();
    const totalPages = Math.ceil(currentState.totalRows / currentState.rowsPerPage);

    const pageInfo = document.getElementById('customPageInfo');
    const prevBtn = document.getElementById('customPrevPageBtn');
    const nextBtn = document.getElementById('customNextPageBtn');
    const paginationControls = document.getElementById('custom-analysis-pagination-controls');

    if (paginationControls) {
        if (totalPages > 1 && currentState.totalRows > 0) {
            if (pageInfo) pageInfo.textContent = `Página ${currentState.currentPage} de ${totalPages} (${currentState.totalRows} registros)`;
            if (prevBtn) prevBtn.disabled = currentState.currentPage <= 1;
            if (nextBtn) nextBtn.disabled = currentState.currentPage >= totalPages;
            paginationControls.classList.remove('hidden');
        }
    }
}

// --- Tabela Genérica com Paginação ---
export function renderCustomTable(result, title, columns, extraContentHtml = '') {
    const { data, total_rows } = result;
    state.setCustomAnalysisState({ totalRows: total_rows });

    const currentState = state.getCustomAnalysisState();

    if (!dom.dashboardContentDiv) return;

    const titleHtml = `<h2 class="text-2xl font-semibold mb-4 text-gray-800">${title}</h2>`;

    let activeFilterHtml = '';
    if (currentState.chartFilterColumn && currentState.chartFilterValue) {
        let colName = currentState.chartFilterColumn === 'motivo' ? 'Motivo' :
                      currentState.chartFilterColumn === 'obs' ? 'Observação' : 'Financeiro';
        activeFilterHtml = `
            <div class="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-md mb-4 flex justify-between items-center">
                <span>Filtrado por <strong>${colName}: ${currentState.chartFilterValue}</strong></span>
                <button id="clearChartFilterBtn" class="text-sm font-bold text-blue-800 hover:text-blue-900 underline">Limpar Filtro</button>
            </div>
        `;
    }

    if (extraContentHtml) activeFilterHtml += extraContentHtml;

    let tableHtml = '<p class="text-center text-gray-500 mt-4">Nenhum resultado encontrado.</p>';
    if (data && data.length > 0) {
        const generatedTableHtml = utils.renderGenericDetailTable(null, data, columns, true);
        tableHtml = `<div class="table-wrapper border rounded-lg shadow-sm bg-white">${generatedTableHtml}</div>`;
    }

    let paginationHtml = '';
    const totalPages = Math.ceil(currentState.totalRows / currentState.rowsPerPage);

    if (totalPages > 1) {
        paginationHtml = `
            <div id="custom-analysis-pagination-controls" class="pagination-controls flex flex-wrap justify-center items-center gap-4 mt-8">
                <button id="customPrevPageBtn" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed">Página Anterior</button>
                <span id="customPageInfo" class="text-gray-700 font-medium"></span>
                <button id="customNextPageBtn" class="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed">Próxima Página</button>
            </div>
        `;
    }

    let tableContainer = document.getElementById('custom-table-container');
    if (!tableContainer) {
        tableContainer = document.createElement('div');
        tableContainer.id = 'custom-table-container';
        dom.dashboardContentDiv.appendChild(tableContainer);
    }

    tableContainer.innerHTML = activeFilterHtml + titleHtml + tableHtml + paginationHtml;

    if (totalPages > 1) renderCustomAnalysisPagination();

    const prevBtn = document.getElementById('customPrevPageBtn');
    const nextBtn = document.getElementById('customNextPageBtn');

    if (prevBtn && nextBtn) {
        prevBtn.addEventListener('click', () => _changePage(currentState.currentPage - 1));
        nextBtn.addEventListener('click', () => _changePage(currentState.currentPage + 1));
    }

    const clearBtn = document.getElementById('clearChartFilterBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            state.setCustomAnalysisState({ chartFilterColumn: null, chartFilterValue: null });
            const s = state.getCustomAnalysisState();
            const fn = _fetchRegistry[s.currentAnalysis];
            if (fn) fn(s, 1);
        });
    }
}

function _changePage(newPage) {
    if (newPage < 1) return;
    const s = state.getCustomAnalysisState();
    const fn = _fetchRegistry[s.currentAnalysis];
    if (fn) fn(s, newPage);
}
