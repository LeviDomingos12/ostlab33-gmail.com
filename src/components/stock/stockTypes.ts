import { Product, UserRole, Transaction, SystemSettings } from "../../types";

export interface StockModuleProps {
  products: Product[];
  transactions?: Transaction[];
  onAddProduct: (p: Product) => void;
  onUpdateProduct: (p: Product) => void;
  onDeleteProduct: (pId: string) => void;
  onAddAuditLog: (action: string, module: string, details: string) => void;
  currentRole: UserRole;
  currency: string;
  settings?: SystemSettings;
  onUpdateSettings?: (s: Partial<SystemSettings>) => void;
  activeUsername?: string;
  onShowToast?: (message: string, type: "success" | "error" | "info" | "warning", title?: string) => void;
}

export interface StockKpis {
  totalItems: number;
  totalUnits: number;
  totalCostValue: number;
  totalSaleValue: number;
  expectedProfit: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiringSoonCount: number;
}
