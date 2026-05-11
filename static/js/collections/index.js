/**
 * collections/index.js
 * Dispatcher — decide qual módulo de coleção renderizar.
 * Substitui a função renderChartsForCurrentCollection do chartCollection.js.
 */

import * as state from '../state.js';
import { renderClientesCharts } from './clientes.js';
import { renderContratosCharts } from './contratos.js';
import { renderContasReceberCharts } from './contasReceber.js';
import { renderAtendimentosCharts } from './atendimentos.js';
import { renderOsCharts } from './os.js';
import { renderLoginsCharts } from './logins.js';

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function renderChartsForCurrentCollection() {
    const data = state.getGlobalCurrentAnalysisData();
    if (!data) { console.warn("Nenhum dado de análise global encontrado."); return; }

    const grid = state.getGridStack();
    if (!grid) { console.error("GridStack não inicializado."); return; }

    const currentCollection = state.getModalCurrentCollection();
    const currentYear  = state.getCurrentSelectedYear();
    const currentMonth = state.getCurrentSelectedMonth();
    const currentCity  = state.getCurrentSelectedCity();
    const filterText   = `(${currentYear || 'Todos'}${currentMonth ? '/' + currentMonth : ''})`;

    switch (currentCollection) {
        case 'Clientes':
            renderClientesCharts(data);
            break;
        case 'Contratos':
            renderContratosCharts(data, filterText, currentCity);
            break;
        case 'Contas a Receber':
            renderContasReceberCharts(data, filterText, MONTH_NAMES);
            break;
        case 'Atendimentos':
            renderAtendimentosCharts(data, filterText, MONTH_NAMES);
            break;
        case 'OS':
            renderOsCharts(data, filterText, MONTH_NAMES);
            break;
        case 'Logins':
            renderLoginsCharts(data);
            break;
        default:
            console.warn(`Nenhuma configuração de gráfico para a coleção: ${currentCollection}`);
    }
}
