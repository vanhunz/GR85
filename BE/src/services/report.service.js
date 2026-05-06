import { prisma } from "../db/prisma.js";
import { serializeData } from "../utils/serialize.js";
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  format,
  differenceInDays,
} from "date-fns";

export async function getAdminReports(filters = {}) {
  const { startDate, endDate, period } = filters;

  const start = startDate ? new Date(startDate) : subDays(new Date(), 30);
  const end = endDate ? new Date(endDate) : new Date();
  const selectedPeriod = String(period || "day").toLowerCase();
  const effectivePeriod =
    selectedPeriod === "month" || selectedPeriod === "year"
      ? selectedPeriod
      : selectedPeriod === "custom"
        ? differenceInDays(end, start) > 730
          ? "year"
          : differenceInDays(end, start) > 60
            ? "month"
            : "day"
        : "day";

  const startIso = startOfDay(start);
  const endIso = endOfDay(end);

  const dateFilter = {
    createdAt: {
      gte: startIso,
      lte: endIso,
    },
  };

  // 1. Báo cáo bán hàng
  const orders = await prisma.order.findMany({
    where: dateFilter,
    include: {
      orderItems: {
        include: {
          product: {
            include: {
              category: true,
            },
          },
        },
      },
    },
  });

  let totalRevenue = 0;
  let successOrders = 0;
  let cancelledOrders = 0;

  orders.forEach((order) => {
    if (["PROCESSING", "SHIPPING", "DELIVERED"].includes(order.orderStatus)) {
      totalRevenue += Number(order.totalAmount);
      successOrders++;
    } else if (order.orderStatus === "CANCELLED" || order.orderStatus === "RETURNED") {
      cancelledOrders++;
    }
  });

  const totalOrders = orders.length;
  const averageOrderValue = successOrders > 0 ? totalRevenue / successOrders : 0;

  // 2. Báo cáo sản phẩm (Top bán chạy) & 3. Báo cáo danh mục
  const productSales = {};
  const categorySales = {};

  orders.forEach((order) => {
    if (!["PROCESSING", "SHIPPING", "DELIVERED"].includes(order.orderStatus)) return;

    order.orderItems.forEach((item) => {
      const productId = item.productId;
      const categoryName = item.product?.category?.name || "Khác";

      if (!productSales[productId]) {
        productSales[productId] = {
          id: productId,
          name: item.product?.name,
          quantity: 0,
          revenue: 0,
        };
      }
      productSales[productId].quantity += item.quantity;
      productSales[productId].revenue += Number(item.price) * item.quantity;

      if (!categorySales[categoryName]) {
        categorySales[categoryName] = 0;
      }
      categorySales[categoryName] += Number(item.price) * item.quantity;
    });
  });

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const topOrders = orders
    .filter((order) => ["PROCESSING", "SHIPPING", "DELIVERED"].includes(order.orderStatus))
    .map((order) => ({
      id: order.id,
      code: order.orderCode || `#${order.id}`,
      userName: order.user?.fullName || order.user?.email || "Khách hàng",
      totalAmount: Number(order.totalAmount || 0),
      itemCount: Array.isArray(order.orderItems) ? order.orderItems.length : 0,
      status: order.orderStatus,
      createdAt: order.createdAt,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 10);

  const categoryChartData = Object.entries(categorySales).map(([name, value]) => ({
    name,
    value,
  }));

  // Tồn kho
  const productsStock = await prisma.product.findMany({
    select: { id: true, name: true, stockQuantity: true, lowStockThreshold: true },
  });

  const highStockProducts = [...productsStock]
    .sort((a, b) => Number(b.stockQuantity) - Number(a.stockQuantity))
    .slice(0, 10);
  
  const lowStockProducts = productsStock
    .filter((p) => Number(p.stockQuantity) <= Number(p.lowStockThreshold || 5))
    .sort((a, b) => Number(a.stockQuantity) - Number(b.stockQuantity))
    .slice(0, 10);

  // 4. Báo cáo khách hàng VIP
  const customerSpending = {};
  orders.forEach((order) => {
    if (!["PROCESSING", "SHIPPING", "DELIVERED"].includes(order.orderStatus)) return;
    if (!order.userId) return;

    if (!customerSpending[order.userId]) {
      customerSpending[order.userId] = {
        userId: order.userId,
        totalSpent: 0,
        orderCount: 0,
      };
    }
    customerSpending[order.userId].totalSpent += Number(order.totalAmount);
    customerSpending[order.userId].orderCount += 1;
  });

  const topCustomerIds = Object.keys(customerSpending)
    .map(Number)
    .sort((a, b) => customerSpending[b].totalSpent - customerSpending[a].totalSpent)
    .slice(0, 10);

  const topCustomersData = await prisma.user.findMany({
    where: { id: { in: topCustomerIds } },
    select: { id: true, fullName: true, email: true },
  });

  const topCustomers = topCustomersData.map((user) => ({
    ...user,
    totalSpent: customerSpending[user.id].totalSpent,
    orderCount: customerSpending[user.id].orderCount,
  })).sort((a, b) => b.totalSpent - a.totalSpent);

  // 5. Báo cáo nhập hàng
  const batches = await prisma.batch.findMany({
    where: dateFilter,
    include: { supplier: true },
  });

  let totalImportCost = 0;
  const supplierImports = {};

  batches.forEach((batch) => {
    totalImportCost += Number(batch.totalCost || 0);
    const supplierName = batch.supplier?.name || "Khác";
    if (!supplierImports[supplierName]) {
      supplierImports[supplierName] = 0;
    }
    supplierImports[supplierName] += Number(batch.totalCost || 0);
  });

  const topSuppliers = Object.entries(supplierImports)
    .map(([name, cost]) => ({ name, cost }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  // 6. Báo cáo lợi nhuận
  const totalProfit = totalRevenue - totalImportCost;

  // 7. Biểu đồ doanh thu (Trend)
  const revenueChartMap = {};

  const getBucketInfo = (dateValue) => {
    const sourceDate = new Date(dateValue);

    if (effectivePeriod === "year") {
      return { key: format(sourceDate, "yyyy"), sortAt: startOfYear(sourceDate) };
    }

    if (effectivePeriod === "month") {
      return { key: format(sourceDate, "MM/yyyy"), sortAt: startOfMonth(sourceDate) };
    }

    return { key: format(sourceDate, "dd/MM/yyyy"), sortAt: startOfDay(sourceDate) };
  };

  orders.forEach((order) => {
    if (!["PROCESSING", "SHIPPING", "DELIVERED"].includes(order.orderStatus)) return;
    const bucket = getBucketInfo(order.createdAt);

    if (!revenueChartMap[bucket.key]) {
      revenueChartMap[bucket.key] = { date: bucket.key, revenue: 0, profit: 0, sortAt: bucket.sortAt };
    }
    revenueChartMap[bucket.key].revenue += Number(order.totalAmount);
  });

  // Gộp chi phí nhập vào biểu đồ lợi nhuận
  batches.forEach((batch) => {
    const bucket = getBucketInfo(batch.createdAt);

    if (!revenueChartMap[bucket.key]) {
      revenueChartMap[bucket.key] = { date: bucket.key, revenue: 0, profit: 0, sortAt: bucket.sortAt };
    }
    // Lợi nhuận = Doanh thu - Chi phí nhập trong ngày đó (đơn giản hóa)
    revenueChartMap[bucket.key].profit -= Number(batch.totalCost || 0);
  });

  // Tính lợi nhuận ròng trên biểu đồ
  Object.values(revenueChartMap).forEach((item) => {
    item.profit += item.revenue; // Profit = Revenue - Cost (Cost already subtracted above)
  });

  // Sắp xếp biểu đồ theo thời gian
  const revenueChartData = Object.values(revenueChartMap).sort((a, b) => {
    const timeA = a.sortAt ? new Date(a.sortAt).getTime() : 0;
    const timeB = b.sortAt ? new Date(b.sortAt).getTime() : 0;
    return timeA - timeB;
  });

  return serializeData({
    sales: {
      totalRevenue,
      totalOrders,
      successOrders,
      cancelledOrders,
      averageOrderValue,
    },
    rankings: {
      topOrders,
    },
    products: {
      topSelling: topProducts,
      highStock: highStockProducts,
      lowStock: lowStockProducts,
    },
    categories: {
      revenue: categoryChartData,
    },
    customers: {
      topVIP: topCustomers,
    },
    imports: {
      totalCost: totalImportCost,
      importCount: batches.length,
      topSuppliers,
    },
    profit: {
      totalProfit,
    },
    charts: {
      revenueTrend: revenueChartData,
    },
    period: effectivePeriod,
  });
}
