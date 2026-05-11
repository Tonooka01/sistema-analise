/**
 * utils/format.js
 * Funções de formatação de dados (data, moeda).
 */

export function formatDate(dateString) {
    if (!dateString || dateString === 'N/A') return 'N/A';
    try {
        const datePart = dateString.split(' ')[0];
        const date = new Date(datePart);
        if (isNaN(date.getTime())) {
            const parts = datePart.split('/');
            if (parts.length === 3) {
                const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                const dateFromSlash = new Date(isoDate);
                if (!isNaN(dateFromSlash.getTime())) {
                    dateFromSlash.setUTCHours(dateFromSlash.getUTCHours() + 3);
                    return dateFromSlash.toLocaleDateString('pt-BR');
                }
            }
            return dateString;
        }
        date.setUTCHours(date.getUTCHours() + 3);
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        console.error(`Erro ao formatar data "${dateString}":`, e);
        return dateString;
    }
}

export function formatCurrency(value) {
    if (value === undefined || value === null) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
