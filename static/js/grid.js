import * as state from './state.js';
import * as dom from './dom.js'; // Importa o dom.js para pegar o botão de salvar

/**
 * Inicializa a grade do GridStack e adiciona um listener para redimensionar os gráficos
 * quando um widget muda de tamanho ou posição.
 */
export function initializeGridStack() {
    // Assume que 'GridStack' está disponível globalmente (via CDN)
    const grid = GridStack.init({
        cellHeight: 70,
        minRow: 1,
        margin: 10,
        float: true,
    });

    // Listener para redimensionar gráficos no 'change'
    grid.on('change', () => {
        setTimeout(() => {
            Object.values(state.getMainCharts()).forEach(chart => {
                if (chart) {
                    chart.resize();
                }
            });
        }, 250); // Delay para permitir a animação do grid
    });
    
    state.setGridStack(grid); // Salva a instância no estado global
}

/**
 * Salva o layout atual da grade no localStorage para persistência.
 */
export function saveLayout() {
    const grid = state.getGridStack();
    const collection = state.getModalCurrentCollection();
    if (!grid || !dom.saveLayoutBtn) return; // Verifica se a grade e o botão existem

    const layout = grid.save();
    localStorage.setItem(`layout_${collection}`, JSON.stringify(layout));
    
    // Feedback visual para o usuário
    const originalText = dom.saveLayoutBtn.textContent;
    dom.saveLayoutBtn.textContent = 'Salvo!';
    dom.saveLayoutBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
    dom.saveLayoutBtn.classList.add('bg-blue-500');
    setTimeout(() => {
        dom.saveLayoutBtn.textContent = originalText;
        dom.saveLayoutBtn.classList.add('bg-green-600', 'hover:bg-green-700');
        dom.saveLayoutBtn.classList.remove('bg-blue-500');
    }, 1500);
}

/**
 * Configura a adaptação responsiva do GridStack.
 */
export function setupResponsiveGridStack() {
    const grid = state.getGridStack();
    if (!grid) return;

    const mobileBreakpoint = 768; 

    const adaptGrid = () => {
        const screenWidth = window.innerWidth;
        if (screenWidth < mobileBreakpoint) {
            grid.column(1); // Muda para 1 coluna
            grid.setStatic(true); // Trava os widgets
        } else {
            grid.column(12); // Volta para 12 colunas
            grid.setStatic(false); // Permite mover
        }
         // Redimensiona os gráficos após a mudança
         setTimeout(() => {
            Object.values(state.getMainCharts()).forEach(chart => {
                if (chart) chart.resize();
            });
        }, 300);
    };

    window.addEventListener('resize', adaptGrid);
    adaptGrid(); // Executa na inicialização
}

