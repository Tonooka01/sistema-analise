/**
 * collections/contratos.js
 * Gráficos da coleção Contratos.
 */
import { addAndRenderChartWidget } from '../charts.js';

export function renderContratosCharts(data, filterText, currentCity) {
    if (data.by_status && data.by_status.length > 0) {
        addAndRenderChartWidget(
            'mainChart1', 'doughnut',
            data.by_status.map(i => i.Status_contrato || 'N/A'),
            [{ data: data.by_status.map(i => i.Count) }],
            `Contratos por Status ${filterText}`,
            { formatterType: 'number' },
            [
                { value: 'doughnut', label: 'Rosca', checked: true },
                { value: 'bar_vertical', label: 'Barra V' },
                { value: 'bar_horizontal', label: 'Barra H' }
            ]
        );
    } else console.warn("Dados 'by_status' ausentes ou vazios para Contratos.");

    if (data.by_access_status && data.by_access_status.length > 0) {
        addAndRenderChartWidget(
            'mainChart2', 'doughnut',
            data.by_access_status.map(i => i.Status_acesso || 'N/A'),
            [{ data: data.by_access_status.map(i => i.Count) }],
            `Contratos por Status de Acesso ${filterText}`,
            { formatterType: 'number' },
            [
                { value: 'doughnut', label: 'Rosca', checked: true },
                { value: 'bar_vertical', label: 'Barra V' },
                { value: 'bar_horizontal', label: 'Barra H' }
            ]
        );
    } else console.warn("Dados 'by_access_status' ausentes ou vazios para Contratos.");

    if (currentCity && data.by_status_by_city && data.by_access_status_by_city) {
        const cityStatusData = data.by_status_by_city.filter(i => i.Cidade === currentCity);
        const cityAccessData = data.by_access_status_by_city.filter(i => i.Cidade === currentCity);

        if (cityStatusData.length > 0) {
            addAndRenderChartWidget(
                'mainChart3', 'doughnut',
                cityStatusData.map(d => d.Status_contrato),
                [{ data: cityStatusData.map(d => d.Count) }],
                `Status Contrato em ${currentCity} ${filterText}`,
                { formatterType: 'number' },
                [
                    { value: 'doughnut', label: 'Rosca', checked: true },
                    { value: 'bar_vertical', label: 'Barra V' },
                    { value: 'bar_horizontal', label: 'Barra H' }
                ]
            );
        } else console.warn(`Dados 'by_status_by_city' ausentes para ${currentCity}.`);

        if (cityAccessData.length > 0) {
            addAndRenderChartWidget(
                'mainChart4', 'doughnut',
                cityAccessData.map(d => d.Status_acesso),
                [{ data: cityAccessData.map(d => d.Count) }],
                `Status Acesso em ${currentCity} ${filterText}`,
                { formatterType: 'number' },
                [
                    { value: 'doughnut', label: 'Rosca', checked: true },
                    { value: 'bar_vertical', label: 'Barra V' },
                    { value: 'bar_horizontal', label: 'Barra H' }
                ]
            );
        } else console.warn(`Dados 'by_access_status_by_city' ausentes para ${currentCity}.`);
    }
}
