import { initializeEventListeners } from './events.js';
import { initializeGridStack, setupResponsiveGridStack } from './grid.js';
import { fetchAndRenderMainAnalysis } from './analysis.js';
import { setActiveControl } from './utils.js';
import * as dom from './dom.js';
import { initializeDom } from './dom.js'; // <-- 1. IMPORTAR A NOVA FUNÇÃO

/**
 * Função principal de inicialização do aplicativo.
 * É executada quando o DOM está totalmente carregado.
 */
function initializeApp() {
    // 2. CHAMAR A FUNÇÃO *ANTES* DE QUALQUER OUTRA COISA
    // Isso garante que todas as variáveis em dom.js sejam válidas.
    initializeDom(); 

    // 3. O resto do código agora funcionará
    initializeGridStack();
    initializeEventListeners();
    
    // Agora dom.btnContratos não será 'null'
    const defaultButton = dom.btnContratos; 
    if (defaultButton) {
        setActiveControl(defaultButton);
        fetchAndRenderMainAnalysis('Contratos');
    }
    
    setupResponsiveGridStack();
}

// Inicia o aplicativo quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initializeApp);