import { Product, Customer, CartItem, Transaction, SystemSettings } from "../../types";

export interface UpgradedCartItem extends CartItem {
  observation?: string;
}

export interface POSModuleProps {
  products: Product[];
  customers: Customer[];
  transactions: Transaction[];
  activeUsername: string;
  settings: SystemSettings;
  onCompleteSale: (tx: Transaction) => Promise<boolean | void> | void;
  onReturnSale?: (
    tx: Transaction,
    reason: string,
    returnedItems: { productId: string; quantity: number; price: number }[],
    refundMethod?: string
  ) => void;
  onAddAuditLog: (action: string, module: string, details: string) => void;
  currency: string;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
  isPOSFullscreen?: boolean;
  onChangePOSFullscreen?: (val: boolean) => void;
  onTriggerPanic?: () => void;
}

export interface SuspendedCartRecord {
  id: string;
  items: UpgradedCartItem[];
  customer: Customer | null;
  savedAt: string;
  note?: string;
  total: number;
}

export interface CreditNoteData {
  creditNoteId: string;
  originalInvoiceNumber: string;
  customerName: string;
  customerNuit: string;
  date: string;
  reason: string;
  items: { productName: string; quantity: number; price: number; subtotal: number }[];
  totalRefund: number;
  refundMethod: string;
  operatorName: string;
}

export interface FiscalSignatureResult {
  fiscalHash: string;
  fiscalKeys: string;
  fiscalCertified: boolean;
}
