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

// ── Tooltip global para gráficos empilhados ───────────────────────────────────
window._ctrTipShow = function(el, label, month, val, color) {
    let t = document.getElementById('_ctr_tooltip');
    if (!t) {
        t = document.createElement('div');
        t.id = '_ctr_tooltip';
        t.style.cssText = 'position:fixed;background:#1e293b;color:#fff;padding:8px 14px;border-radius:10px;font-size:.82rem;pointer-events:none;z-index:10000;display:none;box-shadow:0 4px 16px rgba(0,0,0,.25);line-height:1.6;white-space:nowrap;';
        document.body.appendChild(t);
    }
    t.innerHTML = `<div style="font-size:.7rem;color:#94a3b8;margin-bottom:1px;">${month}</div>`
        + `<div style="display:flex;align-items:center;gap:6px;font-weight:700;">`
        + `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};"></span>${label}</div>`
        + `<div style="font-size:1.05rem;font-weight:800;margin-top:2px;">${val}</div>`;
    const r = el.getBoundingClientRect();
    t.style.display = 'block';
    t.style.left = (r.left + r.width / 2) + 'px';
    t.style.top  = (r.top - 8) + 'px';
    t.style.transform = 'translate(-50%,-100%)';
};
window._ctrTipHide = function() {
    const t = document.getElementById('_ctr_tooltip');
    if (t) t.style.display = 'none';
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

// ── Vendas section helpers ────────────────────────────────────────────────────
function _vendasSection(vd) {
    if (!vd || vd.error) {
        const msg = vd?.error || 'Dados de vendas indisponíveis';
        return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 22px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
            <div style="font-size:.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">📦 Vendas — App de Vendas</div>
            <div style="color:#9ca3af;font-size:.85rem;text-align:center;padding:16px;">⚠️ ${msg}</div>
        </div>`;
    }

    const ma = vd.mes_atual;
    const mp = vd.mes_passado;
    const tot = vd.totais;

    // KPI bar
    const kpis = `
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
            ${_kpi('📦','Novas vendas — mês', _fmt(ma.vendas_ok),
                `vs mês anterior: ${_pct(ma.vendas_ok, mp.vendas_ok)}`,
                _deltaClass(ma.vendas_ok, mp.vendas_ok), '#10b981')}
            ${_kpi('💵','Receita MRR gerada', _fmtBRL(ma.receita_mrr),
                `vs mês anterior: ${_pct(ma.receita_mrr, mp.receita_mrr)}`,
                _deltaClass(ma.receita_mrr, mp.receita_mrr), '#059669')}
            ${_kpi('🎯','Taxa de conversão', `${ma.taxa_conversao}%`,
                `${_fmt(ma.vendas_ok)} ok de ${_fmt(ma.total_vendas)} tentativas`, '#6b7280', '#f59e0b')}
            ${_kpi('🌱','Base ativa (total)', _fmt(tot.contratos_ativos),
                `MRR total: ${_fmtBRL(tot.mrr_total)}`, '#6b7280', '#3b82f6')}
        </div>`;

    // Monthly chart — count of new sales
    const mLabels = vd.monthly.map(r => _monthLabel(r.mes));
    const mDs = [
        { label: 'Novas vendas', color: '#10b981', data: vd.monthly.map(r => r.vendas_ok) },
    ];
    const monthlyChart = `
        <div style="margin-bottom:16px;">
            <div style="font-size:.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">📊 Evolução mensal — novas vendas</div>
            ${_barSVGCount(mLabels, mDs, { h: 180 })}
        </div>`;

    // Ranking por vendedor
    const rankHtml = vd.por_vendedor.length ? `
        <div>
            <div style="font-size:.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">🏆 Ranking por vendedor — este mês</div>
            <table style="width:100%;border-collapse:collapse;font-size:.8rem;">
                <thead><tr style="border-bottom:2px solid #e5e7eb;">
                    <th style="text-align:left;padding:7px 8px;color:#6b7280;font-size:.68rem;text-transform:uppercase;">Vendedor</th>
                    <th style="text-align:right;padding:7px 8px;color:#6b7280;font-size:.68rem;">Vendas</th>
                    <th style="text-align:right;padding:7px 8px;color:#6b7280;font-size:.68rem;">Tentativas</th>
                    <th style="text-align:right;padding:7px 8px;color:#6b7280;font-size:.68rem;">Conv.</th>
                    <th style="text-align:right;padding:7px 8px;color:#6b7280;font-size:.68rem;">Receita</th>
                </tr></thead>
                <tbody>
                    ${vd.por_vendedor.map((v, i) => {
                        const conv = v.total_tentativas > 0
                            ? Math.round(v.vendas_ok / v.total_tentativas * 100) + '%' : '—';
                        return `<tr style="border-bottom:1px solid #f3f4f6;">
                            <td style="padding:7px 8px;font-weight:${i<3?'700':'400'};color:#1f2937;">
                                ${i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`} ${v.vendedor}
                            </td>
                            <td style="text-align:right;padding:7px 8px;font-weight:700;color:#059669;">${_fmt(v.vendas_ok)}</td>
                            <td style="text-align:right;padding:7px 8px;color:#6b7280;">${_fmt(v.total_tentativas)}</td>
                            <td style="text-align:right;padding:7px 8px;color:#6b7280;">${conv}</td>
                            <td style="text-align:right;padding:7px 8px;font-weight:700;color:#059669;">${_fmtBRL(v.receita)}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>` : '<div style="color:#9ca3af;text-align:center;padding:16px;font-size:.85rem;">Nenhuma venda neste mês</div>';

    return `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 22px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
            <div style="font-size:.7rem;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px;border-bottom:2px solid #d1fae5;padding-bottom:8px;">
                📦 Vendas — Novas Conexões
            </div>
            ${kpis}
            <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:16px;">
                ${monthlyChart}
                ${rankHtml}
            </div>
        </div>`;
}

// Count-based bar chart (numbers, not BRL)
function _barSVGCount(labels, datasets, opts = {}) {
    const W = 500, H = opts.h || 180, PAD_L = 36, PAD_R = 12, PAD_T = 14, PAD_B = 30;
    const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
    const n = labels.length;
    if (!n) return '<div style="color:#9ca3af;text-align:center;padding:24px;">Sem dados</div>';

    const maxVal = Math.max(...datasets.flatMap(d => d.data), 1);
    const barW   = Math.max(8, (plotW / n) * 0.6);
    const gap    = plotW / n;

    const gridLines = [0.25, 0.5, 0.75, 1].map(f => {
        const y = PAD_T + plotH - f * plotH;
        const v = Math.round(maxVal * f);
        return `<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="#f3f4f6" stroke-width="1"/>
                <text x="${PAD_L - 4}" y="${y + 4}" font-size="9" fill="#9ca3af" text-anchor="end">${v}</text>`;
    }).join('');

    const xLabels = labels.map((lbl, i) => {
        const x = PAD_L + i * gap + gap / 2;
        return `<text x="${x}" y="${PAD_T + plotH + 14}" font-size="9" fill="#9ca3af" text-anchor="middle">${lbl}</text>`;
    }).join('');

    const bars = datasets.flatMap(ds =>
        ds.data.map((v, i) => {
            const h = (v / maxVal) * plotH;
            const x = PAD_L + i * gap + gap / 2 - barW / 2;
            const y = PAD_T + plotH - h;
            return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
                fill="${ds.color}" rx="3" opacity="0.9"/>
                ${h > 16 ? `<text x="${(x+barW/2).toFixed(1)}" y="${(y-3).toFixed(1)}" font-size="8" fill="#374151" text-anchor="middle">${v}</text>` : ''}`;
        })
    ).join('');

    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;overflow:visible;">
        ${gridLines}${xLabels}${bars}
    </svg>`;
}

// ── Painel global: visão geral da base ───────────────────────────────────────
function _painelGlobal(p, vd, roi) {
    if (!p || p.error) return '';
    const c  = p.contratos;
    const m  = p.mrr;
    const nv = vd?.mes_atual?.vendas_ok ?? '—';
    const nvAnt = vd?.mes_passado?.vendas_ok ?? 0;
    return `
        <div style="margin-bottom:20px;">
            <div style="font-size:.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">
                📊 Visão Geral da Operação
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:12px;">
                ${_kpi('💰','MRR este mês', _fmtBRL(m.mrr_mes),
                    `vs mês anterior: ${_pct(m.mrr_mes, m.mrr_ant)}`,
                    _deltaClass(m.mrr_mes, m.mrr_ant), '#1d4ed8')}
                ${_kpi('👥','Contratos ativos', _fmt(c.ativos),
                    `Base total de contratos ativos`, '#6b7280', '#059669')}
                ${_kpi('🚨','Cancelamentos este mês', _fmt(c.cancel_mes),
                    `vs mês anterior: ${_pct(c.cancel_mes, c.cancel_ant)}`,
                    c.cancel_mes <= c.cancel_ant ? '#16a34a' : '#dc2626', '#ef4444')}
                ${_kpi('⚠️','Negativações este mês', _fmt(p.negativacoes.mes),
                    `vs mês anterior: ${_pct(p.negativacoes.mes, p.negativacoes.ant)}`,
                    p.negativacoes.mes <= p.negativacoes.ant ? '#16a34a' : '#dc2626', '#f59e0b')}
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 20px;flex:1;min-width:155px;box-shadow:0 1px 4px rgba(0,0,0,.06);border-top:3px solid #dc2626;">
                    <div style="font-size:1.4rem;margin-bottom:4px;">💸</div>
                    <div style="font-size:.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">Faturas em aberto</div>
                    <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
                        <div>
                            <div style="font-size:.6rem;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Mês atual</div>
                            <div style="font-size:1.1rem;font-weight:800;color:#1e3a5f;line-height:1.1;">${_fmtBRL(m.aberto_mes_valor)}</div>
                            <div style="font-size:.68rem;color:#dc2626;">${_fmt(m.aberto_mes_qty)} faturas</div>
                        </div>
                        <div style="border-top:1px solid #f3f4f6;padding-top:4px;">
                            <div style="font-size:.6rem;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">Mês anterior</div>
                            <div style="font-size:1.1rem;font-weight:800;color:#374151;line-height:1.1;">${_fmtBRL(m.aberto_ant_valor)}</div>
                            <div style="font-size:.68rem;color:#9ca3af;">${_fmt(m.aberto_ant_qty)} faturas</div>
                        </div>
                    </div>
                </div>
                ${_kpi('📦','Novas vendas este mês', _fmt(nv),
                    `vs mês anterior: ${_pct(nv, nvAnt)}`,
                    nv >= nvAnt ? '#16a34a' : '#dc2626', '#10b981')}
            </div>
        </div>`;
}

// ── Cancelamentos: cidades, bairros, evolução ─────────────────────────────────
function _painelCancelamentos(p) {
    if (!p || p.error) return '';

    const cidadesHtml = p.top_cidades.length ? p.top_cidades.map((r, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f3f4f6;">
            <span style="font-size:.7rem;color:#9ca3af;min-width:16px;">${i+1}.</span>
            <span style="flex:1;font-size:.8rem;color:#1f2937;font-weight:${i<3?'600':'400'};">${r.Cidade || r.cidade || '—'}</span>
            <span style="font-size:.8rem;font-weight:700;color:#dc2626;">${_fmt(r.total)}</span>
        </div>`).join('')
        : '<div style="color:#9ca3af;font-size:.8rem;padding:12px 0;text-align:center;">Sem dados</div>';

    const bairrosHtml = p.top_bairros.length ? p.top_bairros.map((r, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f3f4f6;">
            <span style="font-size:.7rem;color:#9ca3af;min-width:16px;">${i+1}.</span>
            <span style="flex:1;font-size:.8rem;color:#1f2937;font-weight:${i<3?'600':'400'};">${r.Bairro || r.bairro || '—'}</span>
            <span style="font-size:.8rem;font-weight:700;color:#dc2626;">${_fmt(r.total)}</span>
        </div>`).join('')
        : '<div style="color:#9ca3af;font-size:.8rem;padding:12px 0;text-align:center;">Sem dados</div>';

    // Dual-axis bar: MRR + cancelamentos por mês
    const allMes = new Set([
        ...(p.mrr_ev  || []).map(r => r.mes),
        ...(p.cancel_ev || []).map(r => r.mes),
    ]);
    const sortedMes = [...allMes].sort();
    const mrrByMes    = Object.fromEntries((p.mrr_ev    || []).map(r => [r.mes, r.receita]));
    const cancelByMes = Object.fromEntries((p.cancel_ev || []).map(r => [r.mes, r.total]));
    const labels = sortedMes.map(m => _monthLabel(m));
    const cancelDs = [{ label: 'Cancelamentos', color: '#ef4444', data: sortedMes.map(m => cancelByMes[m] || 0) }];

    return `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 22px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
            <div style="font-size:.7rem;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px;border-bottom:2px solid #fee2e2;padding-bottom:8px;">
                🚨 Cancelamentos e Negativações (últimos 3 meses)
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                <div>
                    <div style="font-size:.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">📍 Por Cidade</div>
                    ${cidadesHtml}
                </div>
                <div>
                    <div style="font-size:.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">🏘️ Por Bairro</div>
                    ${bairrosHtml}
                </div>
            </div>
            <div style="border-top:1px solid #f3f4f6;padding-top:14px;">
                <div style="font-size:.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">📊 Evolução mensal — cancelamentos (12 meses)</div>
                ${_barSVGCount(labels, cancelDs, { h: 160 })}
            </div>
        </div>`;
}

// ── Stacked bar SVG ───────────────────────────────────────────────────────────
function _stackedBarSVG(labels, datasets, opts = {}) {
    const n = labels.length;
    if (!n) return '<div style="color:#9ca3af;text-align:center;padding:24px;">Sem dados</div>';
    const W = Math.max(680, n * 90), H = opts.h || 240;
    const PAD_L = 70, PAD_R = 16, PAD_T = 20, PAD_B = 36;
    const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
    const totals = labels.map((_, i) => datasets.reduce((s, d) => s + (d.data[i] || 0), 0));
    const maxVal = Math.max(...totals, 1);
    const barW = Math.min(80, (plotW / n) * 0.6);
    const gap  = plotW / n;
    const fmtV = v => v >= 1e6 ? `R$${(v/1e6).toFixed(2)}M` : v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${Math.round(v)}`;
    const gridLines = [0.25, 0.5, 0.75, 1].map(f => {
        const y = PAD_T + plotH - f * plotH;
        return `<line x1="${PAD_L}" y1="${y}" x2="${W-PAD_R}" y2="${y}" stroke="#f3f4f6" stroke-width="1"/>
                <text x="${PAD_L-4}" y="${y+4}" font-size="10" fill="#9ca3af" text-anchor="end">${fmtV(maxVal*f)}</text>`;
    }).join('');
    const xLabels = labels.map((lbl, i) => {
        const x = PAD_L + i * gap + gap / 2;
        return `<text x="${x}" y="${PAD_T+plotH+16}" font-size="10" fill="#6b7280" text-anchor="middle">${lbl}</text>`;
    }).join('');
    const bars = labels.map((lbl_month, i) => {
        const cx = PAD_L + i * gap + gap / 2;
        const x  = cx - barW / 2;
        let yBase = PAD_T + plotH;
        return datasets.map(ds => {
            const v = ds.data[i] || 0;
            if (!v) return '';
            const h = (v / maxVal) * plotH;
            const y = yBase - h;
            yBase = y;
            const shortLbl  = fmtV(v);
            const fullVal   = v.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
            const tipAttrs  = `onmouseenter="_ctrTipShow(this,'${ds.label}','${lbl_month}','${fullVal}','${ds.color}')" onmouseleave="_ctrTipHide()" style="cursor:pointer;"`;
            return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${ds.color}" rx="2" opacity="0.92" ${tipAttrs}/>
                    ${h > 22 ? `<text x="${cx.toFixed(1)}" y="${(y+h/2+4).toFixed(1)}" font-size="9" fill="#fff" text-anchor="middle" font-weight="700" style="pointer-events:none;">${shortLbl}</text>` : ''}`;
        }).join('');
    }).join('');
    const legend = datasets.map(ds =>
        `<span style="display:inline-flex;align-items:center;gap:5px;font-size:.74rem;color:#374151;margin-right:14px;">
            <span style="display:inline-block;width:13px;height:13px;border-radius:3px;background:${ds.color};"></span>${ds.label}
        </span>`
    ).join('');
    return `<div style="overflow-x:auto;">
        <svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W,680)}px;width:100%;height:auto;overflow:visible;">${gridLines}${xLabels}${bars}</svg>
    </div>
    <div style="margin-top:8px;display:flex;flex-wrap:wrap;">${legend}</div>`;
}

function _buildCtrDatasets(rows, sortedMes) {
    const STATUS = [
        { key: 'Recebido',  color: '#16a34a', label: 'Recebido' },
        { key: 'A receber', color: '#f59e0b', label: 'A receber' },
        { key: 'Cancelado', color: '#6b7280', label: 'Cancelado' },
    ];
    const byMesSt = {};
    (rows || []).forEach(r => {
        const k = `${r.mes}|${r.status_norm}`;
        byMesSt[k] = (byMesSt[k] || 0) + (r.total || 0);
    });
    return STATUS.map(s => ({
        label: s.label, color: s.color,
        data: sortedMes.map(m => byMesSt[`${m}|${s.key}`] || 0),
    }));
}

// ── Contas a Receber charts ───────────────────────────────────────────────────
function _painelFinanceiro(p) {
    if (!p || p.error) return '';
    const allMes = new Set([
        ...(p.ctr_pag_ev  || []).map(r => r.mes),
        ...(p.ctr_cred_ev || []).map(r => r.mes),
    ]);
    const sortedMes = [...allMes].filter(Boolean).sort();
    if (!sortedMes.length) return '';
    const labels    = sortedMes.map(m => _monthLabel(m));
    const dsPag     = _buildCtrDatasets(p.ctr_pag_ev,  sortedMes);
    const dsCred    = _buildCtrDatasets(p.ctr_cred_ev, sortedMes);

    const _chartCard = (title, datasets) => `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 22px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
            <div style="font-size:.7rem;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px;border-bottom:2px solid #dbeafe;padding-bottom:8px;">
                💸 ${title}
            </div>
            ${_stackedBarSVG(labels, datasets, { h: 240 })}
        </div>`;

    return _chartCard('Contas a Receber — Pagamento', dsPag)
         + _chartCard('Contas a Receber — Data Crédito', dsCred);
}

// ── ChatMix card (usado dentro de _painelOperacional) ─────────────────────────
function _chatmixCard(cm) {
    if (!cm) return _kpi('🎧','Atendimentos ChatMix','—','Sem dados do Assistente','#9ca3af','#0ea5e9');

    const dtStr = cm.criado_em
        ? new Date(cm.criado_em.replace(' ','T')).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
        : '';

    const deptos = Object.entries(cm.por_departamento || {}).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const maxDep = deptos.length ? deptos[0][1] : 1;
    const deptoRows = deptos.map(([nome,qty]) => {
        const pct = Math.round((qty/maxDep)*100);
        return `<div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;">
            <span style="font-size:.7rem;color:#374151;min-width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${nome}">${nome}</span>
            <div style="flex:1;background:#e5e7eb;border-radius:4px;height:9px;overflow:hidden;">
                <div style="width:${pct}%;background:#0ea5e9;height:100%;border-radius:4px;"></div>
            </div>
            <span style="font-size:.72rem;font-weight:600;color:#111827;min-width:24px;text-align:right;">${qty}</span>
        </div>`;
    }).join('');

    const motivos = Object.entries(cm.principais_motivos || {}).slice(0,4);
    const chips = motivos.map(([nome,qty]) =>
        `<span style="display:inline-flex;align-items:center;gap:3px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:20px;padding:2px 7px;font-size:.67rem;color:#0369a1;margin:2px;">${nome} <b>${qty}</b></span>`
    ).join('');

    const durStr = cm.duracao_media_min ? `Duração média: ${Math.round(cm.duracao_media_min)} min` : '';

    return `<div style="background:#fff;border-radius:16px;padding:18px 20px;flex:1;min-width:280px;box-shadow:0 1px 4px rgba(0,0,0,.07);border:1px solid #e5e7eb;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
            <span style="font-size:1.3rem;">🎧</span>
            <span style="font-weight:700;font-size:.95rem;color:#111827;">Atendimentos ChatMix</span>
            <span style="margin-left:auto;font-size:1.8rem;font-weight:800;color:#0ea5e9;">${_fmt(cm.encerrados)}</span>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
            <div style="text-align:center;background:#f0fdf4;border-radius:10px;padding:5px 12px;">
                <div style="font-size:1.05rem;font-weight:700;color:#15803d;">${cm.em_atendimento}</div>
                <div style="font-size:.63rem;color:#166534;">Em atend.</div>
            </div>
            <div style="text-align:center;background:#fffbeb;border-radius:10px;padding:5px 12px;">
                <div style="font-size:1.05rem;font-weight:700;color:#b45309;">${cm.fila_espera}</div>
                <div style="font-size:.63rem;color:#92400e;">Fila</div>
            </div>
            <div style="text-align:center;background:#f1f5f9;border-radius:10px;padding:5px 12px;">
                <div style="font-size:1.05rem;font-weight:700;color:#334155;">${cm.em_automacao}</div>
                <div style="font-size:.63rem;color:#475569;">Automação</div>
            </div>
        </div>
        ${deptoRows ? `<div style="font-size:.68rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px;">Por departamento</div>${deptoRows}` : ''}
        ${chips ? `<div style="margin-top:7px;font-size:.68rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">Principais motivos</div><div>${chips}</div>` : ''}
        <div style="margin-top:7px;font-size:.67rem;color:#9ca3af;">${[durStr, dtStr ? 'Ref.: '+dtStr : ''].filter(Boolean).join(' · ')}</div>
    </div>`;
}

// ── Operacional: OS + Atendimentos ────────────────────────────────────────────
function _painelOperacional(p) {
    if (!p || p.error) return '';
    const os         = p.os         || { total: 0, abertas: 0 };
    const assuntos   = p.os_assuntos || [];
    const atend      = p.atendimentos || { mes: 0, ant: 0 };
    const alertColor = os.abertas > 50 ? '#dc2626' : '#16a34a';

    const maxVal = assuntos.length ? assuntos[0].total : 1;
    const assuntoRows = assuntos.map(a => {
        const pct = Math.round((a.total / maxVal) * 100);
        const barColor = a.assunto.includes('INADIM') ? '#f59e0b'
                       : a.assunto.includes('RETIRADA') ? '#ef4444'
                       : a.assunto.includes('INSTALA') ? '#3b82f6'
                       : a.assunto.includes('MANUTEN') ? '#8b5cf6'
                       : '#64748b';
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
            <span style="font-size:.72rem;color:#374151;min-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${a.assunto}">${a.assunto}</span>
            <div style="flex:1;background:#e5e7eb;border-radius:4px;height:10px;overflow:hidden;">
                <div style="width:${pct}%;background:${barColor};height:100%;border-radius:4px;"></div>
            </div>
            <span style="font-size:.75rem;font-weight:600;color:#111827;min-width:28px;text-align:right;">${a.total}</span>
        </div>`;
    }).join('');

    return `
        <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:flex-start;">
            <div style="background:#fff;border-radius:16px;padding:18px 20px;flex:1;min-width:300px;box-shadow:0 1px 4px rgba(0,0,0,.07);border:1px solid #e5e7eb;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
                    <span style="font-size:1.3rem;">🔧</span>
                    <span style="font-weight:700;font-size:.95rem;color:#111827;">OS Abertas</span>
                    <span style="margin-left:auto;font-size:1.8rem;font-weight:800;color:${alertColor};">${_fmt(os.abertas)}</span>
                </div>
                ${assuntoRows || '<span style="font-size:.8rem;color:#9ca3af;">Sem dados</span>'}
            </div>
            ${_chatmixCard(p.chatmix)}
        </div>`;
}

// ── Main render ───────────────────────────────────────────────────────────────
export async function renderROIDashboard(container) {
    if (!container) return;
    container.innerHTML = `
        <div style="padding:28px 24px;background:#f8fafc;min-height:100%;">
            <div style="text-align:center;color:#9ca3af;padding:40px;font-size:.95rem;">⏳ Carregando Dashboard ROI...</div>
        </div>`;

    let cfg, stats, vendasStats, painel;
    try {
        const [rc, rs, rv, rp] = await Promise.all([
            fetch('/api/roi/config'),
            fetch('/api/roi/stats'),
            fetch('/api/roi/vendas/stats'),
            fetch('/api/painel/resumo'),
        ]);
        cfg         = await rc.json();
        stats       = await rs.json();
        vendasStats = rv.ok ? await rv.json() : { error: 'Falha ao carregar dados de vendas' };
        painel      = rp.ok ? await rp.json() : null;
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
                    <h2 style="font-size:1.2rem;font-weight:800;color:#1e3a5f;margin:0;">📊 Painel Executivo</h2>
                    <div style="font-size:.75rem;color:#6b7280;margin-top:3px;">Visão consolidada: MRR · Clientes · Cancelamentos · ROI Cobranças · Vendas · Financeiro</div>
                </div>
                <button onclick="window._roiRefresh && window._roiRefresh()"
                    style="font-size:.75rem;border:1px solid #d1d5db;background:#fff;border-radius:8px;padding:6px 14px;cursor:pointer;color:#374151;">🔄 Atualizar</button>
            </div>

            <!-- Visão Geral da base -->
            ${_painelGlobal(painel, vendasStats, d)}

            <!-- Alertas Operacionais -->
            ${_painelOperacional(painel)}

            <!-- ROI cobranças — KPI cards (separados da visão geral) -->
            <div style="font-size:.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">
                💡 ROI Cobranças — Valor Gerado pela Equipe
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

            <!-- Seção Vendas -->
            ${_vendasSection(vendasStats)}

            <!-- Cancelamentos / Churn -->
            ${_painelCancelamentos(painel)}

            <!-- MRR evolution -->
            ${_painelFinanceiro(painel)}

            <!-- Disclaimer -->
            <div style="font-size:.7rem;color:#9ca3af;text-align:center;padding:8px;border-top:1px solid #e5e7eb;">
                ⚠️ Valores <strong>estimados</strong> com base nos resultados registrados pela equipe.
                Cobranças confirmadas têm alta confiança; mensagens e retenções são projeções estatísticas.
                Configure os parâmetros em ⚙️ Configurações → aba 💡 ROI para ajustar à realidade da empresa.
            </div>

        </div>`;

    window._roiRefresh = () => renderROIDashboard(container);
}
