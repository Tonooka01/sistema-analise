import { initializeEventListeners } from './events.js';
import { initializeGridStack, setupResponsiveGridStack } from './grid.js';
import { fetchAndRenderMainAnalysis } from './analysis.js';
import { setActiveControl } from './utils.js';
import * as dom from './dom.js';
import { initializeDom } from './dom.js';
import { renderCashflowDashboard } from './cashflow.js';

function initializeApp() {
    initializeDom();
    initializeGridStack();
    initializeEventListeners();

    // Tela inicial: Fluxo de Caixa
    const dashboardContent = dom.dashboardContentDiv;
    if (dashboardContent) {
        renderCashflowDashboard(dashboardContent);
    }

    setupResponsiveGridStack();
}

// Inicia o aplicativo quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initializeApp);