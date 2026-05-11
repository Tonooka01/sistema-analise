/**
 * collections/atendimentos.js
 * Gráficos da coleção Atendimentos.
 */
import { addAndRenderChartWidget } from '../charts.js';

export function renderAtendimentosCharts(data, filterText, monthNames) {
    if (data.status_summary && data.status_summary.length > 0) {
        addAndRenderChartWidget(
            'mainChart1', 'doughnut',
            data.status_summary.map(i => i.Status),
            [{ data: data.status_summary.map(i => i.Count) }],
            'Atendimentos por Status',
            { formatterType: 'number' },
            [{ value: 'doughnut', label: 'Rosca', checked: true }, { value: 'bar_vertical', label: 'Barra V' }, { value: 'bar_horizontal', label: 'Barra H' }]
        );
    } else console.warn("Dados 'status_summary' ausentes para Atendimentos.");

    if (data.subject_ranking && data.subject_ranking.length > 0) {
        addAndRenderChartWidget(
            'mainChart2', 'bar_horizontal',
            data.subject_ranking.map(i => i.Assunto),
            [{ data: data.subject_ranking.map(i => i.Count) }],
            'Top 10 Assuntos Mais Comuns',
            { formatterType: 'number' },
            [{ value: 'bar_horizontal', label: 'Barra H', checked: true }, { value: 'doughnut', label: 'Rosca' }, { value: 'bar_vertical', label: 'Barra V' }]
        );
    } else console.warn("Dados 'subject_ranking' ausentes para Atendimentos.");

    if (data.yoy_summary && data.yoy_summary.length > 0) {
        addAndRenderChartWidget(
            'mainChart3', 'line',
            data.yoy_summary.map(i => i.Year),
            [{ data: data.yoy_summary.map(i => i.Total_Count) }],
            'Evolução Anual de Atendimentos',
            { formatterType: 'number' },
            [{ value: 'line', label: 'Linha', checked: true }, { value: 'bar_vertical', label: 'Barra V' }, { value: 'bar_horizontal', label: 'Barra H' }]
        );
    }

    if (data.mom_summary && data.mom_summary.length > 0) {
        const sorted = [...data.mom_summary].sort((a, b) => parseInt(a.Month) - parseInt(b.Month));
        addAndRenderChartWidget(
            'mainChart4', 'line',
            sorted.map(i => monthNames[parseInt(i.Month) - 1]),
            [{ data: sorted.map(i => i.Total_Count) }],
            `Evolução Mensal ${filterText}`,
            { formatterType: 'number' },
            [{ value: 'line', label: 'Linha', checked: true }, { value: 'bar_vertical', label: 'Barra V' }, { value: 'bar_horizontal', label: 'Barra H' }]
        );
    }

    if (data.avg_resolution_time_by_subject && data.avg_resolution_time_by_subject.length > 0) {
        addAndRenderChartWidget(
            'mainChart5', 'bar_vertical',
            data.avg_resolution_time_by_subject.map(i => i.Assunto),
            [{ data: data.avg_resolution_time_by_subject.map(i => i.Average_Resolution_Days) }],
            'Tempo Médio de Resolução por Assunto (dias)',
            { formatterType: 'days' },
            [{ value: 'bar_vertical', label: 'Barra V', checked: true }, { value: 'line', label: 'Linha' }, { value: 'bar_horizontal', label: 'Barra H' }]
        );
    }
}
