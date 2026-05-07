#!/usr/bin/env node
/**
 * AUTO GENERATE PRODUCTS SCRIPT
 * 
 * Tự động tạo sản phẩm bằng:
 * - Groq API để generate dữ liệu
 * - Pexels API để tìm và download ảnh
 * - MySQL để lưu dữ liệu
 * 
 * Usage:
 *   node scripts/autoGenerateProducts.js
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===================== CONSTANTS =====================

const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads", "products");
const BATCH_SIZE = Number(process.env.GENERATOR_BATCH_SIZE || 10); // số sản phẩm tạo 1 lần
const CATEGORY_LIMIT = Number(process.env.GENERATOR_CATEGORY_LIMIT || 0); // 0 = tất cả category
const IMAGES_PER_PRODUCT = 4; // số ảnh trên mỗi sản phẩm (1 primary + 3 secondary)
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 30000; // 30 seconds
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// ===================== LOGGER =====================

const logger = {
  log: (prefix, msg) => console.log(`[${prefix}] ${msg}`),
  error: (prefix, msg) => console.error(`[${prefix}] ❌ ${msg}`),
  success: (prefix, msg) => console.log(`[${prefix}] ✅ ${msg}`),
  info: (prefix, msg) => console.log(`[${prefix}] ℹ️  ${msg}`),
};

// ===================== INITIALIZE =====================

// Đảm bảo folder uploads/products/ tồn tại
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  logger.log("INIT", `Created uploads directory: ${UPLOADS_DIR}`);
}

const prisma = new PrismaClient();

// ===================== UTILITIES =====================

/**
 * Sanitize filename - loại bỏ ký tự đặc biệt
 */
function sanitizeFilename(filename) {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);
}

/**
 * Generate random filename để tránh duplicate
 */
function generateRandomFilename(ext) {
  const random = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now();
  return `${timestamp}_${random}${ext}`;
}

/**
 * Sleep function
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry logic cho API calls
 */
async function retryAsync(fn, maxRetries = MAX_RETRIES, label = "") {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      const delay = Math.pow(2, i) * 1000; // exponential backoff
      logger.log("RETRY", `${label} - Retry ${i + 1}/${maxRetries} sau ${delay}ms`);
      await sleep(delay);
    }
  }
}

// ===================== AI GENERATION =====================

/**
 * Generate product data từ Groq
 */
async function generateProductsFromAI(categoryName, count = 5) {
  try {
    logger.log("AI", `Generating ${count} products cho category: ${categoryName}`);

    const prompt = `
Tạo ${count} sản phẩm laptop/máy tính cao cấp có tên tiếng Việt.

Format JSON (không kèm markdown code block, chỉ JSON):
[
  {
    "name": "Tên sản phẩm",
    "shortDescription": "Mô tả ngắn 1 dòng",
    "fullDescription": "Mô tả đầy đủ 3-4 dòng chi tiết công nghệ",
    "brand": "Hãng sản xuất",
    "price": 10000000,
    "specs": {
      "CPU": "Intel Core i7-13700K",
      "RAM": "16GB DDR5",
      "GPU": "RTX 4070",
      "Storage": "1TB NVMe SSD",
      "Display": "15.6 inch 2.5K 165Hz",
      "Weight": "2.2kg",
      "Battery": "8 giờ"
    },
    "inTheBox": "Laptop, Adapter, Cable, Manual",
    "warrantyMonths": 24,
    "searchKeywords": "laptop gaming, gaming computer, high performance laptop"
  }
]

Yêu cầu:
- Sản phẩm phải phù hợp với category: ${categoryName}
- Tên sản phẩm phải ngắn, không dài quá 100 ký tự
- Giá phải hợp lý (đơn vị VND)
- Specs phải chi tiết, chính xác
- searchKeywords để dùng cho Pexels image search
- JSON phải valid, không có trailing commas
- Output chỉ là JSON array, không có text khác
`;

    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY not configured");
    }

    const response = await retryAsync(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
          const groqResponse = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: GROQ_MODEL,
              messages: [
                {
                  role: "user",
                  content: prompt,
                },
              ],
              temperature: 0.7,
              max_tokens: 2000,
            }),
            signal: controller.signal,
          });

          if (!groqResponse.ok) {
            const errorText = await groqResponse.text();
            throw new Error(
              `Groq API error ${groqResponse.status}: ${errorText.slice(0, 300)}`,
            );
          }

          return await groqResponse.json();
        } finally {
          clearTimeout(timeoutId);
        }
      },
      MAX_RETRIES,
      `Groq generation for ${categoryName}`,
    );

    let jsonText = response.choices?.[0]?.message?.content || "[]";
    // Remove markdown code block nếu có
    jsonText = jsonText
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const products = JSON.parse(jsonText);
    logger.success("AI", `Generated ${products.length} products from AI`);
    return products;
  } catch (error) {
    logger.error("AI", `Failed to generate products: ${error.message}`);
    throw error;
  }
}

// ===================== IMAGE SEARCH & DOWNLOAD =====================

/**
 * Search images từ Pexels
 */
async function searchPexelsImages(query, perPage = 5) {
  if (!process.env.PEXELS_API_KEY) {
    logger.error("PEXELS", "PEXELS_API_KEY not configured");
    return [];
  }

  try {
    logger.log("PEXELS", `Searching images for: "${query}"`);

    const response = await retryAsync(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
          const url = new URL("https://api.pexels.com/v1/search");
          url.searchParams.set("query", query);
          url.searchParams.set("per_page", String(perPage));
          url.searchParams.set("orientation", "landscape");

          const pexelsResponse = await fetch(url, {
            headers: {
              Authorization: process.env.PEXELS_API_KEY,
            },
            signal: controller.signal,
          });

          if (!pexelsResponse.ok) {
            const errorText = await pexelsResponse.text();
            throw new Error(
              `Pexels API error ${pexelsResponse.status}: ${errorText.slice(0, 300)}`,
            );
          }

          return await pexelsResponse.json();
        } finally {
          clearTimeout(timeoutId);
        }
      },
      MAX_RETRIES,
      `Pexels search for ${query}`
    );

    const photos = response.photos || [];
    logger.success("PEXELS", `Found ${photos.length} images for "${query}"`);

    return photos.map((photo) => ({
      url: photo.src.large,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
    }));
  } catch (error) {
    logger.error("PEXELS", `Search failed: ${error.message}`);
    return [];
  }
}

/**
 * Download image từ URL và lưu local
 */
async function downloadImage(imageUrl, altText = "product-image") {
  try {
    const response = await retryAsync(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
          const downloadResponse = await fetch(imageUrl, {
            signal: controller.signal,
          });

          if (!downloadResponse.ok) {
            const errorText = await downloadResponse.text();
            throw new Error(
              `Image download error ${downloadResponse.status}: ${errorText.slice(0, 300)}`,
            );
          }

          const buffer = Buffer.from(await downloadResponse.arrayBuffer());
          return buffer;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      MAX_RETRIES,
      `Download image from ${imageUrl.slice(0, 50)}`
    );

    const ext = ".jpg"; // Pexels mostly return jpg
    const filename = generateRandomFilename(ext);
    const filepath = path.join(UPLOADS_DIR, filename);

    fs.writeFileSync(filepath, response);
    logger.success("DOWNLOAD", `Downloaded: ${filename}`);

    return {
      filename,
      filepath,
      relativeUrl: `/uploads/products/${filename}`,
    };
  } catch (error) {
    logger.error("DOWNLOAD", `Failed to download: ${error.message}`);
    return null;
  }
}

/**
 * Fetch images cho sản phẩm
 * - 1 ảnh primary (thumbnail)
 * - 3-5 ảnh secondary (detail images)
 */
async function fetchProductImages(productName, searchKeywords, maxImages = 4) {
  const images = [];

  try {
    // Search keywords thường cho kết quả tốt hơn
    const searchQuery = searchKeywords || productName;

    // Download images từ Pexels
    const pexelsPhotos = await searchPexelsImages(searchQuery, maxImages + 2);

    if (pexelsPhotos.length === 0) {
      logger.error("IMAGE", `No images found for "${productName}"`);
      return images;
    }

    // Download từng ảnh
    let downloaded = 0;
    for (const photo of pexelsPhotos) {
      if (downloaded >= maxImages) break;

      const imageData = await downloadImage(photo.url, productName);
      if (imageData) {
        images.push({
          imageUrl: imageData.relativeUrl,
          isPrimary: downloaded === 0, // First image is primary
          sortOrder: downloaded,
          altText: `${productName} - ${productName}`,
        });
        downloaded++;
        await sleep(500); // Rate limiting
      }
    }

    logger.success("IMAGE", `Fetched ${images.length}/${maxImages} images for "${productName}"`);
  } catch (error) {
    logger.error("IMAGE", `Error fetching images: ${error.message}`);
  }

  return images;
}

// ===================== DATABASE OPERATIONS =====================

/**
 * Get all categories từ database
 */
async function getAllCategories() {
  try {
    const categories = await prisma.category.findMany({
      where: {
        isActive: true,
        isDeleted: false,
      },
      orderBy: { name: "asc" },
    });

    return categories;
  } catch (error) {
    logger.error("MYSQL", `Failed to fetch categories: ${error.message}`);
    throw error;
  }
}

/**
 * Get default supplier (nếu có)
 */
async function getDefaultSupplier() {
  try {
    const supplier = await prisma.supplier.findFirst({
      orderBy: { id: "asc" },
    });
    return supplier;
  } catch (error) {
    logger.error("MYSQL", `Failed to fetch supplier: ${error.message}`);
    return null;
  }
}

/**
 * Check nếu product code đã tồn tại
 */
async function isProductCodeExists(slug) {
  try {
    const existing = await prisma.product.findUnique({
      where: { slug },
    });
    return !!existing;
  } catch (error) {
    return false;
  }
}

/**
 * Generate unique product code
 */
async function generateUniqueProductCode(baseName) {
  let code = `AUTO_${sanitizeFilename(baseName).toUpperCase().slice(0, 20)}`;
  let counter = 1;

  while (await isProductCodeExists(code.toLowerCase())) {
    code = `AUTO_${sanitizeFilename(baseName).toUpperCase().slice(0, 15)}_${counter}`;
    counter++;
  }

  return code;
}

/**
 * Create product trong database
 */
async function createProductInDatabase(productData, categoryId, images, supplierId) {
  try {
    const productCode = await generateUniqueProductCode(productData.name);

    logger.log("MYSQL", `Creating product: "${productData.name}" (code: ${productCode})`);

    // Prepare product data theo schema hiện tại
    const product = await prisma.product.create({
      data: {
        name: productData.name,
        slug: productCode.toLowerCase(),
        categoryId,
        supplierId: supplierId || null,
        price: productData.price,
        salePrice: null,
        warrantyMonths: productData.warrantyMonths || 12,
        stockQuantity: Math.floor(Math.random() * 50) + 10, // Random stock 10-60
        lowStockThreshold: 5,
        isHomepageFeatured: false,
        displayOrder: 9999,
        specifications: productData.specs || {},
        status: "ACTIVE",
        // Create images
        images: {
          create: images.map((img) => ({
            imageUrl: img.imageUrl,
            isPrimary: img.isPrimary || false,
            sortOrder: img.sortOrder || 0,
            altText: img.altText || productData.name,
          })),
        },
      },
      include: {
        images: true,
      },
    });

    // Create product detail
    if (productData.fullDescription || productData.inTheBox) {
      await prisma.productDetail.create({
        data: {
          productId: product.id,
          fullDescription: productData.fullDescription || null,
          inTheBox: productData.inTheBox || null,
          warrantyPolicy: "Bảo hành toàn quốc",
        },
      });
    }

    logger.success("MYSQL", `Created product #${product.id}: ${productData.name}`);
    return product;
  } catch (error) {
    logger.error("MYSQL", `Failed to create product: ${error.message}`);
    throw error;
  }
}

// ===================== MAIN FLOW =====================

async function main() {
  try {
    console.log("\n╔════════════════════════════════════════════════════════╗");
    console.log("║      AUTO GENERATE PRODUCTS - POWERED BY AI & PEXELS   ║");
    console.log("╚════════════════════════════════════════════════════════╝\n");

    // Kiểm tra environment
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY not configured in .env");
    }

    // Fetch categories
    logger.log("INIT", "Fetching categories...");
    const categories = await getAllCategories();
    const selectedCategories =
      CATEGORY_LIMIT > 0 ? categories.slice(0, CATEGORY_LIMIT) : categories;

    if (selectedCategories.length === 0) {
      throw new Error("No active categories found. Please create categories first.");
    }

    logger.success("INIT", `Found ${categories.length} categories`);
    if (CATEGORY_LIMIT > 0) {
      logger.info("INIT", `Using first ${selectedCategories.length} categories for this run`);
    }
    selectedCategories.forEach((cat, i) => {
      logger.info("CATEGORY", `${i + 1}. ${cat.name} (ID: ${cat.id})`);
    });

    // Lấy supplier mặc định
    const defaultSupplier = await getDefaultSupplier();
    if (defaultSupplier) {
      logger.info("SUPPLIER", `Using supplier: ${defaultSupplier.name}`);
    }

    // Generate products từ AI cho mỗi category
    let totalCreated = 0;
    let totalFailed = 0;

    for (const category of selectedCategories) {
      logger.log("CATEGORY", `\n━━━ Processing category: "${category.name}" ━━━`);

      try {
        // Generate từ AI
        const aiProducts = await generateProductsFromAI(category.name, BATCH_SIZE);

        // Process từng product
        for (const aiProduct of aiProducts) {
          try {
            logger.log("PRODUCT", `\n--- Processing: "${aiProduct.name}" ---`);

            // Fetch images
            const images = await fetchProductImages(
              aiProduct.name,
              aiProduct.searchKeywords,
              IMAGES_PER_PRODUCT
            );

            if (images.length === 0) {
              logger.error("PRODUCT", `No images downloaded for "${aiProduct.name}", skipping...`);
              totalFailed++;
              continue;
            }

            // Save to database
            await createProductInDatabase(
              aiProduct,
              category.id,
              images,
              defaultSupplier?.id
            );

            totalCreated++;
            await sleep(1000); // Rate limiting between products
          } catch (error) {
            logger.error("PRODUCT", `Failed: ${error.message}`);
            totalFailed++;
          }
        }
      } catch (error) {
        logger.error("CATEGORY", `Error processing category: ${error.message}`);
      }

      await sleep(2000); // Rate limiting between categories
    }

    // Summary
    console.log("\n╔════════════════════════════════════════════════════════╗");
    console.log("║                      SUMMARY                           ║");
    console.log("╠════════════════════════════════════════════════════════╣");
    logger.success("DONE", `Total created: ${totalCreated}`);
    if (totalFailed > 0) {
      logger.error("DONE", `Total failed: ${totalFailed}`);
    }
    console.log("╚════════════════════════════════════════════════════════╝\n");
  } catch (error) {
    logger.error("FATAL", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run
main().catch((error) => {
  logger.error("FATAL", `Uncaught error: ${error.message}`);
  process.exit(1);
});
