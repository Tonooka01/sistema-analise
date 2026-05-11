/**
 * utils/feedback.js
 * Funções de feedback visual (loading, erro) e tratamento de erros de fetch.
 */

import * as dom from '../dom.js';

export function showLoading(show) {
    if (dom.dashboardContentDiv) {
        dom.dashboardContentDiv.classList.toggle('hidden', show);
        if (dom.mainChartsArea) dom.mainChartsArea.classList.toggle('hidden', show);
    }
    if (dom.chartLoadingDiv) dom.chartLoadingDiv.classList.toggle('hidden', !show);
    if (dom.chartErrorMsgDiv) dom.chartErrorMsgDiv.classList.add('hidden');
}

export function showError(message) {
    if (dom.chartLoadingDiv) dom.chartLoadingDiv.classList.add('hidden');
    if (dom.dashboardContentDiv) dom.dashboardContentDiv.classList.add('hidden');
    if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden');
    if (dom.chartErrorTextSpan) dom.chartErrorTextSpan.textContent = message;
    if (dom.chartErrorMsgDiv) dom.chartErrorMsgDiv.classList.remove('hidden');
    console.error("Erro exibido no painel:", message);
}

export async function handleFetchError(response, defaultMessage) {
    let errorMessage = defaultMessage;
    try {
        const errorData = await response.json();
        if (errorData && (errorData.error || errorData.message)) {
            errorMessage = errorData.error || errorData.message;
        } else {
            errorMessage = `Erro HTTP: ${response.status} - ${response.statusText}`;
        }
    } catch (e) {
        errorMessage = `Erro HTTP: ${response.status} - ${response.statusText}`;
    }
    return errorMessage;
}
