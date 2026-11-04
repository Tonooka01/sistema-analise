/**
 * roi_dashboard.js — Dashboard ROI / Valor do Sistema
 * Renderiza dentro do dashboardContentDiv (mesmo padrão do DRE, Crescimento)
 */

const _fmtBRL = v => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const _fmt    = v => (v ?? 0).toLocaleString('pt-BR');
const _pct    = (a, b) => {
    if (!b) return a > 0 ? '+∞%' : '—';
    const p = Math.round(((a - b) / b) * 100);
    return (p >= 0 ? '+' : '') + p + '%';
};
const _deltaClass = (a, b) => a >= b ? '#16a34a' : '#dc2626';
const _monthLabel = m => {
    if (!m) return '';
    const [y, mo] = m.split('-');
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${months[parseInt(mo) - 1]}/${y.slice(2)}`;
};

// ── Bar chart SVG inline ──────────────────────────────────────────────────────
function _barSVG(labels, datasets, opts = {}) {
    const W = 680, H = opts.h || 200, PAD_L = 48, PAD_R = 12, PAD_T = 14, PAD_B = 36;
    const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
    const n = labels.length;
    if (!n) return '<div style="color:#9ca3af;text-align:center;padding:24px;">Sem dados</div>';

    const maxVal = Math.max(...datasets.flatMap(d => d.data), 1);
    const barW   = Math.max(8, (plotW / n) * 0.6);
    const gap    = plotW / n;

    const gridLines = [0.25, 0.5, 0.75, 1].map(f => {
        const y = PAD_T + plotH - f * plotH;
        const v = maxVal * f;
        const lbl = v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${Math.round(v)}`;
        return `<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="#f3f4f6" stroke-width="1"/>
                <text x="${PAD_L - 4}" y="${y + 4}" font-size="9" fill="#9ca3af" text-anchor="end">${lbl}</text>`;
    }).join('');

    const xLabels = labels.map((lbl, i) => {
        const x = PAD_L + i * gap + gap / 2;
        return `<text x="${x}" y="${PAD_T + plotH + 14}" font-size="9" fill="#9ca3af" text-anchor="middle">${lbl}</text>`;
    }).join('');

    const bars = datasets.flatMap((ds, di) => {
        const offset = datasets.length > 1 ? (di - (datasets.length - 1) / 2) * (barW / datasets.length + 1) : 0;
        const bw = datasets.length > 1 ? barW / datasets.length : barW;
        return ds.data.map((v, i) => {
            const h  = (v / maxVal) * plotH;
            const x  = PAD_L + i * gap + gap / 2 - bw / 2 + offset;
            const y  = PAD_T + plotH - h;
            const lbl = v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${Math.round(v)}`;
            return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"
                fill="${ds.color}" rx="3" opacity="0.9"/>
                ${h > 20 ? `<text x="${(x + bw/2).toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="8" fill="#374151" text-anchor="middle">${lbl}</text>` : ''}`;
        });
    }).join('');

    const legend = datasets.length > 1 ? datasets.map(ds =>
        `<span style="display:inline-flex;align-items:center;gap:5px;font-size:.72rem;color:#374151;margin-right:12px;">
            <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${ds.color};"></span>${ds.label}
        </span>`
    ).join('') : '';

    return `
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;overflow:visible;">
            ${gridLines}${xLabels}${bars}
        </svg>
        ${legend ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;">${legend}</div>` : ''}
    `;
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function _kpi(icon, label, val, sub, subColor, accent) {
    return `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 20px;flex:1;min-width:155px;
                    box-shadow:0 1px 4px rgba(0,0,0,.06);border-top:3px solid ${accent};">
            <div style="font-size:1.4rem;margin-bottom:4px;">${icon}</div>
            <div style="font-size:.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">${label}</div>
            <div style="font-size:1.55rem;font-weight:800;color:#1e3a5f;line-height:1.1;margin:4px 0;">${val}</div>
            <div style="font-size:.7rem;color:${subColor || '#6b7280'};">${sub}</div>
        </div>`;
}

// ── Category breakdown table ──────────────────────────────────────────────────
function _breakdown(d, cfg) {
    const rows = [
        {
            icon: '💬', cat: 'Cobranças confirmadas (pagou)',
            tipo: 'Resultado registrado pelo operador',
            qtd: d.mes_atual.pagou,
            formula: `${_fmt(d.mes_atual.pagou)} × R$${cfg.ticket_medio_cobranca.toFixed(2)} × ${(cfg.taxa_confirmacao_pagou * 100).toFixed(0)}%`,
            valor: d.mes_atual.valor_cobranca,
            confianca: 'Alta',
            corConf: '#16a34a',
        },
        {
            icon: '📱', cat: 'Mensagens WhatsApp enviadas',
            tipo: 'Taxa estimada de conversão 30%',
            qtd: d.mes_atual.msg_enviada,
            formula: `${_fmt(d.mes_atual.msg_enviada)} × R$${cfg.ticket_medio_cobranca.toFixed(2)} × ${(cfg.taxa_confirmacao_pagou * 100 * 0.3).toFixed(0)}%`,
            valor: d.mes_atual.valor_mensagem,
            confianca: 'Estimada',
            corConf: '#d97706',
        },
        {
            icon: '🤝', cat: 'Retenções (sucesso)',
            tipo: 'Cliente marcado como sucesso manteve mensalidade',
            qtd: d.mes_atual.sucesso,
            formula: `${_fmt(d.mes_atual.sucesso)} × R$${cfg.mensalidade_media.toFixed(2)} × 50%`,
            valor: d.mes_atual.valor_retencao,
            confianca: 'Estimada',
            corConf: '#d97706',
        },
    ];

    return `
        <table style="width:100%;border-collapse:collapse;font-size:.8rem;">
            <thead>
                <tr style="border-bottom:2px solid #e5e7eb;background:#f9fafb;">
                    <th style="text-align:left;padding:8px 10px;color:#6b7280;font-size:.68rem;text-transform:uppercase;">Categoria</th>
                    <th style="text-align:right;padding:8px 10px;color:#6b7280;font-size:.68rem;">Qtd</th>
                    <th style="padding:8px 10px;color:#6b7280;font-size:.68rem;">Cálculo</th>
                    <th style="text-align:right;padding:8px 10px;color:#6b7280;font-size:.68rem;">Valor Est.</th>
                    <th style="padding:8px 10px;color:#6b7280;font-size:.68rem;">Confiança</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(r => `
                <tr style="border-bottom:1px solid #f3f4f6;">
                    <td style="padding:9px 10px;">
                        <div style="font-weight:600;color:#1f2937;">${r.icon} ${r.cat}</div>
                        <div style="font-size:.68rem;color:#9ca3af;margin-top:1px;">${r.tipo}</div>
                    </td>
                    <td style="text-align:right;padding:9px 10px;font-weight:700;color:#1f2937;">${_fmt(r.qtd)}</td>
                    <td style="padding:9px 10px;color:#6b7280;font-size:.72rem;">${r.formula}</td>
                    <td style="text-align:right;padding:9px 10px;font-weight:700;color:#16a34a;">${_fmtBRL(r.valor)}</td>
                    <td style="padding:9px 10px;">
                        <span style="font-size:.7rem;font-weight:600;color:${r.corConf};background:${r.corConf}18;border-radius:4px;padding:2px 7px;">${r.confianca}</span>
                    </td>
                </tr>`).join('')}
                <tr style="border-top:2px solid #e5e7eb;background:#f9fafb;">
                    <td colspan="3" style="padding:9px 10px;font-weight:700;color:#1e3a5f;text-align:right;">Total estimado este mês</td>
                    <td style="text-align:right;padding:9px 10px;font-weight:800;font-size:1rem;color:#1e3a5f;">${_fmtBRL(d.mes_atual.valor_total)}</td>
                    <td></td>
                </tr>
            </tbody>
        </table>`;
}

// ── Main render ───────────────────────────────────────────────────────────────
export async function renderROIDashboard(container) {
    if (!container) return;
    container.innerHTML = `
        <div style="padding:28px 24px;background:#f8fafc;min-height:100%;">
            <div style="text-align:center;color:#9ca3af;padding:40px;font-size:.95rem;">⏳ Carregando Dashboard ROI...</div>
        </div>`;

    let cfg, stats;
    try {
        const [rc, rs] = await Promise.all([
            fetch('/api/roi/config'),
            fetch('/api/roi/stats'),
        ]);
        cfg   = await rc.json();
        stats = await rs.json();
    } catch (e) {
        container.innerHTML = `<div style="padding:40px;text-align:center;color:#ef4444;">Erro ao carregar dados: ${e.message}</div>`;
        return;
    }

    const d = stats;

    // Monthly bar chart data
    const labels  = d.monthly.map(r => _monthLabel(r.mes));
    const ds = [
        { label: 'Cobrança', color: '#3b82f6', data: d.monthly.map(r => r.valor_cobranca) },
        { label: 'Mensagem', color: '#10b981', data: d.monthly.map(r => r.valor_mensagem) },
        { label: 'Retenção', color: '#f59e0b', data: d.monthly.map(r => r.valor_retencao) },
    ];

    // User ranking
    const userRankHtml = d.por_usuario.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:.8rem;">
            <thead><tr style="border-bottom:2px solid #e5e7eb;">
                <th style="text-align:left;padding:7px 8px;color:#6b7280;font-size:.68rem;text-transform:uppercase;">Usuário</th>
                <th style="text-align:right;padding:7px 8px;color:#6b7280;font-size:.68rem;">Pagou</th>
                <th style="text-align:right;padding:7px 8px;color:#6b7280;font-size:.68rem;">Atend.</th>
                <th style="text-align:right;padding:7px 8px;color:#6b7280;font-size:.68rem;">Valor Est.</th>
            </tr></thead>
            <tbody>
                ${d.por_usuario.map((u, i) => `
                <tr style="border-bottom:1px solid #f3f4f6;">
                    <td style="padding:7px 8px;font-weight:${i<3?'700':'400'};color:#1f2937;">
                        ${i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`} ${u.usuario}
                    </td>
                    <td style="text-align:right;padding:7px 8px;color:#374151;">${_fmt(u.pagou)}</td>
                    <td style="text-align:right;padding:7px 8px;color:#374151;">${_fmt(u.total)}</td>
                    <td style="text-align:right;padding:7px 8px;font-weight:700;color:#16a34a;">${_fmtBRL(u.valor_total)}</td>
                </tr>`).join('')}
            </tbody>
        </table>` : '<div style="color:#9ca3af;text-align:center;padding:16px;font-size:.85rem;">Nenhum atendimento neste mês</div>';

    // ROI calc
    const custoMes = cfg.custo_operacional_mes || 0;
    const roiMes   = custoMes > 0 ? ((d.mes_atual.valor_total - custoMes) / custoMes * 100).toFixed(0) : null;

    container.innerHTML = `
        <div style="padding:24px;background:#f8fafc;min-height:100%;">

            <!-- Header -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
                <div>
                    <h2 style="font-size:1.2rem;font-weight:800;color:#1e3a5f;margin:0;">💡 Dashboard ROI — Valor do Sistema</h2>
                    <div style="font-size:.75rem;color:#6b7280;margin-top:3px;">Valor estimado gerado pela equipe utilizando o sistema</div>
                </div>
                <button onclick="window._roiRefresh && window._roiRefresh()"
                    style="font-size:.75rem;border:1px solid #d1d5db;background:#fff;border-radius:8px;padding:6px 14px;cursor:pointer;color:#374151;">🔄 Atualizar</button>
            </div>

            <!-- KPI cards -->
            <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
                ${_kpi('💰','Valor recuperado — este mês', _fmtBRL(d.mes_atual.valor_total),
                    `vs mês anterior: ${_pct(d.mes_atual.valor_total, d.mes_passado.valor_total)}`,
                    _deltaClass(d.mes_atual.valor_total, d.mes_passado.valor_total), '#3b82f6')}
                ${_kpi('📋','Cobranças confirmadas', _fmt(d.mes_atual.pagou),
                    `Valor: ${_fmtBRL(d.mes_atual.valor_cobranca)}`, '#6b7280', '#10b981')}
                ${_kpi('📱','Mensagens enviadas', _fmt(d.mes_atual.msg_enviada),
                    `Valor est.: ${_fmtBRL(d.mes_atual.valor_mensagem)}`, '#6b7280', '#8b5cf6')}
                ${_kpi('👥','Clientes contatados', _fmt(d.mes_atual.clientes_unicos),
                    `${_fmt(d.mes_atual.total_atend)} atendimentos no total`, '#6b7280', '#f59e0b')}
                ${_kpi('📈','Acumulado total', _fmtBRL(d.totais.valor_total),
                    `${_fmt(d.totais.total_atend)} atendimentos registrados`, '#6b7280', '#0ea5e9')}
                ${roiMes !== null ? _kpi('🎯','ROI este mês', `${roiMes}%`,
                    `Custo: ${_fmtBRL(custoMes)} · Retorno: ${_fmtBRL(d.mes_atual.valor_total)}`,
                    parseInt(roiMes) >= 0 ? '#16a34a' : '#dc2626', '#ef4444') : ''}
            </div>

            <!-- Monthly bar chart -->
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 22px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
                <div style="font-size:.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;">📊 Valor estimado por mês (últimos 12 meses)</div>
                ${_barSVG(labels, ds, { h: 220 })}
            </div>

            <!-- Breakdown + Ranking -->
            <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:16px;margin-bottom:20px;">
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 22px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
                    <div style="font-size:.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;">🔍 Breakdown — este mês</div>
                    ${_breakdown(d, cfg)}
                </div>
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 22px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
                    <div style="font-size:.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;">🏆 Ranking por valor — este mês</div>
                    ${userRankHtml}
                </div>
            </div>

            <!-- Disclaimer -->
            <div style="font-size:.7rem;color:#9ca3af;text-align:center;padding:8px;border-top:1px solid #e5e7eb;">
                ⚠️ Valores <strong>estimados</strong> com base nos resultados registrados pela equipe.
                Cobranças confirmadas têm alta confiança; mensagens e retenções são projeções estatísticas.
                Configure os parâmetros em ⚙️ Configurações → aba 💡 ROI para ajustar à realidade da empresa.
            </div>

        </div>`;

    window._roiRefresh = () => renderROIDashboard(container);
}
