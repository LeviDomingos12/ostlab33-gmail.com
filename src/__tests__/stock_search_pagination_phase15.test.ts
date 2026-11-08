import { describe, it, expect } from "vitest";

// Helper logic tests for stock search & pagination
describe("StockModule Real-time Search and Pagination", () => {
  const mockProducts = Array.from({ length: 150 }, (_, i) => ({
    id: `p-${i + 1}`,
    code: `SKU-${1000 + i}`,
    name: i % 2 === 0 ? `Produto Arroz ${i + 1}` : `Item Óleo ${i + 1}`,
    category: i % 3 === 0 ? "Alimentos" : i % 3 === 1 ? "Bebidas" : "Limpeza",
    supplier: i % 2 === 0 ? "Fornecedor A" : "Fornecedor B",
    costPrice: 100 + i,
    salePrice: 150 + i,
    stock: i * 2,
    minStock: 10,
    unit: "un"
  }));

  it("should filter products in real-time by search query", () => {
    const q = "arroz 2";
    const filtered = mockProducts.filter(p => {
      const query = q.toLowerCase();
      return (
        p.name.toLowerCase().includes(query) ||
        p.code.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        (p.supplier && p.supplier.toLowerCase().includes(query))
      );
    });

    expect(filtered.length).toBeGreaterThan(0);
    filtered.forEach(p => {
      const match = 
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.supplier.toLowerCase().includes(q);
      expect(match).toBe(true);
    });
  });

  it("should calculate correct pagination slices and total pages", () => {
    const itemsPerPage = 20;
    const totalPages = Math.ceil(mockProducts.length / itemsPerPage);
    expect(totalPages).toBe(8); // 150 / 20 = 7.5 -> 8 pages

    const page1 = mockProducts.slice(0, itemsPerPage);
    expect(page1.length).toBe(20);
    expect(page1[0].id).toBe("p-1");

    const page8 = mockProducts.slice(7 * itemsPerPage, 8 * itemsPerPage);
    expect(page8.length).toBe(10); // 150 mod 20 = 10
  });

  it("should generate proper page numbers with ellipsis for pagination", () => {
    function getPageNumbers(current: number, total: number) {
      if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
      }
      if (current <= 4) {
        return [1, 2, 3, 4, 5, '...', total];
      }
      if (current >= total - 3) {
        return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
      }
      return [1, '...', current - 1, current, current + 1, '...', total];
    }

    const pagesAt1 = getPageNumbers(1, 20);
    expect(pagesAt1).toEqual([1, 2, 3, 4, 5, '...', 20]);

    const pagesAt10 = getPageNumbers(10, 20);
    expect(pagesAt10).toEqual([1, '...', 9, 10, 11, '...', 20]);

    const pagesAt20 = getPageNumbers(20, 20);
    expect(pagesAt20).toEqual([1, '...', 16, 17, 18, 19, 20]);
  });
});
