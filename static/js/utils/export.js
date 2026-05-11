/**
 * utils/export.js
 * Exportação de tabelas para CSV.
 */

import { showError } from './feedback.js';

export function exportTableToCSV(tableId, filename = 'exportacao.csv') {
    const table = document.getElementById(tableId);
    if (!table) { showError("Tabela não encontrada para exportação."); return; }

    const rows = table.querySelectorAll("tr");
    let csvContent = "";
    rows.forEach(row => {
        const cols = row.querySelectorAll("th, td");
        const rowData = [];
        cols.forEach(col => {
            let data = col.innerText.replace(/(\r\n|\n|\r)/gm, " ").replace(/"/g, '""');
            rowData.push(`"${data}"`);
        });
        csvContent += rowData.join(";") + "\r\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
