/**
 * utils/render.js
 * Funções de renderização genérica (cards, tabelas, paginação).
 */

import { formatDate } from './format.js';

export function renderSummaryCards(targetElement, cardsData) {
    if (!targetElement) return;
    if (!cardsData || !Array.isArray(cardsData) || cardsData.length === 0) {
        targetElement.innerHTML = '';
        return;
    }
    const cardsHtml = cardsData.map(card => {
        let displayValue = card.value;
        if (typeof card.value === 'number' && card.formatAsCurrency) {
            displayValue = new Intl.NumberFormat('pt-BR', {
                style: 'currency', currency: 'BRL',
                minimumFractionDigits: 2, maximumFractionDigits: 2
            }).format(card.value);
        } else if (card.value === undefined || card.value === null) {
            displayValue = 'N/A';
        }
        return `
            <div class="summary-card ${card.colorClass || 'bg-gray-100'}">
                <h3 class="summary-card-title">${card.title || 'Título'}</h3>
                <p class="summary-card-value">${displayValue}</p>
            </div>
        `;
    }).join('');

    const container = document.createElement('div');
    container.className = 'summary-cards-container';
    container.innerHTML = cardsHtml;
    targetElement.innerHTML = '';
    targetElement.appendChild(container);
}

export function renderGenericDetailTable(contentElement, data, columns, returnHtml = false) {
    if (!data || !Array.isArray(data)) {
        const html = '<p class="text-center text-gray-500 p-4">Dados inválidos ou vazios.</p>';
        if (returnHtml) return html;
        if (contentElement) contentElement.innerHTML = html;
        return;
    }
    if (!columns || !Array.isArray(columns) || columns.length === 0) {
        const html = '<p class="text-center text-red-500 p-4">Erro: Configuração de colunas ausente.</p>';
        if (returnHtml) return html;
        if (contentElement) contentElement.innerHTML = html;
        return;
    }

    const tableHtml = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead>
                <tr>
                    ${columns.map(c => `<th class="py-2 px-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider ${c.cssClass || ''}">${c.header || ''}</th>`).join('')}
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                ${data.length === 0
                    ? `<tr><td colspan="${columns.length}" class="text-center py-4 text-gray-500">Nenhum dado encontrado.</td></tr>`
                    : data.map(row => `
                        <tr class="hover:bg-gray-50">
                            ${columns.map(c => {
                                let value = 'N/A';
                                let tooltipText = '';
                                try {
                                    if (c.render && typeof c.render === 'function') {
                                        value = c.render(row) ?? 'N/A';
                                        if (c.key && row.hasOwnProperty(c.key)) {
                                            tooltipText = String(row[c.key]);
                                        } else {
                                            const tmp = document.createElement('div');
                                            tmp.innerHTML = value;
                                            tooltipText = tmp.textContent || tmp.innerText || '';
                                        }
                                    } else if (c.key && row.hasOwnProperty(c.key)) {
                                        value = row[c.key] ?? 'N/A';
                                        tooltipText = String(value);
                                        if (c.isDate) {
                                            value = formatDate(value);
                                        } else if (c.isCurrency) {
                                            value = new Intl.NumberFormat('pt-BR', {
                                                style: 'currency', currency: 'BRL',
                                                minimumFractionDigits: 2, maximumFractionDigits: 2
                                            }).format(Number(value) || 0);
                                        } else if (['permanencia_dias', 'Average_Resolution_Days', 'Average_Service_Days'].includes(c.key) && typeof value === 'number') {
                                            value = value.toFixed(1);
                                        }
                                    }
                                } catch (e) {
                                    console.error(`Erro ao renderizar coluna ${c.header || c.key}:`, e, "Linha:", row);
                                    value = 'Erro';
                                }
                                const displayValue = (value === null || value === undefined || value === '') ? 'N/A' : String(value);
                                if (tooltipText === 'N/A' || tooltipText === '') tooltipText = null;
                                return `<td class="py-2 px-3 text-sm text-gray-800 ${c.cssClass || ''}" ${tooltipText ? `title="${tooltipText.replace(/"/g, '&quot;')}"` : ''}>${displayValue}</td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
            </tbody>
        </table>
    `;

    if (returnHtml) return tableHtml;
    if (contentElement) contentElement.innerHTML = tableHtml;
}

export function renderGenericPagination(paginationEl, pageInfoEl, prevBtnEl, nextBtnEl, stateObj) {
    if (!paginationEl || !pageInfoEl || !prevBtnEl || !nextBtnEl || !stateObj) {
        if (paginationEl) paginationEl.classList.add('hidden');
        return;
    }
    const totalPages = Math.ceil(stateObj.totalRows / stateObj.rowsPerPage);
    if (totalPages > 1 && stateObj.totalRows > 0) {
        pageInfoEl.textContent = `Página ${stateObj.currentPage} de ${totalPages}`;
        prevBtnEl.disabled = stateObj.currentPage <= 1;
        nextBtnEl.disabled = stateObj.currentPage >= totalPages;
        paginationEl.classList.remove('hidden');
    } else {
        paginationEl.classList.add('hidden');
        pageInfoEl.textContent = '';
        prevBtnEl.disabled = true;
        nextBtnEl.disabled = true;
    }
}

export function createGenericPaginationHtml(buttonClass, stateObj) {
    if (!stateObj || stateObj.totalRows === undefined || stateObj.currentPage === undefined || stateObj.rowsPerPage === undefined) {
        console.error("createGenericPaginationHtml: Estado inválido.");
        return '';
    }
    const totalPages = Math.ceil(stateObj.totalRows / stateObj.rowsPerPage);
    if (totalPages <= 1) return '';
    return `
        <div class="pagination-controls flex justify-center items-center gap-4 mt-8">
            <button class="${buttonClass} bg-gray-200 text-gray-700 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed" data-page="${stateObj.currentPage - 1}" ${stateObj.currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
            <span class="text-gray-700 font-medium">Página ${stateObj.currentPage} de ${totalPages}</span>
            <button class="${buttonClass} bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed" data-page="${stateObj.currentPage + 1}" ${stateObj.currentPage >= totalPages ? 'disabled' : ''}>Próxima</button>
        </div>
    `;
}
