/**
 * modals/index.js
 * Barrel — re-exporta tudo dos módulos de modal.
 */

export { openModal, closeModal, fetchAndDisplayTableInModal } from './table.js';
export { openInvoiceDetailModal, closeInvoiceDetailModal, fetchAndDisplayInvoiceDetails } from './invoice.js';
export { openDetailsModal, closeDetailsModal, fetchAndRenderTabData } from './details.js';
export { openCancellationDetailModal, closeCancellationDetailModal } from './cancellation.js';
export { openSellerDetailModal, closeSellerDetailModal, fetchAndDisplaySellerDetails, openSellerActivationDetailModal, closeSellerActivationDetailModal, fetchAndDisplaySellerActivationDetails } from './seller.js';
export { openCityDetailModal, closeCityDetailModal, fetchAndDisplayCityDetails, openNeighborhoodDetailModal, closeNeighborhoodDetailModal, fetchAndDisplayNeighborhoodDetails } from './city_neighborhood.js';
export { openEquipmentDetailModal, closeEquipmentDetailModal, fetchAndDisplayEquipmentDetails, openActiveEquipmentDetailModal, closeActiveEquipmentDetailModal, fetchAndDisplayActiveEquipmentDetails } from './equipment.js';
