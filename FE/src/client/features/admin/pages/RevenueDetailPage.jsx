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

export function RevenueDetailPage({ onBack, dateRange: initialDateRange, period: initialPeriod }) {
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
      ["CHI TIẾT DOANH THU"],
      ["Từ ngày:", dateRange.startDate, "Đến ngày:", dateRange.endDate],
      [],
      ["Tổng doanh thu", reportData.sales.totalRevenue],
      ["Tổng đơn hàng", reportData.sales.totalOrders],
      ["Đơn thành công", reportData.sales.successOrders],
      ["Giá trị trung bình", reportData.sales.averageOrderValue],
    ];

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + rows.map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `chi-tiet-doanh-thu-${dateRange.startDate}-${dateRange.endDate}.csv`);
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
            <h1 className="text-2xl font-bold">Chi Tiết Doanh Thu</h1>
            <p className="text-muted-foreground">Phân tích chi tiết doanh thu trong khoảng thời gian</p>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-primary/5 border border-primary/20 p-6 rounded-2xl">
              <p className="text-sm text-muted-foreground mb-2">Tổng Doanh Thu</p>
              <p className="text-3xl font-bold text-primary">{formatCurrency(reportData.sales.totalRevenue)}</p>
            </div>
            <div className="bg-green-500/5 border border-green-500/20 p-6 rounded-2xl">
              <p className="text-sm text-muted-foreground mb-2">Đơn Hàng Thành Công</p>
              <p className="text-3xl font-bold text-green-600">{reportData.sales.successOrders}</p>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/20 p-6 rounded-2xl">
              <p className="text-sm text-muted-foreground mb-2">Giá Trị Trung Bình / Đơn</p>
              <p className="text-3xl font-bold text-amber-600">{formatCurrency(reportData.sales.averageOrderValue)}</p>
            </div>
          </div>

          {/* Revenue Trend Chart */}
          <div className="bg-card border border-border/50 p-6 rounded-2xl">
            <h3 className="text-lg font-bold mb-6">Biểu Đồ Doanh Thu Theo Thời Gian</h3>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reportData.charts.revenueTrend} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{fontSize: 12}} />
                  <YAxis tickFormatter={(val) => `${val / 1000000}M`} width={80} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Line type="monotone" name="Doanh Thu" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Orders by Status */}
          <div className="bg-card border border-border/50 p-6 rounded-2xl">
            <h3 className="text-lg font-bold mb-6">Thống Kê Đơn Hàng</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-border/50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Tổng Đơn Hàng</p>
                <p className="text-2xl font-bold mt-2">{reportData.sales.totalOrders}</p>
              </div>
              <div className="border border-border/50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Đơn Hủy / Hoàn</p>
                <p className="text-2xl font-bold text-red-600 mt-2">{reportData.sales.cancelledOrders}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tỷ lệ: {reportData.sales.totalOrders > 0 ? Math.round((reportData.sales.cancelledOrders / reportData.sales.totalOrders) * 100) : 0}%
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
