import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { format, subDays } from "date-fns";
import { Download, RefreshCw, DollarSign, Package, Users, Activity, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d", "#ffc658", "#a4de6c"];

export function AdminReportsPanel({ onShowDetail }) {
  const { token } = useAuth();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [period, setPeriod] = useState("day");
  
  const [dateRange, setDateRange] = useState({
    startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });

  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [isQuickAiThinking, setIsQuickAiThinking] = useState(false);

  const analyzeWithAI = async (customPrompt) => {
    if (!reportData) return;
    setIsAiAnalyzing(true);
    setAiMessages([]);
    try {
      const prompt = customPrompt || ("Bạn là trợ lý phân tích kinh doanh cho admin. Hãy trả lời ngắn gọn, rõ ý. Dữ liệu từ " + dateRange.startDate + " đến " + dateRange.endDate + " (period: " + period + "):\n" + JSON.stringify({
        sales: reportData.sales,
        rankings: reportData.rankings,
        profit: reportData.profit,
        imports: reportData.imports,
        charts: reportData.charts,
      }) + "\n\nHãy phân tích doanh thu, xu hướng, top bán chạy, top khách hàng, top đơn hàng và đưa ra 3 gợi ý hành động ngắn gọn.");
      
      const res = await fetch("/api/ai/chat-build", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ message: prompt, history: [] })
      });
      if (!res.ok) throw new Error("Lỗi khi gọi AI");
      const data = await res.json();
      setAiMessages([{ role: "assistant", content: data.reply || "AI không thể trả lời." }]);
    } catch (error) {
      console.error(error);
      toast({ title: "Lỗi phân tích AI", description: error.message, variant: "destructive" });
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const askGrowthIdeas = async () => {
    if (!reportData) return;
    setIsQuickAiThinking(true);
    try {
      await analyzeWithAI(
        "Bạn là chuyên gia tăng trưởng cho cửa hàng. Dựa trên dữ liệu này, hãy trả lời đúng 3 ý ngắn gọn: 1 chiến lược bán hàng, 1 gợi ý nhập hàng, 1 gợi ý gợi ý sản phẩm cho khách. Không giải thích dài."
      );
    } finally {
      setIsQuickAiThinking(false);
    }
  };

  const sendAiChat = async (e) => {
    e.preventDefault();
    if (!aiChatInput.trim() || isAiAnalyzing) return;
    
    const userMsg = aiChatInput.trim();
    const newHistory = [...aiMessages, { role: "user", content: userMsg }];
    setAiMessages(newHistory);
    setAiChatInput("");
    setIsAiAnalyzing(true);

    try {
      const res = await fetch("/api/ai/chat-build", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ message: userMsg, history: aiMessages })
      });
      if (!res.ok) throw new Error("Lỗi khi gọi AI");
      const data = await res.json();
      setAiMessages([...newHistory, { role: "assistant", content: data.reply || "AI không thể trả lời." }]);
    } catch (error) {
      console.error(error);
      toast({ title: "Lỗi Chat AI", description: error.message, variant: "destructive" });
      setAiMessages([...newHistory, { role: "assistant", content: "Xin lỗi, đã xảy ra lỗi khi kết nối AI." }]);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        period,
      });

      const res = await fetch(`/api/admin/reports?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error("Không thể tải báo cáo");
      const data = await res.json();
      setReportData(data);
    } catch (error) {
      console.error(error);
      toast({ title: "Lỗi tải báo cáo", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchReports();
    }
  }, [token, dateRange.startDate, dateRange.endDate, period]);

  const handleExportCSV = () => {
    if (!reportData) return;
    
    // Xuất cơ bản ra CSV
    const rows = [
      ["BÁO CÁO TỔNG QUAN DOANH THU"],
      ["Từ ngày:", dateRange.startDate, "Đến ngày:", dateRange.endDate],
      [],
      ["Tổng doanh thu", reportData.sales.totalRevenue],
      ["Tổng đơn hàng", reportData.sales.totalOrders],
      ["Đơn thành công", reportData.sales.successOrders],
      ["Đơn hủy/hoàn", reportData.sales.cancelledOrders],
      ["Lợi nhuận ước tính", reportData.profit.totalProfit],
    ];

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + rows.map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bao-cao-doanh-thu-${dateRange.startDate}-${dateRange.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
  };

  const topOrders = Array.isArray(reportData?.rankings?.topOrders) ? reportData.rankings.topOrders : [];
  const topProducts = Array.isArray(reportData?.products?.topSelling) ? reportData.products.topSelling : [];
  const topCustomers = Array.isArray(reportData?.customers?.topVIP) ? reportData.customers.topVIP : [];

  if (isLoading && !reportData) {
    return <div className="py-20 text-center"><RefreshCw className="animate-spin h-8 w-8 mx-auto text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-border/50 bg-secondary/30 p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="day">Theo ngày</option>
            <option value="month">Theo tháng</option>
            <option value="year">Theo năm</option>
            <option value="custom">Tự chọn</option>
          </select>
          <Input 
            type="date" 
            value={dateRange.startDate} 
            onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
            className="w-auto"
          />
          <span>-</span>
          <Input 
            type="date" 
            value={dateRange.endDate} 
            onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
            className="w-auto"
          />
          <Button onClick={fetchReports} disabled={isLoading}>
            Lọc
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100" onClick={() => analyzeWithAI()} disabled={isAiAnalyzing || !reportData}>
             {isAiAnalyzing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
             Hỏi AI
          </Button>
          <Button variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" onClick={askGrowthIdeas} disabled={isQuickAiThinking || !reportData}>
             {isQuickAiThinking ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
             Gợi ý cách phát triển
          </Button>
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Xuất báo cáo
          </Button>
        </div>
      </div>

      {(isAiAnalyzing || aiMessages.length > 0) && (
        <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl relative flex flex-col max-h-[500px]">
          <div className="p-4 border-b border-emerald-200">
            <h3 className="font-bold text-emerald-800 flex items-center gap-2">
              <Activity className="h-5 w-5" />
              AI Phân Tích Báo Cáo
            </h3>
          </div>
          
          <div className="p-4 overflow-y-auto flex-1 space-y-4">
            {aiMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 ${msg.role === "user" ? "bg-emerald-600 text-white" : "bg-white border border-emerald-100 text-emerald-900"}`}>
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}
            
            {isAiAnalyzing && (
              <div className="flex items-center gap-3 text-emerald-700 bg-white border border-emerald-100 p-3 rounded-2xl max-w-fit">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <p className="text-sm">AI đang suy nghĩ...</p>
              </div>
            )}
          </div>
          
          <div className="p-3 border-t border-emerald-200 bg-white rounded-b-2xl">
            <form onSubmit={sendAiChat} className="flex gap-2">
              <Input
                value={aiChatInput}
                onChange={(e) => setAiChatInput(e.target.value)}
                placeholder="Hỏi thêm AI về báo cáo này..."
                disabled={isAiAnalyzing}
                className="flex-1"
              />
              <Button type="submit" disabled={isAiAnalyzing || !aiChatInput.trim()}>
                Gửi
              </Button>
            </form>
          </div>
        </div>
      )}

      {reportData && (
        <>
          {/* Tổng quan Doanh Thu & Lợi Nhuận - Clickable Cards */}
          <div className="space-y-2">
            {/* Card: Doanh Thu */}
            <button
              onClick={() => onShowDetail && onShowDetail("revenue")}
              className="w-full bg-card border border-border/50 rounded-2xl p-5 hover:bg-secondary/30 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-primary">Doanh Thu</h3>
                    <p className="text-2xl font-bold text-primary mt-1">{formatCurrency(reportData.sales.totalRevenue)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{reportData.sales.successOrders} đơn thành công</p>
                  </div>
                </div>
                <Activity className="h-5 w-5 text-primary opacity-50" />
              </div>
            </button>

            {/* Card: Lợi Nhuận */}
            <button
              onClick={() => onShowDetail && onShowDetail("profit")}
              className="w-full bg-card border border-border/50 rounded-2xl p-5 hover:bg-secondary/30 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-green-600" />
                  <div>
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-green-600">Lợi Nhuận</h3>
                    <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(reportData.profit.totalProfit)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Dựa trên chênh lệch nhập xuất</p>
                  </div>
                </div>
                <Activity className="h-5 w-5 text-green-600 opacity-50" />
              </div>
            </button>

            {/* Card: Đơn Hàng */}
            <button
              onClick={() => onShowDetail && onShowDetail("orders")}
              className="w-full bg-card border border-border/50 rounded-2xl p-5 hover:bg-secondary/30 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-amber-600" />
                  <div>
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-amber-600">Đơn Hàng</h3>
                    <p className="text-2xl font-bold text-amber-600 mt-1">{reportData.sales.totalOrders}</p>
                    <p className="text-xs text-muted-foreground mt-1">TB: {formatCurrency(reportData.sales.averageOrderValue)} / đơn</p>
                  </div>
                </div>
                <Activity className="h-5 w-5 text-amber-600 opacity-50" />
              </div>
            </button>

            {/* Card: Đơn Hủy/Hoàn */}
            <button
              onClick={() => onShowDetail && onShowDetail("cancelled")}
              className="w-full bg-card border border-border/50 rounded-2xl p-5 hover:bg-secondary/30 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RefreshCw className="h-5 w-5 text-red-600" />
                  <div>
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-red-600">Đơn Hủy/Hoàn</h3>
                    <p className="text-2xl font-bold text-red-600 mt-1">{reportData.sales.cancelledOrders}</p>
                    <p className="text-xs text-muted-foreground mt-1">Tỷ lệ: {reportData.sales.totalOrders > 0 ? Math.round((reportData.sales.cancelledOrders / reportData.sales.totalOrders) * 100) : 0}%</p>
                  </div>
                </div>
                <Activity className="h-5 w-5 text-red-600 opacity-50" />
              </div>
            </button>
          </div>

          {/* Biểu đồ Doanh thu (Line Chart) */}
          <div className="bg-card border border-border/50 p-6 rounded-2xl">
            <h3 className="text-lg font-bold mb-6">Biểu đồ Doanh Thu & Lợi Nhuận</h3>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reportData.charts.revenueTrend} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{fontSize: 12}} />
                  <YAxis tickFormatter={(val) => `${val / 1000000}M`} width={80} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Line type="monotone" name="Doanh Thu" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                  <Line type="monotone" name="Lợi Nhuận" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
            <h3 className="mb-6 text-lg font-bold">Bảng xếp hạng</h3>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="rounded-2xl border border-border/50 p-5">
                <h4 className="mb-4 text-base font-semibold">Đơn hàng giá trị cao nhất</h4>
                <div className="space-y-3">
                  {topOrders.length > 0 ? (
                    topOrders.map((order, index) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between gap-3 border-b border-border/30 pb-2 last:border-0 last:pb-0"
                      >
                        <div>
                          <p className="line-clamp-1 text-sm font-medium">
                            #{index + 1} {order.code}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {order.userName} · {order.itemCount} món
                          </p>
                        </div>
                        <p className="text-sm font-bold text-primary">
                          {formatCurrency(order.totalAmount)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Chưa có dữ liệu
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border/50 p-5">
                <h4 className="mb-4 text-base font-semibold">Sản phẩm bán chạy nhất</h4>
                <div className="space-y-4">
                  {topProducts.length > 0 ? (
                    topProducts.map((product, index) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between border-b border-border/30 pb-3 last:border-0 last:pb-0"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            #{index + 1}
                          </div>
                          <div>
                            <p className="line-clamp-1 text-sm font-medium">
                              {product.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {product.quantity} đã bán
                            </p>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-primary">
                          {formatCurrency(product.revenue)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Chưa có dữ liệu
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border/50 p-5">
                <h4 className="mb-4 text-base font-semibold">Người dùng mua nhiều nhất</h4>
                <div className="space-y-4">
                  {topCustomers.length > 0 ? (
                    topCustomers.map((customer, index) => (
                      <div
                        key={customer.id}
                        className="flex items-center justify-between border-b border-border/30 pb-3 last:border-0 last:pb-0"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-xs font-bold text-amber-600">
                            {index + 1}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{customer.fullName}</p>
                            <p className="text-xs text-muted-foreground">{customer.email}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-amber-600">
                            {formatCurrency(customer.totalSpent)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {customer.orderCount} đơn hàng
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Chưa có dữ liệu
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border/50 p-6">
            <h3 className="mb-6 text-lg font-bold">Doanh Thu Theo Danh Mục</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={reportData.categories.revenue}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {reportData.categories.revenue.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cảnh báo tồn kho */}
            <div className="bg-card border border-border/50 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-red-500 mb-6 flex items-center gap-2">
                Cảnh Báo Sắp Hết Hàng
              </h3>
              <div className="space-y-4">
                {reportData.products.lowStock.length > 0 ? (
                  reportData.products.lowStock.map((product) => (
                    <div key={product.id} className="flex justify-between items-center border-b border-border/30 pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="font-medium text-sm line-clamp-1">{product.name}</p>
                        <p className="text-xs text-muted-foreground">Ngưỡng: {product.lowStockThreshold || 5}</p>
                      </div>
                      <div className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">
                        Còn {product.stockQuantity}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-4">Kho hàng dồi dào, không có cảnh báo</p>
                )}
              </div>
            </div>

            <div className="bg-card border border-border/50 p-6 rounded-2xl">
              <h3 className="text-lg font-bold mb-6">Biểu đồ theo thời gian</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={reportData.charts.revenueTrend} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tick={{fontSize: 12}} />
                    <YAxis tickFormatter={(val) => `${val / 1000000}M`} width={80} />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Legend />
                    <Line type="monotone" name="Doanh Thu" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                    <Line type="monotone" name="Lợi Nhuận" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-2">
            <Button className="shadow-lg" onClick={() => analyzeWithAI()} disabled={!reportData || isAiAnalyzing}>
              <Activity className="mr-2 h-4 w-4" /> Hỏi AI
            </Button>
            <Button variant="outline" className="bg-white shadow-lg" onClick={askGrowthIdeas} disabled={!reportData || isQuickAiThinking}>
              <Sparkles className="mr-2 h-4 w-4" /> Gợi ý phát triển
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
