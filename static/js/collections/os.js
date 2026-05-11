/**
 * collections/os.js
 * Gráficos da coleção OS (Ordens de Serviço).
 */
import { addAndRenderChartWidget } from '../charts.js';

const _statusColorsOS = { 'Pendente': '#f59e0b', 'Em Andamento': '#3b82f6', 'Solucionado': '#22c55e', 'Cancelado': '#6b7280' };

export function renderOsCharts(data, filterText, monthNames) {
    const { status_by_subject, mom_summary, avg_service_time_by_city } = data;

    if (status_by_subject && status_by_subject.length > 0) {
        const subjects = [...new Set(status_by_subject.map(i => i.Assunto))];
        const statuses  = [...new Set(status_by_subject.map(i => i.Status))];
        const datasets  = statuses.map(status => ({
            label: status,
            data: subjects.map(subj => status_by_subject.find(s => s.Assunto === subj && s.Status === status)?.Count || 0),
            backgroundColor: _statusColorsOS[status] || '#94a3b8'
        }));
        addAndRenderChartWidget(
            'mainChart6', 'bar_vertical', subjects, datasets,
            'Status de OS por Assunto',
            { scales: { x: { stacked: true }, y: { stacked: true } }, formatterType: 'number' },
            [{ value: 'bar_vertical', label: 'Barra V', checked: true }, { value: 'bar_horizontal', label: 'Barra H' }]
        );
    } else console.warn("Dados 'status_by_subject' ausentes para OS.");

    if (mom_summary && mom_summary.length > 0) {
        const sorted = [...mom_summary].sort((a, b) => parseInt(a.Month) - parseInt(b.Month));
        addAndRenderChartWidget(
            'mainChart4', 'line',
            sorted.map(i => monthNames[parseInt(i.Month) - 1]),
            [{ data: sorted.map(i => i.Total_Count) }],
            `Evolução Mensal de OS ${filterText}`,
            { formatterType: 'number' },
            [{ value: 'line', label: 'Linha', checked: true }, { value: 'bar_vertical', label: 'Barra V' }, { value: 'bar_horizontal', label: 'Barra H' }]
        );
    }

    if (avg_service_time_by_city && avg_service_time_by_city.length > 0) {
        addAndRenderChartWidget(
            'mainChart7', 'bar_horizontal',
            avg_service_time_by_city.map(i => i.Cidade),
            [{ data: avg_service_time_by_city.map(i => i.Average_Service_Days) }],
            'Tempo Médio de Serviço por Cidade (dias)',
            { formatterType: 'days' },
            [{ value: 'bar_horizontal', label: 'Barra H', checked: true }, { value: 'line', label: 'Linha' }, { value: 'bar_vertical', label: 'Barra V' }]
        );
    }
}
