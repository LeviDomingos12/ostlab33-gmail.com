import { authenticatedFetch } from "./apiClient";

export interface CloudSqlStatus {
  success: boolean;
  available: boolean;
  connected: boolean;
  message: string;
  error?: string;
}

export interface SQLFinancialSummary {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  averageTicket: number;
  totalTransactions: number;
  taxCollected: number;
}

export interface SQLSalesTrend {
  date: string;
  revenue: number;
  transactions: number;
  averageTicket: number;
}

export interface SQLProductPerformance {
  id: string;
  name: string;
  category: string;
  quantitySold: number;
  revenue: number;
  cost: number;
  profit: number;
  profitMargin: number;
}

export interface SQLCategoryBreakdown {
  category: string;
  revenue: number;
  profit: number;
  percentage: number;
}

export interface SQLPaymentDistribution {
  method: string;
  revenue: number;
  percentage: number;
}

export interface SQLCustomerLeaderboard {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalSpent: number;
  purchaseCount: number;
}

/**
 * Service Layer for Google Cloud SQL Relational Database Connections
 * This manages structured relational queries for large-scale financial reports.
 */
export const CloudSqlService = {
  /**
   * Check connection status of Google Cloud SQL database.
   */
  async checkStatus(): Promise<CloudSqlStatus> {
    try {
      const response = await authenticatedFetch("/api/sql/status");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch Cloud SQL status`);
      }
      return await response.json();
    } catch (error: any) {
      console.error("[CloudSqlService] checkStatus error:", error);
      return {
        success: false,
        available: false,
        connected: false,
        message: "Failed to connect to active Cloud SQL service layer.",
        error: error.message
      };
    }
  },

  /**
   * Trigger data synchronization from local cache/Firestore to structured PostgreSQL tables.
   */
  async triggerSync(): Promise<{ success: boolean; message: string; stats?: any; error?: string }> {
    try {
      const response = await authenticatedFetch("/api/sql/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to synchronize`);
      }
      return await response.json();
    } catch (error: any) {
      console.error("[CloudSqlService] triggerSync error:", error);
      return {
        success: false,
        message: "Structured relational synchronization failed.",
        error: error.message
      };
    }
  },

  /**
   * Fetch aggregate financial metrics across a date range.
   * This computes KPIs directly inside the PostgreSQL database.
   */
  async getFinancialSummary(startDate: string, endDate: string): Promise<SQLFinancialSummary | null> {
    try {
      const response = await authenticatedFetch(`/api/sql/reports/summary?startDate=${startDate}&endDate=${endDate}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch financial summary`);
      }
      const result = await response.json();
      return result.success ? result.data : null;
    } catch (error) {
      console.error("[CloudSqlService] getFinancialSummary error:", error);
      return null;
    }
  },

  /**
   * Fetch sales and ticket average trends grouped by date.
   */
  async getSalesTrends(startDate: string, endDate: string): Promise<SQLSalesTrend[]> {
    try {
      const response = await authenticatedFetch(`/api/sql/reports/trends?startDate=${startDate}&endDate=${endDate}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch sales trends`);
      }
      const result = await response.json();
      return result.success ? result.data : [];
    } catch (error) {
      console.error("[CloudSqlService] getSalesTrends error:", error);
      return [];
    }
  },

  /**
   * Fetch top performing products, sorted by total revenue contribution.
   */
  async getProductPerformance(startDate: string, endDate: string, limit = 10): Promise<SQLProductPerformance[]> {
    try {
      const response = await authenticatedFetch(`/api/sql/reports/products?startDate=${startDate}&endDate=${endDate}&limit=${limit}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch product performance`);
      }
      const result = await response.json();
      return result.success ? result.data : [];
    } catch (error) {
      console.error("[CloudSqlService] getProductPerformance error:", error);
      return [];
    }
  },

  /**
   * Fetch category-wise sales distribution and margins.
   */
  async getCategoryBreakdown(startDate: string, endDate: string): Promise<SQLCategoryBreakdown[]> {
    try {
      const response = await authenticatedFetch(`/api/sql/reports/categories?startDate=${startDate}&endDate=${endDate}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch category breakdown`);
      }
      const result = await response.json();
      return result.success ? result.data : [];
    } catch (error) {
      console.error("[CloudSqlService] getCategoryBreakdown error:", error);
      return [];
    }
  },

  /**
   * Fetch payment method revenue contribution totals.
   */
  async getPaymentDistribution(startDate: string, endDate: string): Promise<SQLPaymentDistribution[]> {
    try {
      const response = await authenticatedFetch(`/api/sql/reports/payments?startDate=${startDate}&endDate=${endDate}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch payment distribution`);
      }
      const result = await response.json();
      return result.success ? result.data : [];
    } catch (error) {
      console.error("[CloudSqlService] getPaymentDistribution error:", error);
      return [];
    }
  },

  /**
   * Fetch top customer spenders.
   */
  async getCustomerLeaderboard(startDate: string, endDate: string, limit = 10): Promise<SQLCustomerLeaderboard[]> {
    try {
      const response = await authenticatedFetch(`/api/sql/reports/customers?startDate=${startDate}&endDate=${endDate}&limit=${limit}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch customer leaderboard`);
      }
      const result = await response.json();
      return result.success ? result.data : [];
    } catch (error) {
      console.error("[CloudSqlService] getCustomerLeaderboard error:", error);
      return [];
    }
  }
};
