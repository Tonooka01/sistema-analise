/**
 * collections/logins.js
 * Gráficos da coleção Logins.
 */
import { addAndRenderChartWidget } from '../charts.js';

export function renderLoginsCharts(data) {
    if (data.by_transmitter && data.by_transmitter.length > 0) {
        addAndRenderChartWidget(
            'mainChart1', 'bar_horizontal',
            data.by_transmitter.map(i => i.Transmissor),
            [{ data: data.by_transmitter.map(i => i.Count) }],
            'Logins Únicos por Transmissor',
            { formatterType: 'number' },
            [{ value: 'bar_horizontal', label: 'Barra H', checked: true }, { value: 'doughnut', label: 'Rosca' }, { value: 'bar_vertical', label: 'Barra V' }]
        );
    } else console.warn("Dados 'by_transmitter' ausentes para Logins.");

    if (data.by_plan && data.by_plan.length > 0) {
        addAndRenderChartWidget(
            'mainChart2', 'bar_horizontal',
            data.by_plan.map(i => i.Contrato),
            [{ data: data.by_plan.map(i => i.Count) }],
            'Top 20 Planos por Nº de Logins',
            { formatterType: 'number' },
            [{ value: 'bar_horizontal', label: 'Barra H', checked: true }, { value: 'doughnut', label: 'Rosca' }, { value: 'bar_vertical', label: 'Barra V' }]
        );
    } else console.warn("Dados 'by_plan' ausentes para Logins.");
}
