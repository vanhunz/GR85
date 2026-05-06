import { useState, useEffect } from "react";
import { ArrowLeft, Download, RefreshCw, AlertTriangle } from "lucide-react";
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

export function CancelledDetailPage({ onBack, dateRange: initialDateRange, period: initialPeriod }) {
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
      ["CHI TIẾT ĐƠN HỦYDOANH/HOÀN"],
      ["Từ ngày:", dateRange.startDate, "Đến ngày:", dateRange.endDate],
      [],
      ["Đơn hủy/hoàn", reportData.sales.cancelledOrders],
      ["Tổng đơn hàng", reportData.sales.totalOrders],
      ["Tỷ lệ hủy", Math.round((reportData.sales.cancelledOrders / reportData.sales.totalOrders) * 100) + "%"],
    ];

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + rows.map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `chi-tiet-don-huy-${dateRange.startDate}-${dateRange.endDate}.csv`);
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

  const cancelRate = reportData?.sales?.totalOrders > 0 
    ? Math.round((reportData.sales.cancelledOrders / reportData.sales.totalOrders) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              Chi Tiết Đơn Hủy/Hoàn
            </h1>
            <p className="text-muted-foreground">Theo dõi các đơn hàng bị hủy hoặc hoàn tiền</p>
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
          {/* Alert Box */}
          {cancelRate > 10 && (
            <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-900">Cảnh Báo: Tỷ Lệ Hủy Cao</p>
                <p className="text-sm text-red-700">Tỷ lệ hủy/hoàn {cancelRate}% vượt ngưỡng cảnh báo 10%. Kiểm tra kỹ lý do hủy và chất lượng dịch vụ.</p>
              </div>
            </div>
          )}

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-red-500/5 border border-red-500/20 p-6 rounded-2xl">
              <p className="text-sm text-muted-foreground mb-2">Tổng Đơn Hủy/Hoàn</p>
              <p className="text-3xl font-bold text-red-600">{reportData.sales.cancelledOrders}</p>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/20 p-6 rounded-2xl">
              <p className="text-sm text-muted-foreground mb-2">Tổng Đơn Hàng</p>
              <p className="text-3xl font-bold text-amber-600">{reportData.sales.totalOrders}</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-2xl">
              <p className="text-sm text-muted-foreground mb-2">Tỷ Lệ Hủy</p>
              <p className="text-3xl font-bold text-red-600">{cancelRate}%</p>
              <p className="text-xs text-muted-foreground mt-2">
                {cancelRate > 10 ? "⚠️ Cao hơn tiêu chuẩn" : "✓ Trong mức bình thường"}
              </p>
            </div>
          </div>

          {/* Trend Chart */}
          <div className="bg-card border border-border/50 p-6 rounded-2xl">
            <h3 className="text-lg font-bold mb-6">Biểu Đồ Xu Hướng Hủy Đơn</h3>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reportData.charts.revenueTrend} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{fontSize: 12}} />
                  <YAxis width={80} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" name="Doanh Thu" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{r: 3}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border border-border/50 p-6 rounded-2xl">
              <h3 className="text-lg font-bold mb-4">So Sánh Thời Kỳ</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Đơn hàng thành công</span>
                  <span className="font-semibold">{reportData.sales.successOrders}</span>
                </div>
                <div className="flex justify-between items-center border-t border-border/30 pt-3">
                  <span className="text-muted-foreground">Đơn hàng hủy/hoàn</span>
                  <span className="font-semibold text-red-600">{reportData.sales.cancelledOrders}</span>
                </div>
                <div className="flex justify-between items-center border-t border-border/30 pt-3">
                  <span className="text-muted-foreground">Tổng cộng</span>
                  <span className="font-semibold">{reportData.sales.totalOrders}</span>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border/50 p-6 rounded-2xl">
              <h3 className="text-lg font-bold mb-4">Khuyến Nghị</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <span className="text-amber-600">•</span>
                  <span>Kiểm tra chất lượng sản phẩm và quy trình đóng gói</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-600">•</span>
                  <span>Liên hệ khách hàng để hiểu lý do hủy đơn</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-600">•</span>
                  <span>Cải thiện dịch vụ khách hàng và hỗ trợ sau bán hàng</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-600">•</span>
                  <span>Tối ưu hóa thời gian giao hàng và chi phí vận chuyển</span>
                </li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
