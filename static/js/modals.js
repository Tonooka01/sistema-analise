/**
 * modals.js
 * Barrel de compatibilidade — re-exporta tudo de static/js/modals/index.js
 * Nenhum outro arquivo precisa ser alterado.
 */

export {
    openModal, closeModal, fetchAndDisplayTableInModal,
    openInvoiceDetailModal, closeInvoiceDetailModal, fetchAndDisplayInvoiceDetails,
    openDetailsModal, closeDetailsModal, fetchAndRenderTabData,
    openCancellationDetailModal, closeCancellationDetailModal,
    openSellerDetailModal, closeSellerDetailModal, fetchAndDisplaySellerDetails,
    openSellerActivationDetailModal, closeSellerActivationDetailModal, fetchAndDisplaySellerActivationDetails,
    openCityDetailModal, closeCityDetailModal, fetchAndDisplayCityDetails,
    openNeighborhoodDetailModal, closeNeighborhoodDetailModal, fetchAndDisplayNeighborhoodDetails,
    openEquipmentDetailModal, closeEquipmentDetailModal, fetchAndDisplayEquipmentDetails,
    openActiveEquipmentDetailModal, closeActiveEquipmentDetailModal, fetchAndDisplayActiveEquipmentDetails
} from './modals/index.js';
