import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Search, Sparkles, X } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { ComponentCard } from "@/components/ComponentCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_HISTORY_KEY = "techbuiltai-search-history";

export default function ComponentsPage() {
  const [searchParams] = useSearchParams();
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [stockStatus, setStockStatus] = useState("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [sortBy, setSortBy] = useState("display_order");
  const [priceRange, setPriceRange] = useState([0, 50000000]);
  const [customMinPrice, setCustomMinPrice] = useState(0);
  const [customMaxPrice, setCustomMaxPrice] = useState(50000000);
  const [page, setPage] = useState(1);
  const [jumpPageInput, setJumpPageInput] = useState("1");
  const [searchPool, setSearchPool] = useState([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, totalItems: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const hasActiveFilters =
    Boolean(keyword) ||
    selectedCategory !== "all" ||
    selectedBrand !== "all" ||
    stockStatus !== "all" ||
    featuredOnly ||
    sortBy !== "display_order" ||
    priceRange[0] > 0 ||
    priceRange[1] < 50000000;

  useEffect(() => {
    setSearchHistory(readSearchHistory());
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextKeyword = keywordInput.trim();
      if (nextKeyword === keyword) return;
      setKeyword(nextKeyword);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [keywordInput, keyword]);

  useEffect(() => {
    let cancelled = false;
    async function loadFilterMetadata() {
      try {
        const response = await fetch("/api/products/overview");
        if (!response.ok) throw new Error("Metadata error");
        const payload = await response.json();
        if (!cancelled) {
          setCategories(Array.isArray(payload.categories) ? payload.categories : []);
          const allBrands = new Set();
          const products = Array.isArray(payload.products) ? payload.products : [];
          setSearchPool(products);
          products.forEach(item => {
            const b = item?.specifications?.brand || item?.supplier?.name || "TechBuildAi";
            if (b) allBrands.add(String(b));
          });
          setBrands(Array.from(allBrands).sort());
        }
      } catch {
        if (!cancelled) {
          setCategories([]);
          setBrands([]);
        }
      }
    }
    loadFilterMetadata();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadProducts() {
      setIsLoading(true);
      try {
        const query = new URLSearchParams();
        query.set("page", String(page));
        query.set("pageSize", String(PAGE_SIZE));
        if (keyword) query.set("keyword", keyword);
        if (selectedCategory !== "all") query.set("category", selectedCategory);
        if (selectedBrand !== "all") query.set("brand", selectedBrand);
        if (stockStatus !== "all") query.set("stockStatus", stockStatus);
        if (featuredOnly) query.set("featuredOnly", "true");
        if (sortBy !== "display_order") query.set("sort", sortBy);
        if (priceRange[0] > 0) query.set("minPrice", String(priceRange[0]));
        if (priceRange[1] < 50000000) query.set("maxPrice", String(priceRange[1]));

        const response = await fetch(`/api/products?${query.toString()}`);
        if (!response.ok) throw new Error("Fetch error");
        const payload = await response.json();
        if (!cancelled) {
          setItems(Array.isArray(payload.items) ? payload.items.map(mapProductToCardData) : []);
          setPagination(payload.pagination || { page: 1, totalPages: 1, totalItems: 0 });
        }
      } catch (error) {
        if (!cancelled) {
          setItems([]);
          setErrorMessage(error instanceof Error ? error.message : "Error");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadProducts();
    return () => { cancelled = true; };
  }, [keyword, selectedCategory, selectedBrand, stockStatus, featuredOnly, sortBy, priceRange, page]);

  const totalPages = Math.max(1, Number(pagination.totalPages ?? 1));
  const visiblePageItems = useMemo(() => buildVisiblePageItems(page, totalPages), [page, totalPages]);

  const clearFilters = () => {
    setKeyword("");
    setKeywordInput("");
    setSelectedCategory("all");
    setSelectedBrand("all");
    setStockStatus("all");
    setFeaturedOnly(false);
    setSortBy("display_order");
    setPriceRange([0, 50000000]);
    setPage(1);
  };

  const applySuggestedKeyword = (v) => {
    setKeywordInput(v);
    setKeyword(v);
    setPage(1);
    setIsSearchFocused(false);
  };

  const jumpToPage = () => {
    const p = parseInt(jumpPageInput);
    if (!isNaN(p)) setPage(Math.max(1, Math.min(totalPages, p)));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-12">
        <div className="container mx-auto px-4">
          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <aside className="h-fit space-y-6 rounded-lg border border-border bg-card p-4 sticky top-24">
              <div className="space-y-4">
                <Label className="text-base font-bold">Danh mục</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={selectedCategory === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setSelectedCategory("all"); setPage(1); }}
                    className="justify-start"
                  >
                    Tất cả
                  </Button>
                  {categories.map((cat) => (
                    <Button
                      key={cat.id || cat.slug}
                      variant={selectedCategory === cat.slug ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setSelectedCategory(cat.slug); setPage(1); }}
                      className="justify-start truncate"
                    >
                      {cat.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <Label>Hãng</Label>
                <select
                  className="w-full rounded-md border p-2 text-sm"
                  value={selectedBrand}
                  onChange={(e) => { setSelectedBrand(e.target.value); setPage(1); }}
                >
                  <option value="all">Tất cả</option>
                  {brands.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div className="space-y-4">
                <Label>Giá</Label>
                <Slider
                  value={priceRange}
                  onValueChange={(v) => { setPriceRange(v); setPage(1); }}
                  min={0}
                  max={50000000}
                  step={1000000}
                />
                <div className="flex justify-between text-xs">
                  <span>{formatPrice(priceRange[0])}</span>
                  <span>{formatPrice(priceRange[1])}</span>
                </div>
              </div>

              {hasActiveFilters && (
                <Button variant="ghost" className="w-full text-rose-500" onClick={clearFilters}>
                  Xóa bộ lọc
                </Button>
              )}
            </aside>

            <section className="space-y-6">
              <div className="sticky top-24 z-10 bg-white/80 backdrop-blur-md p-4 rounded-xl border border-border/40 shadow-sm">
                <div className="flex gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Tìm kiếm linh kiện..."
                      className="pl-10"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                    />
                  </div>
                  <Link to="/ai-recommend">
                    <Button className="gap-2">
                      <Sparkles className="w-4 h-4" />
                      AI Gợi ý
                    </Button>
                  </Link>
                </div>
              </div>

              {isLoading ? (
                <div className="py-20 text-center">Đang tải...</div>
              ) : items.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {items.map(item => <ComponentCard key={item.id} component={item} />)}
                </div>
              ) : (
                <div className="py-20 text-center">Không tìm thấy sản phẩm</div>
              )}

              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-8">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Trước</Button>
                  {visiblePageItems.map((p, i) => (
                    p === "..." ? <span key={i}>...</span> : (
                      <Button key={i} variant={page === p ? "default" : "outline"} size="sm" onClick={() => setPage(p)}>{p}</Button>
                    )
                  ))}
                  <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Sau</Button>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function buildVisiblePageItems(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const start = Math.max(1, Math.min(page - 2, totalPages - 6));
  const items = Array.from({ length: 5 }, (_, i) => start + i);
  if (start > 1) items.unshift("...");
  if (start + 5 < totalPages) items.push("...");
  return items;
}

function mapProductToCardData(p) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    image: p.imageUrl || "/images/component-placeholder.svg",
    brand: p.specifications?.brand || "TechBuildAi",
    category: p.category?.slug,
    stock: p.stockQuantity,
    rating: p.rating || 5,
    reviews: p.reviewCount || 0,
    specs: p.specifications || {},
  };
}

function formatPrice(v) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(v);
}

function readSearchHistory() {
  return JSON.parse(localStorage.getItem("techbuiltai-search-history") || "[]");
}
