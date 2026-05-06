import { useState, useEffect } from "react";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format, subDays } from "date-fns";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export function OrdersDetailPage({ onBack, dateRange: initialDateRange, period: initialPeriod }) {
  const { token } = useAuth();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [period, setPeriod] = useState(initialPeriod || "day");
  
  const [dateRange, setDateRange] = useState(
    initialDateRange || {
      startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
      endDate: format(new Date(), "yyyy-MM-dd"),
    }
  );

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        period,
      });

      const res = await fetch(`/api/admin/reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
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
    if (token) fetchReports();
  }, [token, dateRange.startDate, dateRange.endDate, period]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
  };

  const handleExportCSV = () => {
    if (!reportData) return;
    
    const rows = [
      ["CHI TIẾT ĐƠN HÀNG"],
      ["Từ ngày:", dateRange.startDate, "Đến ngày:", dateRange.endDate],
      [],
      ["Tổng đơn hàng", reportData.sales.totalOrders],
      ["Đơn thành công", reportData.sales.successOrders],
      ["Đơn hủy/hoàn", reportData.sales.cancelledOrders],
      ["Giá trị trung bình", reportData.sales.averageOrderValue],
    ];

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + rows.map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `chi-tiet-don-hang-${dateRange.startDate}-${dateRange.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (isLoading && !reportData) {
    return (
      <div className="py-20 text-center">
        <RefreshCw className="animate-spin h-8 w-8 mx-auto text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Chi Tiết Đơn Hàng</h1>
            <p className="text-muted-foreground">Thống kê chi tiết về các đơn hàng</p>
          </div>
        </div>
        <Button onClick={handleExportCSV} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Xuất báo cáo
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border/50 p-4 rounded-2xl flex flex-wrap items-center gap-3">
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
          Cập nhật
        </Button>
      </div>

      {reportData && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-amber-500/5 border border-amber-500/20 p-6 rounded-2xl">
              <p className="text-sm text-muted-foreground mb-2">Tổng Đơn Hàng</p>
              <p className="text-3xl font-bold text-amber-600">{reportData.sales.totalOrders}</p>
            </div>
            <div className="bg-green-500/5 border border-green-500/20 p-6 rounded-2xl">
              <p className="text-sm text-muted-foreground mb-2">Đơn Thành Công</p>
              <p className="text-3xl font-bold text-green-600">{reportData.sales.successOrders}</p>
            </div>
            <div className="bg-red-500/5 border border-red-500/20 p-6 rounded-2xl">
              <p className="text-sm text-muted-foreground mb-2">Đơn Hủy/Hoàn</p>
              <p className="text-3xl font-bold text-red-600">{reportData.sales.cancelledOrders}</p>
            </div>
            <div className="bg-primary/5 border border-primary/20 p-6 rounded-2xl">
              <p className="text-sm text-muted-foreground mb-2">Giá Trị TB/Đơn</p>
              <p className="text-3xl font-bold text-primary">{formatCurrency(reportData.sales.averageOrderValue)}</p>
            </div>
          </div>

          {/* Orders Trend Chart */}
          <div className="bg-card border border-border/50 p-6 rounded-2xl">
            <h3 className="text-lg font-bold mb-6">Biểu Đồ Số Lượng Đơn Hàng</h3>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportData.charts.revenueTrend} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{fontSize: 12}} />
                  <YAxis width={60} />
                  <Tooltip />
                  <Legend />
                  <Bar name="Doanh Thu" dataKey="revenue" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Order Status Distribution */}
          <div className="bg-card border border-border/50 p-6 rounded-2xl">
            <h3 className="text-lg font-bold mb-6">Phân Bố Trạng Thái Đơn Hàng</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-border/50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Tỷ Lệ Thành Công</p>
                <p className="text-2xl font-bold text-green-600 mt-2">
                  {reportData.sales.totalOrders > 0 ? Math.round((reportData.sales.successOrders / reportData.sales.totalOrders) * 100) : 0}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">{reportData.sales.successOrders} / {reportData.sales.totalOrders} đơn</p>
              </div>
              <div className="border border-border/50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Tỷ Lệ Hủy/Hoàn</p>
                <p className="text-2xl font-bold text-red-600 mt-2">
                  {reportData.sales.totalOrders > 0 ? Math.round((reportData.sales.cancelledOrders / reportData.sales.totalOrders) * 100) : 0}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">{reportData.sales.cancelledOrders} / {reportData.sales.totalOrders} đơn</p>
              </div>
            </div>
          </div>

          {/* Top Orders */}
          <div className="bg-card border border-border/50 p-6 rounded-2xl">
            <h3 className="text-lg font-bold mb-6">Top 10 Đơn Hàng Giá Trị Cao Nhất</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {Array.isArray(reportData?.rankings?.topOrders) && reportData.rankings.topOrders.length > 0 ? (
                reportData.rankings.topOrders.map((order, idx) => (
                  <div key={order.id} className="flex items-center justify-between border-b border-border/30 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        #{idx + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{order.code}</p>
                        <p className="text-xs text-muted-foreground">{order.userName} · {order.itemCount} sản phẩm</p>
                      </div>
                    </div>
                    <p className="font-bold text-primary">{formatCurrency(order.totalAmount)}</p>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">Chưa có dữ liệu</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
