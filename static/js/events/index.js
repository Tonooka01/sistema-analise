/**
 * events/index.js
 * Monta todos os event listeners chamando os submódulos.
 * Exporta initializeEventListeners para ser chamado pelo main.js.
 */

import * as dom from '../dom.js';
import * as grid from '../grid.js';
import * as analysis from '../analysis.js';
import * as state from '../state.js';
import * as utils from '../utils.js';
import * as behaviorAnalysis from '../behaviorAnalysis.js';
import { renderChartsForCurrentCollection } from '../chartCollection.js';
import { exportTableToCSV } from '../utils.js';
import {
    openModal, closeModal,
    closeInvoiceDetailModal, closeDetailsModal, closeCancellationDetailModal,
    closeSellerDetailModal, closeCityDetailModal, closeNeighborhoodDetailModal,
    closeEquipmentDetailModal, closeSellerActivationDetailModal, closeActiveEquipmentDetailModal,
    fetchAndRenderTabData
} from '../modals.js';
import * as customCharts from '../customAnalysisCharts.js';

import { setupCustomAnalysisListeners } from './customAnalysis.js';
import { setupPaginationListeners } from './pagination.js';
import { setupDelegationListeners } from './delegation.js';
import { renderCashflowDashboard } from '../cashflow.js';
import { renderDreDashboard } from '../dre.js';
import { renderDre2Dashboard } from '../dre2.js';
import { renderCrescimento } from '../crescimento.js';

export function initializeEventListeners() {

    // --- Salvar Layout ---
    dom.saveLayoutBtn?.addEventListener('click', grid.saveLayout);

    // --- Botão Cashflow ---
    document.getElementById('btnCashflow')?.addEventListener('click', e => {
        utils.resetAllFilters();
        utils.setActiveControl(e.target);
        if (dom.customAnalysisSelector) dom.customAnalysisSelector.value = '';
        utils.hideAllCustomFilters();
        if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden');
        if (dom.dashboardContentDiv) {
            dom.dashboardContentDiv.classList.remove('hidden');
            renderCashflowDashboard(dom.dashboardContentDiv);
        }
    });

    // --- Botão DRE ---
    document.getElementById('btnDRE')?.addEventListener('click', e => {
        utils.resetAllFilters();
        utils.setActiveControl(e.target);
        if (dom.customAnalysisSelector) dom.customAnalysisSelector.value = '';
        utils.hideAllCustomFilters();
        if (dom.viewTableBtn) dom.viewTableBtn.classList.add('hidden');
        if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden');
        if (dom.dashboardContentDiv) {
            dom.dashboardContentDiv.classList.remove('hidden');
            renderDreDashboard(dom.dashboardContentDiv);
        }
    });

    // --- Botão Gestão Financeira (DRE2) ---
    document.getElementById('btnDRE2')?.addEventListener('click', e => {
        utils.resetAllFilters();
        utils.setActiveControl(e.target);
        if (dom.customAnalysisSelector) dom.customAnalysisSelector.value = '';
        utils.hideAllCustomFilters();
        if (dom.viewTableBtn) dom.viewTableBtn.classList.add('hidden');
        if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden');
        if (dom.dashboardContentDiv) {
            dom.dashboardContentDiv.classList.remove('hidden');
            renderDre2Dashboard(dom.dashboardContentDiv);
        }
    });

    // --- Botão Crescimento Analítico ---
    document.getElementById('btnCrescimento')?.addEventListener('click', e => {
        utils.resetAllFilters();
        utils.setActiveControl(e.target);
        if (dom.customAnalysisSelector) dom.customAnalysisSelector.value = '';
        utils.hideAllCustomFilters();
        if (dom.viewTableBtn) dom.viewTableBtn.classList.add('hidden');
        if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden');
        if (dom.dashboardContentDiv) {
            dom.dashboardContentDiv.classList.remove('hidden');
            renderCrescimento(dom.dashboardContentDiv);
        }
    });

    // --- Seletores de Coleção Principal (botões azuis) ---
    document.querySelector('.collection-selector')?.addEventListener('click', e => {
        const _excluded = ['saveLayoutBtn','btnCashflow','btnDRE','btnDRE2','btnCrescimento'];
        if (e.target.tagName === 'BUTTON' && e.target.id && !_excluded.includes(e.target.id)) {
            const buttonText = e.target.textContent;
            if (buttonText) {
                utils.resetAllFilters();
                utils.setActiveControl(e.target);
                if (dom.customAnalysisSelector) dom.customAnalysisSelector.value = '';
                utils.hideAllCustomFilters();
                analysis.fetchAndRenderMainAnalysis(buttonText.trim());
            }
        }
    });

    // --- Exportação CSV ---
    dom.exportTableBtn?.addEventListener('click', () => {
        const title = dom.modalTitle?.textContent || 'tabela_dados';
        exportTableToCSV('modalTable', `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`);
    });

    dom.exportInvoiceBtn?.addEventListener('click', () => {
        const table = dom.invoiceDetailContent?.querySelector('table');
        if (table) {
            if (!table.id) table.id = 'temp_invoice_table';
            exportTableToCSV(table.id, 'detalhes_fatura.csv');
        }
    });

    // --- Botão Ver Tabela / Modal ---
    dom.viewTableBtn?.addEventListener('click', () => {
        const selectedAnalysis = dom.customAnalysisSelector?.value;
        const supportedCustomModalAnalyses = [
            'saude_financeira_contrato_atraso', 'saude_financeira_contrato_bloqueio',
            'cancellations', 'negativacao'
        ];
        if (supportedCustomModalAnalyses.includes(selectedAnalysis)) {
            openModal(selectedAnalysis);
        } else {
            openModal(state.getModalCurrentCollection());
        }
    });

    // --- Fechar Modais ---
    const closeButtonMap = [
        { button: dom.modalCloseButton,                   closeFn: closeModal },
        { button: dom.invoiceDetailCloseButton,           closeFn: closeInvoiceDetailModal },
        { button: dom.detailsModalCloseButton,            closeFn: closeDetailsModal },
        { button: dom.cancellationDetailCloseButton,      closeFn: closeCancellationDetailModal },
        { button: dom.sellerDetailCloseButton,            closeFn: closeSellerDetailModal },
        { button: dom.cityDetailCloseButton,              closeFn: closeCityDetailModal },
        { button: dom.neighborhoodDetailCloseButton,      closeFn: closeNeighborhoodDetailModal },
        { button: dom.equipmentDetailCloseButton,         closeFn: closeEquipmentDetailModal },
        { button: dom.sellerActivationDetailCloseButton,  closeFn: closeSellerActivationDetailModal },
        { button: dom.activeEquipmentDetailCloseButton,   closeFn: closeActiveEquipmentDetailModal },
    ];
    closeButtonMap.forEach(({ button, closeFn }) => button?.addEventListener('click', closeFn));

    // --- Abas do modal de detalhes ---
    dom.detailsModalTabs?.addEventListener('click', e => {
        e.preventDefault();
        const tabLink = e.target.closest('.tab-link');
        if (tabLink && !tabLink.classList.contains('active')) {
            const tabName = tabLink.dataset.tab;
            dom.detailsModalTabs.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
            dom.detailsModalTabContent?.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            tabLink.classList.add('active');
            const targetPane = document.getElementById(`tab-content-${tabName}`);
            if (targetPane) { targetPane.classList.add('active'); fetchAndRenderTabData(tabName, 1); }
        }
    });

    // --- Abas de behaviorAnalysis ---
    dom.behaviorAnalysisTabs?.addEventListener('click', e => {
        e.preventDefault();
        const tabLink = e.target.closest('.tab-link');
        if (tabLink && !tabLink.classList.contains('active')) {
            behaviorAnalysis.handleBehaviorTabChange(tabLink.dataset.tab);
        }
    });

    // --- Mudança de tipo de gráfico (radio buttons) ---
    dom.dashboardContentWrapper?.addEventListener('change', e => {
        if (e.target.matches('input[type="radio"]') && e.target.closest('.chart-type-options')) {
            if (state.getGlobalCurrentAnalysisData()) renderChartsForCurrentCollection();
            const currentCustomAnalysis = state.getCustomAnalysisState().currentAnalysis;
            if (currentCustomAnalysis === 'faturamento_por_cidade') {
                customCharts.fetchAndRenderBillingByCityAnalysis(
                    dom.faturamentoStartDate?.value || '',
                    dom.faturamentoEndDate?.value || '',
                    dom.faturamentoCityFilter?.value || ''
                );
            }
        }
    });

    // --- Submódulos ---
    setupCustomAnalysisListeners();
    setupPaginationListeners();
    setupDelegationListeners();

    console.log("Todos os event listeners inicializados.");
}
