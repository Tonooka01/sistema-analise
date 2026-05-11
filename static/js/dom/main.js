/**
 * dom/main.js
 * Referências principais: área de conteúdo, seletores, botões de layout.
 */

export let dashboardContentWrapper;
export let dashboardContentDiv;
export let mainChartsArea;
export let chartLoadingDiv;
export let chartErrorMsgDiv;
export let chartErrorTextSpan;

export let collectionSelectorButtons;
export let customAnalysisSelector;
export let saveLayoutBtn;
export let viewTableBtn;

export function initMainDom() {
    dashboardContentWrapper = document.getElementById('dashboard-content-wrapper');
    dashboardContentDiv     = document.getElementById('dashboard-content');
    mainChartsArea          = document.getElementById('main-charts-area');
    chartLoadingDiv         = document.getElementById('chart-loading');
    chartErrorMsgDiv        = document.getElementById('chart-error-message');
    chartErrorTextSpan      = document.getElementById('chart-error-text');

    collectionSelectorButtons = document.querySelectorAll('.collection-selector button:not(#saveLayoutBtn)');
    customAnalysisSelector    = document.getElementById('customAnalysisSelector');
    saveLayoutBtn             = document.getElementById('saveLayoutBtn');
    viewTableBtn              = document.getElementById('viewTableBtn');
}
