import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Heart, History, Loader2, MessageSquare, Shield, ShoppingCart, Star, Trophy } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useFavorite } from "@/client/features/favorite/context/FavoriteContext";

export default function ProductDetailPage() {
  const { slug } = useParams();
  const { addToCart } = useCart();
  const { token, isAuthenticated, isHydrated } = useAuth();
  const [product, setProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewSummary, setReviewSummary] = useState({ totalReviews: 0, averageRating: 0, ratingBreakdown: [] });
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewImages, setReviewImages] = useState([]);
  const [reviewImagePreviews, setReviewImagePreviews] = useState([]);
  const [reviewError, setReviewError] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewStarFilter, setReviewStarFilter] = useState("all");
  const [expandedReviewThreads, setExpandedReviewThreads] = useState({});
  const [canReview, setCanReview] = useState(false);
  const [reviewEligibilityMessage, setReviewEligibilityMessage] = useState("");
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const { isFavorite, toggleFavorite } = useFavorite();
  const isWishlisted = product ? isFavorite(product.id) : false;
  const [isUpdatingWishlist, setIsUpdatingWishlist] = useState(false);
  const [wishlistMessage, setWishlistMessage] = useState("");

  const refreshReviewEligibility = useCallback(
    async (productSlug, authToken, isCancelled = () => false) => {
      if (!productSlug || !authToken || !isAuthenticated) {
        setCanReview(false);
        setReviewEligibilityMessage("Vui lòng đăng nhập để gửi đánh giá");
        return;
      }

      try {
        const response = await fetch(
          `/api/products/${productSlug}/review-eligibility`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          },
        );

        const payload = await response.json().catch(() => ({}));
        if (isCancelled()) {
          return;
        }

        setCanReview(Boolean(payload?.canReview));
        setReviewEligibilityMessage(String(payload?.reason ?? ""));
      } catch {
        if (isCancelled()) {
          return;
        }

        setCanReview(false);
        setReviewEligibilityMessage(
          "Không thể kiểm tra quyền đánh giá lúc này",
        );
      }
    },
    [isAuthenticated],
  );

  const loadReviews = async (productSlug, isCancelled = () => false) => {
    try {
      const response = await fetch(`/api/products/${productSlug}/reviews`);
      if (!response.ok) {
        throw new Error("Không tải được đánh giá sản phẩm");
      }

      const payload = await response.json();
      if (isCancelled()) {
        return;
      }

      setReviews(Array.isArray(payload?.items) ? payload.items : []);
      setReviewSummary({
        totalReviews: Number(payload?.summary?.totalReviews ?? 0),
        averageRating: Number(payload?.summary?.averageRating ?? 0),
        ratingBreakdown: Array.isArray(payload?.summary?.ratingBreakdown)
          ? payload.summary.ratingBreakdown
          : [],
      });
    } catch {
      if (isCancelled()) {
        return;
      }

      setReviews([]);
      setReviewSummary({ totalReviews: 0, averageRating: 0, ratingBreakdown: [] });
    }
  };

  useEffect(() => {
    const nextPreviews = reviewImages.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setReviewImagePreviews(nextPreviews);

    return () => {
      nextPreviews.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [reviewImages]);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(`/api/products/${slug}`);
        if (!response.ok) {
          throw new Error("Không tải được chi tiết sản phẩm");
        }

        const payload = await response.json();
        if (!cancelled) {
          setProduct(payload);
          const recentItems = updateRecentlyViewed(payload);
          setRecentlyViewed(recentItems);
        }

        await loadReviews(payload?.slug || slug, () => cancelled);
      } catch (error) {
        if (!cancelled) {
          setProduct(null);
          setErrorMessage(
            error instanceof Error ? error.message : "Có lỗi xảy ra",
          );
          setReviews([]);
          setReviewSummary({ totalReviews: 0, averageRating: 0, ratingBreakdown: [] });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    if (slug) {
      loadDetail();
    }

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;

    if (isHydrated) {
      refreshReviewEligibility(product?.slug, token, () => cancelled);
    }

    return () => {
      cancelled = true;
    };
  }, [product?.slug, token, isHydrated, refreshReviewEligibility]);

  async function handleToggleWishlist() {
    setWishlistMessage("");

    if (!isHydrated || !isAuthenticated) {
      setWishlistMessage("Vui lòng đăng nhập để dùng wishlist");
      return;
    }

    if (!product?.id) {
      return;
    }

    try {
      setIsUpdatingWishlist(true);
      const success = await toggleFavorite(product.id);
      if (!success) {
        throw new Error("Không thể cập nhật wishlist");
      }
      setWishlistMessage(
        !isWishlisted ? "Đã thêm vào wishlist" : "Đã bỏ khỏi wishlist",
      );
    } catch (error) {
      setWishlistMessage(
        error instanceof Error ? error.message : "Không thể cập nhật wishlist",
      );
    } finally {
      setIsUpdatingWishlist(false);
      setTimeout(() => setWishlistMessage(""), 3000);
    }
  }

  async function submitReview(event) {
    event.preventDefault();

    setReviewError("");
    setReviewMessage("");

    if (!isHydrated || !isAuthenticated || !token) {
      setReviewError("Vui lòng đăng nhập để đánh giá sản phẩm");
      return;
    }

    if (!product?.slug) {
      setReviewError("Không xác định được sản phẩm để đánh giá");
      return;
    }

    try {
      setIsSubmittingReview(true);

      const formData = new FormData();
      formData.append("rating", String(reviewRating));
      if (reviewComment.trim()) {
        formData.append("comment", reviewComment.trim());
      }
      reviewImages.forEach((file) => {
        formData.append("images", file);
      });

      const response = await fetch(`/api/products/${product.slug}/reviews`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const responseText = await response.text();
      let payload = null;
      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        const serverMessage = payload?.message || responseText;
        throw new Error(serverMessage || "Gửi đánh giá thất bại");
      }

      setReviewMessage("Đánh giá của bạn đã được ghi nhận");
      setReviewComment("");
      setReviewImages([]);
      await loadReviews(product.slug);
      await refreshReviewEligibility(product.slug, token);
    } catch (error) {
      setReviewError(
        error instanceof Error ? error.message : "Gửi đánh giá thất bại",
      );
    } finally {
      setIsSubmittingReview(false);
    }
  }

  const reviewStarCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const item of reviews) {
      const rating = Number(item?.rating ?? 0);
      if (rating >= 1 && rating <= 5) {
        counts[rating] += 1;
      }
    }
    return counts;
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    if (reviewStarFilter === "all") {
      return reviews;
    }

    const target = Number(reviewStarFilter);
    if (!Number.isFinite(target)) {
      return reviews;
    }

    return reviews.filter((item) => Number(item?.rating ?? 0) === target);
  }, [reviewStarFilter, reviews]);

  function toggleReviewThread(reviewId) {
    setExpandedReviewThreads((prev) => ({
      ...prev,
      [reviewId]: !prev[reviewId],
    }));
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <Link
          to="/components"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại danh sách
        </Link>

        {isLoading ? (
          <p className="mt-8 text-muted-foreground">
            Đang tải chi tiết sản phẩm...
          </p>
        ) : errorMessage ? (
          <p className="mt-8 text-destructive">{errorMessage}</p>
        ) : product ? (
          <>
            <div className="mt-8 grid gap-10 lg:grid-cols-2">
              <div className="relative group">
                <div className="absolute -inset-4 bg-gradient-to-tr from-primary/10 via-transparent to-accent/5 rounded-[40px] blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative rounded-3xl border border-border/50 bg-white/80 p-8 shadow-[0_8px_40px_rgba(0,0,0,0.04)] backdrop-blur-sm overflow-hidden">
                  <div className="absolute top-0 right-0 p-4">
                    <Badge variant="outline" className="bg-white/50 backdrop-blur-md">
                      Chính hãng
                    </Badge>
                  </div>
                  <img
                    src={product.imageUrl || "/images/component-placeholder.svg"}
                    alt={product.name}
                    className="h-[420px] w-full rounded-2xl object-contain transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
              </div>

              <div className="flex flex-col">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Badge className={`${getCategoryStyle(product?.category?.slug)} px-3 py-1`}>
                        {product?.category?.name}
                      </Badge>
                      <span className="text-xs font-medium text-muted-foreground tracking-widest uppercase">
                        SKU: {product.productCode}
                      </span>
                    </div>
                    <h1 className="text-4xl font-black tracking-tight text-slate-900 leading-[1.1]">
                      {product.name}
                    </h1>
                    <div className="flex items-center gap-4 py-1">
                      <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                        <span className="text-sm font-bold text-amber-700">
                          {reviewSummary.averageRating.toFixed(1)}
                        </span>
                        <span className="text-xs text-amber-600/70 font-medium">
                          ({reviewSummary.totalReviews} đánh giá)
                        </span>
                      </div>
                      {Number(product.stockQuantity) > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          Sẵn hàng: {product.stockQuantity}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-600">
                          <div className="h-2 w-2 rounded-full bg-rose-500" />
                          Hết hàng
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50/80 p-6 border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Giá niêm yết</p>
                    <p className="text-4xl font-black text-primary tracking-tight">
                      {formatMoney(product.price)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      size="lg"
                      className="h-14 bg-primary text-lg font-bold shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
                      disabled={Number(product.stockQuantity) <= 0}
                      onClick={async () => {
                        try {
                          await addToCart({
                            productId: product.id,
                            quantity: 1,
                          });
                        } catch (error) {
                          window.alert(error instanceof Error ? error.message : "Lỗi giỏ hàng");
                        }
                      }}
                    >
                      <ShoppingCart className="w-5 h-5 mr-2" />
                      {Number(product.stockQuantity) > 0 ? "Thêm vào giỏ" : "Hết hàng"}
                    </Button>
                    <Button
                      size="lg"
                      variant={isWishlisted ? "secondary" : "outline"}
                      className="h-14 font-bold border-2"
                      onClick={handleToggleWishlist}
                      disabled={isUpdatingWishlist}
                    >
                      <Heart className={`w-5 h-5 mr-2 ${isWishlisted ? "fill-rose-500 text-rose-500" : ""}`} />
                      {isWishlisted ? "Đã lưu" : "Lưu lại"}
                    </Button>
                  </div>

                  <div className="space-y-4 pt-4">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <div className="h-6 w-1 bg-primary rounded-full" />
                      Thông số kỹ thuật
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {Object.entries(product.specifications ?? {}).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 text-sm transition-colors hover:border-primary/20 hover:bg-primary/5"
                        >
                          <span className="font-semibold text-slate-500">{key}</span>
                          <span className="font-bold text-slate-800">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-16 grid gap-12 lg:grid-cols-[1fr_380px]">
              <div className="space-y-12">
                {product.detail && (
                  <section className="space-y-6">
                    <h2 className="text-2xl font-bold flex items-center gap-3">
                      Mô tả chi tiết
                      <div className="h-px flex-1 bg-slate-200" />
                    </h2>
                    <div className="prose prose-slate max-w-none">
                      {product.detail.inTheBox && (
                        <div className="mb-6 rounded-2xl bg-secondary/30 p-6">
                          <h3 className="text-sm font-bold uppercase tracking-wider mb-2">Bộ sản phẩm gồm</h3>
                          <p className="text-slate-600">{product.detail.inTheBox}</p>
                        </div>
                      )}
                      {product.detail.warrantyPolicy && (
                        <div className="mb-6">
                          <h3 className="text-base font-bold mb-2">Chính sách bảo hành</h3>
                          <p className="text-slate-600">{product.detail.warrantyPolicy}</p>
                        </div>
                      )}
                      {product.detail.fullDescription && (
                        <div
                          className="text-sm leading-relaxed text-foreground"
                          dangerouslySetInnerHTML={{ __html: product.detail.fullDescription }}
                        />
                      )}
                    </div>
                  </section>
                )}

                <section id="reviews" className="space-y-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3">
                    Cộng đồng đánh giá
                    <div className="h-px flex-1 bg-slate-200" />
                  </h2>

                  <div className="grid gap-3 rounded-xl border border-border/60 bg-background p-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Điểm trung bình</p>
                      <p className="text-2xl font-bold text-primary">
                        {reviewSummary.averageRating.toFixed(1)}/5
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {reviewSummary.totalReviews} lượt đánh giá
                      </p>
                    </div>
                    <div className="space-y-2">
                      {(reviewSummary.ratingBreakdown ?? []).map((item) => (
                        <button
                          key={`rating-${item.rating}`}
                          type="button"
                          className={`flex w-full items-center gap-3 rounded-lg px-2 py-1 text-left text-sm transition ${reviewStarFilter === String(item.rating) ? "bg-primary/10" : "hover:bg-muted/60"}`}
                          onClick={() => setReviewStarFilter(String(item.rating))}
                        >
                          <span className="w-10 font-medium">{item.rating}★</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${item.percent ?? 0}%` }}
                            />
                          </div>
                          <span className="w-12 text-right text-xs text-muted-foreground">{item.percent ?? 0}%</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {!isHydrated ? (
                    <p className="text-sm text-muted-foreground">Đang kiểm tra...</p>
                  ) : isAuthenticated && canReview ? (
                    <form className="space-y-3" onSubmit={submitReview}>
                      <div className="space-y-1">
                        <label className="block text-sm font-medium">Số sao</label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={reviewRating}
                          onChange={(e) => setReviewRating(Number(e.target.value))}
                        >
                          {[5,4,3,2,1].map(v => <option key={v} value={v}>{v} sao</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-sm font-medium">Nhận xét</label>
                        <textarea
                          className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                        />
                      </div>
                      <Button type="submit" disabled={isSubmittingReview}>
                        {isSubmittingReview ? "Đang gửi..." : "Gửi đánh giá"}
                      </Button>
                    </form>
                  ) : null}

                  <div className="divide-y divide-border/60">
                    {filteredReviews.map((review) => (
                      <div key={review.id} className="py-6 first:pt-0">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-bold text-sm">{review.user?.fullName || "Ẩn danh"}</p>
                          <span className="text-xs text-muted-foreground">{formatRelativeTime(review.createdAt)}</span>
                        </div>
                        <div className="flex mb-2">
                          {"★".repeat(review.rating)}{"☆".repeat(5-review.rating)}
                        </div>
                        <p className="text-sm text-slate-600">{review.comment}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="space-y-8">
                <div className="sticky top-24 space-y-6">
                  <div className="rounded-2xl border border-border/50 bg-white p-6 shadow-sm">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-primary" />
                      Chính sách
                    </h3>
                    <ul className="space-y-4 text-sm">
                      <li>Bảo hành chính hãng</li>
                      <li>Lắp ráp miễn phí</li>
                      <li>Vận chuyển toàn quốc</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {Array.isArray(product?.relatedProducts) && product.relatedProducts.length > 0 && (
              <div className="mt-16">
                <h2 className="text-2xl font-bold mb-6">Sản phẩm tương tự</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {product.relatedProducts.slice(0, 4).map(item => (
                    <Link key={item.id} to={`/components/${item.slug}`} className="group">
                      <div className="aspect-square bg-slate-50 rounded-xl p-4 mb-2">
                        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain group-hover:scale-105 transition-transform" />
                      </div>
                      <p className="text-sm font-bold line-clamp-2">{item.name}</p>
                      <p className="text-primary font-black">{formatMoney(item.price)}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {recentlyViewed.length > 0 && (
              <div className="mt-16">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <History className="w-6 h-6 text-slate-400" />
                  Đã xem gần đây
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  {recentlyViewed.slice(0, 6).map(item => (
                    <Link key={item.id} to={`/components/${item.slug}`} className="text-center">
                      <div className="aspect-square bg-slate-50 rounded-xl p-2 mb-2">
                        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
                      </div>
                      <p className="text-[10px] font-bold truncate">{item.name}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="mt-8 text-center py-20">
            <p className="text-muted-foreground">Không tìm thấy sản phẩm</p>
          </div>
        )}
      </main>
    </div>
  );
}

function updateRecentlyViewed(product) {
  const entry = {
    id: product.id,
    slug: product.slug,
    name: product.name,
    imageUrl: product.imageUrl,
    price: product.price,
  };
  const key = "techbuiltai-recently-viewed";
  const existing = JSON.parse(localStorage.getItem(key) || "[]");
  const filtered = existing.filter(item => item.id !== entry.id);
  const next = [entry, ...filtered].slice(0, 12);
  localStorage.setItem(key, JSON.stringify(next));
  return next;
}

function formatMoney(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function formatDate(value) {
  return new Date(value).toLocaleString("vi-VN");
}

function formatRelativeTime(value) {
  const diff = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff/60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff/3600)} giờ trước`;
  return `${Math.floor(diff/86400)} ngày trước`;
}

function getCategoryStyle(slug) {
  const styles = {
    cpu: "bg-blue-100 text-blue-700",
    gpu: "bg-orange-100 text-orange-700",
    motherboard: "bg-purple-100 text-purple-700",
    ram: "bg-pink-100 text-pink-700",
    storage: "bg-emerald-100 text-emerald-700",
  };
  return styles[slug] || "bg-slate-100 text-slate-700";
}
