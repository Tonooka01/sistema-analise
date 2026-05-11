/**
 * dom/index.js
 * Agrega todos os sub-módulos do DOM e exporta initializeDom.
 */

export * from './main.js';
export * from './filters.js';
export * from './modals.js';

import { initMainDom } from './main.js';
import { initFiltersDom } from './filters.js';
import { initModalsDom } from './modals.js';

export function initializeDom() {
    console.log("Inicializando referências do DOM...");
    initMainDom();
    initFiltersDom();
    initModalsDom();
    console.log("Referências do DOM inicializadas.");
}
