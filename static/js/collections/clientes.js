/**
 * collections/clientes.js
 * Gráficos da coleção Clientes.
 */
import { addAndRenderChartWidget } from '../charts.js';

export function renderClientesCharts(data) {
    if (data.by_city && data.by_city.length > 0) {
        addAndRenderChartWidget(
            'mainChart1', 'doughnut',
            data.by_city.map(i => i.Cidade || 'N/A'),
            [{ data: data.by_city.map(i => i.Count) }],
            'Top 20 Cidades por Cliente',
            { formatterType: 'number' },
            [
                { value: 'doughnut', label: 'Rosca', checked: true },
                { value: 'bar_vertical', label: 'Barra V' },
                { value: 'bar_horizontal', label: 'Barra H' }
            ]
        );
    } else console.warn("Dados 'by_city' ausentes ou vazios para Clientes.");

    if (data.by_neighborhood && data.by_neighborhood.length > 0) {
        addAndRenderChartWidget(
            'mainChart2', 'bar_horizontal',
            data.by_neighborhood.map(i => i.Bairro || 'N/A'),
            [{ data: data.by_neighborhood.map(i => i.Count) }],
            'Top 20 Bairros por Cliente',
            { formatterType: 'number' },
            [
                { value: 'bar_horizontal', label: 'Barra H', checked: true },
                { value: 'doughnut', label: 'Rosca' },
                { value: 'bar_vertical', label: 'Barra V' }
            ]
        );
    } else console.warn("Dados 'by_neighborhood' ausentes ou vazios para Clientes.");
}
