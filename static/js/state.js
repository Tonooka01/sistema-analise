// --- Constantes ---
export const API_BASE_URL = '';
export const MODAL_ROWS_PER_PAGE = 25;
export const INVOICE_DETAIL_ROWS_PER_PAGE = 15;

// --- Estado da Aplicação (Variáveis 'let') ---
let mainCharts = {};
let activeButton = null;
let globalCurrentAnalysisData = null;
let gridStack = null;

// Estados de Paginação dos Modais
let modalCurrentPage = 1;
let modalCurrentCollection = '';
let modalTotalRows = 0;

// --- NOVO: Estado para Modal Customizado (Tabela Cheia de Análises) ---
let customModalState = {
    isActive: false,        // Indica se o modal está exibindo uma análise customizada
    endpoint: '',           // A URL da API para buscar os dados
    title: '',              // Título do modal
    params: {},             // Parâmetros de filtro (ano, mês, status, etc.)
    currentPage: 1,
    totalRows: 0,
    rowsPerPage: 25
};

let currentSelectedYear = '';
let currentSelectedMonth = '';
let currentSelectedCity = '';

// Estado para análises personalizadas com tabela (Visualização Inline)
let customAnalysisState = {
    currentPage: 1,
    rowsPerPage: 50,
    totalRows: 0,
    currentAnalysis: '',
    currentSearchTerm: '',
    currentAnalysisType: '', // Para Saúde Financeira (atraso/bloqueio)
    sortOrder: 'desc' // <--- Ordenação padrão: Descendente (Maior para Menor)
};

// Estado Modal Detalhes Fatura (Atrasos/Não Pagas)
let invoiceDetailCurrentPage = 1;
// const INVOICE_DETAIL_ROWS_PER_PAGE = 15; // Já definida como constante
let invoiceDetailTotalRows = 0;
let currentInvoiceDetailContractId = '';
let currentInvoiceDetailType = '';

// Estado Modal Unificado com Abas
let detailsState = {
    financeiro: { currentPage: 1, totalRows: 0, rowsPerPage: 15 },
    os: { currentPage: 1, totalRows: 0, rowsPerPage: 15 },
    atendimentos: { currentPage: 1, totalRows: 0, rowsPerPage: 15 },
    logins: { currentPage: 1, totalRows: 0, rowsPerPage: 15 },
    comodato: { currentPage: 1, totalRows: 0, rowsPerPage: 15 }, // Comodato pode não ter paginação
    currentContractId: null,
    currentClientName: null
};

// Estado Modal Detalhes Vendedor (Análise Vendedores)
let sellerDetailState = {
    currentPage: 1,
    rowsPerPage: 25,
    totalRows: 0,
    currentSellerId: null,
    currentSellerName: null,
    currentType: null, // 'cancelado' or 'negativado'
    currentYear: '',
    currentMonth: ''
};

// Estado Modal Detalhes Cidade (Cancel./Negat. por Cidade)
let cityDetailState = {
    currentPage: 1,
    rowsPerPage: 25,
    totalRows: 0,
    currentCity: null,
    currentType: null, // 'cancelado' or 'negativado'
    currentYear: '',
    currentMonth: '',
    currentRelevance: '' 
};

// Estado Modal Detalhes Bairro (Cancel./Negat. por Bairro)
let neighborhoodDetailState = {
    currentPage: 1,
    rowsPerPage: 25,
    totalRows: 0,
    currentCity: null,
    currentNeighborhood: null,
    currentType: null, // 'cancelado' or 'negativado'
    currentYear: '',
    currentMonth: '',
    currentRelevance: '' 
};

// Estado Modal Detalhes Equipamento (Cancelamento)
let equipmentDetailState = {
    currentPage: 1,
    rowsPerPage: 25,
    totalRows: 0,
    currentEquipment: null,
    currentYear: '',
    currentMonth: '',
    currentCity: '',
    currentRelevance: '' 
};

// Estado Modal Detalhes Equipamento Ativo (por OLT)
let activeEquipmentDetailState = {
    currentPage: 1,
    rowsPerPage: 25,
    totalRows: 0,
    currentEquipment: null,
    currentCity: ''
};

// NOVO ESTADO PARA O MODAL DE ATIVAÇÃO
let sellerActivationDetailState = {
    currentPage: 1,
    rowsPerPage: 25,
    totalRows: 0,
    currentSellerId: null,
    currentSellerName: null,
    currentType: null, // 'ativado', 'ativo_permanece', 'churn'
    currentCity: '',
    currentYear: '',
    currentMonth: ''
};


// --- Funções "Getter" para ler o estado ---

export function getMainCharts() { return mainCharts; }
export function getActiveButton() { return activeButton; }
export function getGlobalCurrentAnalysisData() { return globalCurrentAnalysisData; }
export function getGridStack() { return gridStack; }

export function getModalCurrentPage() { return modalCurrentPage; }
export function getModalCurrentCollection() { return modalCurrentCollection; }
export function getModalTotalRows() { return modalTotalRows; }

export function getCustomModalState() { return customModalState; }

export function getCurrentSelectedYear() { return currentSelectedYear; }
export function getCurrentSelectedMonth() { return currentSelectedMonth; }
export function getCurrentSelectedCity() { return currentSelectedCity; }

export function getCustomAnalysisState() { return customAnalysisState; }
export function getInvoiceDetailCurrentPage() { return invoiceDetailCurrentPage; }
export function getInvoiceDetailTotalRows() { return invoiceDetailTotalRows; }
export function getCurrentInvoiceDetailContractId() { return currentInvoiceDetailContractId; }
export function getCurrentInvoiceDetailType() { return currentInvoiceDetailType; }
export function getDetailsState() { return detailsState; }
export function getSellerDetailState() { return sellerDetailState; }
export function getCityDetailState() { return cityDetailState; }
export function getNeighborhoodDetailState() { return neighborhoodDetailState; }
export function getEquipmentDetailState() { return equipmentDetailState; }
export function getActiveEquipmentDetailState() { return activeEquipmentDetailState; }
export function getSellerActivationDetailState() { return sellerActivationDetailState; }


// --- Funções "Setter" para modificar o estado ---

export function setMainCharts(newCharts) { mainCharts = newCharts; }
export function addChart(id, chartInstance) { mainCharts[id] = chartInstance; }
export function deleteChart(id) { delete mainCharts[id]; }
export function clearCharts() { mainCharts = {}; } // Para resetar completamente
export function setActiveButton(button) { activeButton = button; }
export function setGlobalCurrentAnalysisData(data) { globalCurrentAnalysisData = data; }
export function setGridStack(grid) { gridStack = grid; }

export function setModalCurrentPage(page) { modalCurrentPage = page; }
export function setModalCurrentCollection(collection) { modalCurrentCollection = collection; }
export function setModalTotalRows(total) { modalTotalRows = total; }

export function setCustomModalState(newState) { customModalState = { ...customModalState, ...newState }; }

export function setCurrentSelectedYear(year) { currentSelectedYear = year; }
export function setCurrentSelectedMonth(month) { currentSelectedMonth = month; }
export function setCurrentSelectedCity(city) { currentSelectedCity = city; }

export function setCustomAnalysisState(newState) { customAnalysisState = { ...customAnalysisState, ...newState }; }
export function setInvoiceDetailCurrentPage(page) { invoiceDetailCurrentPage = page; }
export function setInvoiceDetailTotalRows(total) { invoiceDetailTotalRows = total; }
export function setCurrentInvoiceDetailContractId(id) { currentInvoiceDetailContractId = id; }
export function setCurrentInvoiceDetailType(type) { currentInvoiceDetailType = type; }
export function setDetailsState(tab, newState) { detailsState[tab] = { ...detailsState[tab], ...newState }; }
export function setCurrentDetailsContractInfo(id, name) { detailsState.currentContractId = id; detailsState.currentClientName = name; }
export function setSellerDetailState(newState) { sellerDetailState = { ...sellerDetailState, ...newState }; }
export function setCityDetailState(newState) { cityDetailState = { ...cityDetailState, ...newState }; }
export function setNeighborhoodDetailState(newState) { neighborhoodDetailState = { ...neighborhoodDetailState, ...newState }; }
export function setEquipmentDetailState(newState) { equipmentDetailState = { ...equipmentDetailState, ...newState }; }
export function setActiveEquipmentDetailState(newState) { activeEquipmentDetailState = { ...activeEquipmentDetailState, ...newState }; }
export function setSellerActivationDetailState(newState) { sellerActivationDetailState = { ...sellerActivationDetailState, ...newState }; }


// --- Funções de Reset ---

export function resetCustomAnalysisState() {
    customAnalysisState = {
        currentPage: 1, rowsPerPage: 50, totalRows: 0,
        currentAnalysis: '', currentSearchTerm: '', currentAnalysisType: '',
        sortOrder: 'desc' // Reset para descendente por padrão
    };
    console.log("Estado customAnalysisState resetado.");
}

export function resetCustomModalState() {
    customModalState = {
        isActive: false, endpoint: '', title: '', params: {},
        currentPage: 1, totalRows: 0, rowsPerPage: 25
    };
    console.log("Estado customModalState resetado.");
}

export function resetInvoiceDetailState() {
    invoiceDetailCurrentPage = 1;
    invoiceDetailTotalRows = 0;
    currentInvoiceDetailContractId = '';
    currentInvoiceDetailType = '';
    console.log("Estado invoiceDetailState resetado.");
}

export function resetDetailsState() {
     detailsState = {
        financeiro: { currentPage: 1, totalRows: 0, rowsPerPage: 15 },
        os: { currentPage: 1, totalRows: 0, rowsPerPage: 15 },
        atendimentos: { currentPage: 1, totalRows: 0, rowsPerPage: 15 },
        logins: { currentPage: 1, totalRows: 0, rowsPerPage: 15 },
        comodato: { currentPage: 1, totalRows: 0, rowsPerPage: 15 },
        currentContractId: null,
        currentClientName: null
    };
    console.log("Estado detailsState resetado.");
}

export function resetSellerDetailState() {
     sellerDetailState = {
        currentPage: 1, rowsPerPage: 25, totalRows: 0,
        currentSellerId: null, currentSellerName: null, currentType: null,
        currentYear: '', currentMonth: ''
    };
    console.log("Estado sellerDetailState resetado.");
}

export function resetCityDetailState() {
     cityDetailState = {
        currentPage: 1, rowsPerPage: 25, totalRows: 0,
        currentCity: null, currentType: null,
        currentYear: '', currentMonth: '',
        currentRelevance: ''
    };
    console.log("Estado cityDetailState resetado.");
}

export function resetNeighborhoodDetailState() {
     neighborhoodDetailState = {
        currentPage: 1, rowsPerPage: 25, totalRows: 0,
        currentCity: null, currentNeighborhood: null, currentType: null,
        currentYear: '', currentMonth: '',
        currentRelevance: ''
    };
    console.log("Estado neighborhoodDetailState resetado.");
}

export function resetEquipmentDetailState() {
    equipmentDetailState = {
        currentPage: 1, rowsPerPage: 25, totalRows: 0,
        currentEquipment: null, currentYear: '', currentMonth: '', currentCity: '',
        currentRelevance: ''
    };
    console.log("Estado equipmentDetailState resetado.");
}

export function resetActiveEquipmentDetailState() {
     activeEquipmentDetailState = {
        currentPage: 1, rowsPerPage: 25, totalRows: 0,
        currentEquipment: null, currentCity: ''
    };
    console.log("Estado activeEquipmentDetailState resetado.");
}

export function resetSellerActivationDetailState() {
     sellerActivationDetailState = {
        currentPage: 1,
        rowsPerPage: 25,
        totalRows: 0,
        currentSellerId: null,
        currentSellerName: null,
        currentType: null,
        currentCity: '',
        currentYear: '',
        currentMonth: ''
    };
    console.log("Estado sellerActivationDetailState resetado.");
}