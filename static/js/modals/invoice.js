/**
 * modals/invoice.js
 * Modal de detalhes de fatura
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import { formatDate, handleFetchError, renderGenericDetailTable, renderGenericPagination } from '../utils.js';
import { renderChart } from '../charts.js';

export function openInvoiceDetailModal(contractId, clientName, type) {
    state.setCurrentInvoiceDetailContractId(contractId);
    state.setCurrentInvoiceDetailType(type);
    state.setInvoiceDetailCurrentPage(1);

    let typeText = '';
    if (type === 'atrasos_pagos')        typeText = 'Atrasos Pagos';
    else if (type === 'faturas_nao_pagas') typeText = 'Faturas Vencidas e Não Pagas';
    else if (type === 'all_invoices')    typeText = 'Todas as Faturas';

    if (dom.invoiceDetailModalTitle) dom.invoiceDetailModalTitle.textContent = `Detalhes: ${typeText} para ${clientName} (Contrato: ${contractId})`;
    if (dom.invoiceDetailModal) dom.invoiceDetailModal.classList.add('show');
    fetchAndDisplayInvoiceDetails(1);
}

export function closeInvoiceDetailModal() {
    if (dom.invoiceDetailModal) dom.invoiceDetailModal.classList.remove('show');
}

export async function fetchAndDisplayInvoiceDetails(page) {
    state.setInvoiceDetailCurrentPage(page);
    const offset = (page - 1) * state.INVOICE_DETAIL_ROWS_PER_PAGE;

    if (dom.invoiceDetailLoading) dom.invoiceDetailLoading.classList.remove('hidden');
    if (dom.invoiceDetailErrorDiv) dom.invoiceDetailErrorDiv.classList.add('hidden');
    if (dom.invoiceDetailContent) dom.invoiceDetailContent.innerHTML = '';
    if (dom.invoiceDetailPaginationControls) dom.invoiceDetailPaginationControls.classList.add('hidden');

    const url = `${state.API_BASE_URL}/api/details/invoice_details?contract_id=${state.getCurrentInvoiceDetailContractId()}&type=${state.getCurrentInvoiceDetailType()}&limit=${state.INVOICE_DETAIL_ROWS_PER_PAGE}&offset=${offset}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await handleFetchError(response, 'Não foi possível carregar os detalhes da fatura.'));
        const result = await response.json();
        state.setInvoiceDetailTotalRows(result.total_rows);
        _renderInvoiceDetailTable(result.data);
        _renderInvoiceDetailPagination();
    } catch (error) {
        console.error("Erro ao buscar detalhes da fatura:", error);
        if (dom.invoiceDetailErrorText) dom.invoiceDetailErrorText.textContent = `Erro: ${error.message}.`;
        if (dom.invoiceDetailErrorDiv) dom.invoiceDetailErrorDiv.classList.remove('hidden');
    } finally {
        if (dom.invoiceDetailLoading) dom.invoiceDetailLoading.classList.add('hidden');
    }
}

function _renderInvoiceDetailTable(data) {
    if (!dom.invoiceDetailContent) return;
    if (!data || data.length === 0) {
        dom.invoiceDetailContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum detalhe encontrado.</p>';
        return;
    }

    let adiantadoCount = 0, emDiaCount = 0, atrasadoCount = 0;
    data.forEach(row => {
        const payDate = row.Data_pagamento;
        const dueDate = row.Vencimento;
        if (payDate && dueDate) {
            try {
                const dPay = new Date(payDate.split(' ')[0]);
                const dDue = new Date(dueDate.split(' ')[0]);
                if (!isNaN(dPay) && !isNaN(dDue)) {
                    const diffDays = Math.ceil((dPay - dDue) / (1000 * 60 * 60 * 24));
                    if (diffDays > 0) atrasadoCount++;
                    else if (diffDays < 0) adiantadoCount++;
                    else emDiaCount++;
                }
            } catch (e) {}
        }
    });

    const totalPagos = adiantadoCount + emDiaCount + atrasadoCount;
    let chartHtml = '';
    if (totalPagos > 0) {
        chartHtml = `
            <div class="flex justify-center items-center mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div style="max-width: 300px; width: 100%;">
                    <h3 class="text-center text-sm font-semibold text-gray-600 mb-2">Comportamento de Pagamento (Página Atual)</h3>
                    <div class="chart-canvas-container" style="height: 200px; position: relative;">
                        <canvas id="invoicePaymentBehaviorChart"></canvas>
                    </div>
                </div>
            </div>
        `;
    }

    const columns = [
        { header: 'ID', key: 'ID' },
        { header: 'Emissão', key: 'Emissao', isDate: true },
        { header: 'Vencimento', key: 'Vencimento', isDate: true },
        { header: 'Data Pagamento', render: (row) => {
            const payDate = row.Data_pagamento;
            if (!payDate) return 'N/A';
            const formattedDate = formatDate(payDate);
            const dueDate = row.Vencimento;
            if (!dueDate) return formattedDate;
            try {
                const dPay = new Date(payDate.split(' ')[0]);
                const dDue = new Date(dueDate.split(' ')[0]);
                if (isNaN(dPay) || isNaN(dDue)) return formattedDate;
                const diffDays = Math.ceil((dPay - dDue) / (1000 * 60 * 60 * 24));
                let badge = '';
                if (diffDays > 0)      badge = `<span class="ml-2 text-xs font-bold text-red-600 bg-red-100 px-1 rounded border border-red-200" title="Atraso de ${diffDays} dias">+${diffDays}d</span>`;
                else if (diffDays < 0) badge = `<span class="ml-2 text-xs font-bold text-green-600 bg-green-100 px-1 rounded border border-green-200" title="Adiantado ${Math.abs(diffDays)} dias">${diffDays}d</span>`;
                else                   badge = `<span class="ml-2 text-xs font-bold text-gray-500 bg-gray-100 px-1 rounded border border-gray-200" title="Pago no dia">0d</span>`;
                return `<div class="flex items-center">${formattedDate}${badge}</div>`;
            } catch (e) { return formattedDate; }
        }},
        { header: 'Valor', key: 'Valor', isCurrency: true },
        { header: 'Status', key: 'Status' }
    ];

    dom.invoiceDetailContent.innerHTML = chartHtml + renderGenericDetailTable(null, data, columns, true);

    if (totalPagos > 0) {
        setTimeout(() => {
            renderChart('invoicePaymentBehaviorChart', 'pie',
                ['Adiantado', 'Em dia', 'Atrasado'],
                [{ data: [adiantadoCount, emDiaCount, atrasadoCount], backgroundColor: ['#10b981', '#6b7280', '#ef4444'], borderColor: '#ffffff', borderWidth: 2 }],
                '',
                { formatterType: 'percent_only', plugins: { legend: { position: 'bottom' } } }
            );
        }, 50);
    }
}

function _renderInvoiceDetailPagination() {
    renderGenericPagination(
        dom.invoiceDetailPaginationControls,
        dom.invoiceDetailPageInfo,
        dom.invoiceDetailPrevPageBtn,
        dom.invoiceDetailNextPageBtn,
        { currentPage: state.getInvoiceDetailCurrentPage(), totalRows: state.getInvoiceDetailTotalRows(), rowsPerPage: state.INVOICE_DETAIL_ROWS_PER_PAGE }
    );
}
